import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import crypto from "crypto";

const router: IRouter = Router();

// ─── In-memory CSRF state store ────────────────────────────────────────────────

const oauthStates = new Map<string, number>(); // state → expiresAt
const STATE_TTL = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of oauthStates) {
    if (exp < now) oauthStates.delete(k);
  }
}, 60_000);

// ─── One-time column migration ─────────────────────────────────────────────────

let columnEnsured = false;
async function ensureProfilePicColumn() {
  if (columnEnsured) return;
  try {
    await pool.query(
      `ALTER TABLE "OauthSession" ADD COLUMN IF NOT EXISTS "profilePictureUrl" TEXT`
    );
    columnEnsured = true;
  } catch (err: any) {
    // Column may already exist — ignore
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing environment variable: ${key}`);
  return val;
}

function frontendSignupUrl(req: Request): string {
  // Derive from host so it works in both dev (Replit proxy) and production
  const proto = req.headers["x-forwarded-proto"] as string ?? req.protocol;
  const host = req.headers["x-forwarded-host"] as string ?? req.get("host") ?? "localhost";
  return `${proto}://${host}/signup-creator`;
}

// ─── 1. Initiate Meta / Facebook OAuth ────────────────────────────────────────

router.get("/auth/meta", (req: Request, res: Response): void => {
  try {
    const clientId = requireEnv("META_APP_ID");
    const redirectUri = requireEnv("META_REDIRECT_URI");

    const state = crypto.randomBytes(20).toString("hex");
    oauthStates.set(state, Date.now() + STATE_TTL);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "instagram_basic,pages_show_list",
      response_type: "code",
      state,
    });

    req.log.info({ scope: "instagram_basic,pages_show_list" }, "Initiating Meta OAuth");
    res.redirect(`https://www.facebook.com/v20.0/dialog/oauth?${params}`);
  } catch (err: any) {
    req.log.error({ err: err.message }, "Meta OAuth initiation failed — env vars missing");
    res.status(500).json({ error: "Instagram OAuth is not configured on this server", detail: err.message });
  }
});

// ─── 2. Meta OAuth Callback ────────────────────────────────────────────────────

router.get("/auth/meta/callback", async (req: Request, res: Response): Promise<void> => {
  await ensureProfilePicColumn();
  const signupUrl = frontendSignupUrl(req);

  const {
    code,
    state,
    error: oauthError,
    error_description,
  } = req.query as Record<string, string>;

  req.log.info(
    { hasCode: !!code, state: state?.slice(0, 8), oauthError },
    "Meta OAuth callback received"
  );

  // User cancelled or Meta returned an error
  if (oauthError || !code) {
    req.log.warn({ oauthError, error_description }, "Meta OAuth cancelled or denied");
    res.redirect(`${signupUrl}?ig_error=cancelled`);
    return;
  }

  // Validate CSRF state
  const stateExpiry = oauthStates.get(state);
  if (!stateExpiry || stateExpiry < Date.now()) {
    req.log.warn({ state }, "Invalid or expired OAuth state");
    res.redirect(`${signupUrl}?ig_error=invalid_state`);
    return;
  }
  oauthStates.delete(state);

  try {
    const clientId = requireEnv("META_APP_ID");
    const clientSecret = requireEnv("META_APP_SECRET");
    const redirectUri = requireEnv("META_REDIRECT_URI");

    // ── Step A: Exchange code for user access token ──────────────────────────

    req.log.info("Exchanging code for Meta user access token");
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?${tokenParams}`
    );
    const tokenData = await tokenRes.json() as any;

    if (!tokenRes.ok || tokenData.error) {
      req.log.error({ status: tokenRes.status, tokenData }, "Meta token exchange failed");
      res.redirect(`${signupUrl}?ig_error=token_failed`);
      return;
    }

    const userAccessToken = tokenData.access_token as string;
    req.log.info("Meta user access token obtained successfully");

    // ── Step B: Fetch Facebook Pages (id, name, page access_token only) ────────

    req.log.info("Fetching Facebook pages for user");
    const pagesRes = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`
    );
    const pagesData = await pagesRes.json() as any;

    req.log.info(
      { status: pagesRes.status, pageCount: pagesData.data?.length ?? 0, pagesData },
      "Facebook pages raw response"
    );

    if (!pagesRes.ok || pagesData.error) {
      req.log.error({ status: pagesRes.status, pagesData }, "Failed to fetch Facebook pages");
      res.redirect(`${signupUrl}?ig_error=no_pages`);
      return;
    }

    const pages: any[] = pagesData.data ?? [];
    req.log.info({ pageCount: pages.length, pageIds: pages.map((p: any) => p.id) }, "Fetched Facebook pages");

    if (pages.length === 0) {
      req.log.warn(
        { hint: "Instagram Business/Creator accounts must be linked to a Facebook Page" },
        "Zero Facebook Pages on this account — user may be logged in with wrong Facebook account, or has no Pages"
      );
      res.redirect(`${signupUrl}?ig_error=no_facebook_pages`);
      return;
    }

    // ── Step C: For each page, query instagram_business_account via page token ──
    // instagram_business_account is NOT returned inline in /me/accounts —
    // it must be fetched separately per page using that page's own access token.

    let igAccountId: string | null = null;
    let tokenForIg: string = userAccessToken;

    for (const page of pages) {
      const pageToken = (page.access_token as string) ?? userAccessToken;
      req.log.info({ pageId: page.id, pageName: page.name }, "Querying instagram_business_account for page");

      const pageIgRes = await fetch(
        `https://graph.facebook.com/v20.0/${page.id}?fields=instagram_business_account&access_token=${pageToken}`
      );
      const pageIgData = await pageIgRes.json() as any;

      req.log.info(
        { pageId: page.id, status: pageIgRes.status, pageIgData },
        "Page instagram_business_account response"
      );

      if (pageIgData.instagram_business_account?.id) {
        igAccountId = pageIgData.instagram_business_account.id as string;
        tokenForIg = pageToken;
        req.log.info(
          { pageId: page.id, pageName: page.name, igAccountId },
          "Found Instagram Business account linked to Facebook Page"
        );
        break;
      }
    }

    // ── Fallback A: /me/instagram_accounts ────────────────────────────────────

    if (!igAccountId) {
      req.log.info("No IG Business account found via pages — trying /me/instagram_accounts");
      const igListRes = await fetch(
        `https://graph.facebook.com/v20.0/me/instagram_accounts?access_token=${userAccessToken}`
      );
      const igListData = await igListRes.json() as any;
      req.log.info({ status: igListRes.status, igListData }, "/me/instagram_accounts response");
      if (igListData.data?.length > 0) {
        igAccountId = igListData.data[0].id as string;
        req.log.info({ igAccountId }, "Found IG account via /me/instagram_accounts");
      }
    }

    // ── Fallback B: /me on graph.instagram.com (instagram_basic scope) ────────

    if (!igAccountId) {
      req.log.info("Trying graph.instagram.com/me with user access token (instagram_basic scope)");
      const igMeRes = await fetch(
        `https://graph.instagram.com/me?fields=id,username,followers_count,profile_picture_url&access_token=${userAccessToken}`
      );
      const igMeData = await igMeRes.json() as any;
      req.log.info({ status: igMeRes.status, igMeData }, "graph.instagram.com/me response");
      if (igMeRes.ok && igMeData.id && !igMeData.error) {
        // Directly use this data — skip Step D
        const instagramUsername = (igMeData.username as string ?? "").toLowerCase();
        const followersCount = (igMeData.followers_count as number) ?? 0;
        const profilePictureUrl = (igMeData.profile_picture_url as string) ?? null;
        req.log.info(
          { instagramUsername, followersCount, hasProfilePic: !!profilePictureUrl },
          "Instagram profile fetched via instagram_basic fallback"
        );
        const existing2 = await pool.query(
          `SELECT id FROM "Creator" WHERE LOWER("instagramHandle") = $1`,
          [instagramUsername]
        );
        if (existing2.rows.length > 0) {
          req.log.warn({ instagramUsername }, "Instagram handle already registered on Collabry");
          res.redirect(`${signupUrl}?ig_error=already_registered`);
          return;
        }
        await pool.query(
          `UPDATE "OauthSession" SET used = true WHERE "instagramId" = $1 AND used = false`,
          [igMeData.id]
        );
        const expiresAt2 = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const sessionResult2 = await pool.query(
          `INSERT INTO "OauthSession" (id, "instagramId", "instagramHandle", "followerCount", "profilePictureUrl", "expiresAt", used, "createdAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, false, NOW())
           RETURNING id`,
          [igMeData.id, instagramUsername, followersCount, profilePictureUrl, expiresAt2]
        );
        const sessionId2 = sessionResult2.rows[0].id as string;
        req.log.info({ sessionId: sessionId2, instagramUsername }, "OAuth session created via instagram_basic — redirecting");
        res.redirect(`${signupUrl}?ig_session=${sessionId2}`);
        return;
      }
    }

    if (!igAccountId) {
      req.log.warn(
        { pageCount: pages.length },
        "No Instagram account found after all fallbacks — user may not have a Business/Creator account"
      );
      res.redirect(`${signupUrl}?ig_error=no_instagram_business`);
      return;
    }

    // ── Step D: Fetch Instagram Business profile details ──────────────────────

    req.log.info({ igAccountId, usingPageToken: tokenForIg !== userAccessToken }, "Fetching Instagram profile details");
    const igRes = await fetch(
      `https://graph.facebook.com/v20.0/${igAccountId}?fields=username,followers_count,profile_picture_url&access_token=${tokenForIg}`
    );
    const igData = await igRes.json() as any;

    req.log.info({ status: igRes.status, igData }, "Instagram profile raw response");

    if (!igRes.ok || igData.error) {
      req.log.error({ status: igRes.status, igData }, "Failed to fetch Instagram profile details");
      res.redirect(`${signupUrl}?ig_error=profile_failed`);
      return;
    }

    const instagramUsername = (igData.username as string ?? "").toLowerCase();
    const followersCount = (igData.followers_count as number) ?? 0;
    const profilePictureUrl = (igData.profile_picture_url as string) ?? null;

    req.log.info(
      { instagramUsername, followersCount, hasProfilePic: !!profilePictureUrl },
      "Instagram Business profile fetched successfully"
    );

    // ── Step E: Check handle not already registered ───────────────────────────

    const existing = await pool.query(
      `SELECT id FROM "Creator" WHERE LOWER("instagramHandle") = $1`,
      [instagramUsername]
    );
    if (existing.rows.length > 0) {
      req.log.warn({ instagramUsername }, "Instagram handle already registered on Collabry");
      res.redirect(`${signupUrl}?ig_error=already_registered`);
      return;
    }

    // ── Step F: Expire old sessions for this IG account ──────────────────────

    await pool.query(
      `UPDATE "OauthSession" SET used = true WHERE "instagramId" = $1 AND used = false`,
      [igAccountId]
    );

    // ── Step G: Create new OAuth session (24h) ────────────────────────────────

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const sessionResult = await pool.query(
      `INSERT INTO "OauthSession" (id, "instagramId", "instagramHandle", "followerCount", "profilePictureUrl", "expiresAt", used, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, false, NOW())
       RETURNING id`,
      [igAccountId, instagramUsername, followersCount, profilePictureUrl, expiresAt]
    );

    const sessionId = sessionResult.rows[0].id as string;
    req.log.info({ sessionId, instagramUsername, followersCount }, "OAuth session created — redirecting to signup");

    res.redirect(`${signupUrl}?ig_session=${sessionId}`);
  } catch (err: any) {
    req.log.error({ err: err.message, stack: err.stack }, "Meta OAuth callback threw an error");
    res.redirect(`${frontendSignupUrl(req)}?ig_error=server_error`);
  }
});

// ─── 3. Retrieve OAuth Session Data ───────────────────────────────────────────

router.get("/auth/instagram/session", async (req: Request, res: Response): Promise<void> => {
  await ensureProfilePicColumn();
  const { id } = req.query as { id?: string };

  if (!id) {
    res.status(400).json({ error: "Session ID required" });
    return;
  }

  const result = await pool.query(
    `SELECT "instagramHandle", "followerCount", "profilePictureUrl", "expiresAt", used
     FROM "OauthSession" WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const session = result.rows[0];

  if (session.used || new Date(session.expiresAt) < new Date()) {
    res.status(404).json({ error: "Session expired or already used" });
    return;
  }

  res.json({
    instagramHandle: session.instagramHandle,
    followerCount: session.followerCount,
    profilePictureUrl: session.profilePictureUrl ?? null,
    expiresAt: session.expiresAt,
  });
});

// ─── 4. Legacy alias — redirect old routes to new Meta ones ──────────────────

router.get("/auth/instagram", (_req: Request, res: Response): void => {
  res.redirect("/api/auth/meta");
});

export default router;
