/** Client-side prep + upload for landing-page hero banner VIDEOS. Videos never
 *  touch the API server: we validate in the browser, capture a first-frame
 *  poster on a canvas, then stream the file DIRECTLY to object storage via a
 *  short-lived presigned PUT. Shared by the creator and brand landing editors. */

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const ALLOWED_VIDEO = ["video/mp4"];
const MAX_BYTES = 50 * 1024 * 1024; // mirrors the server's presign guard
const POSTER_MAX_DIM = 1280;
const POSTER_QUALITY = 0.82;

export interface PreparedVideo {
  /** The original, validated video — uploaded as-is (no transcoding). */
  file: File;
  contentType: string;
  /** First-frame JPEG, shown instantly as the <video> poster. */
  poster: Blob;
}

/** Validates a picked video and grabs its first frame as a poster. Resolves
 *  with `{ error }` for anything the admin should fix — the caller shows it
 *  inline and never hits the network. */
export async function prepareBannerVideo(
  file: File
): Promise<PreparedVideo | { error: string }> {
  if (!ALLOWED_VIDEO.includes(file.type)) {
    return { error: "Only MP4 (H.264) video is allowed" };
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return { error: `Video is ${mb} MB — maximum is 50 MB` };
  }

  let poster: Blob;
  try {
    poster = await captureFirstFrame(file);
  } catch (e) {
    return { error: (e as Error).message };
  }

  return { file, contentType: file.type, poster };
}

function captureFirstFrame(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    let done = false;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };
    const fail = (msg: string) => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(msg));
    };

    video.onloadeddata = () => {
      // Nudge a hair past 0 so we decode a real frame, not a black pre-roll.
      try {
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
      } catch {
        fail("Could not read the video");
      }
    };
    video.onseeked = () => {
      if (done) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return fail("Could not read the video");
      try {
        const scale = Math.min(1, POSTER_MAX_DIM / Math.max(vw, vh));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vw * scale);
        canvas.height = Math.round(vh * scale);
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (b) => {
            done = true;
            cleanup();
            if (b) resolve(b);
            else reject(new Error("Could not create a poster image"));
          },
          "image/jpeg",
          POSTER_QUALITY
        );
      } catch {
        fail("Could not read the video");
      }
    };
    video.onerror = () => fail("Could not read the video");
  });
}

/** Uploads a prepared banner video (presigned PUT, direct to storage) plus its
 *  poster (via the shared public-image endpoint). Returns the stored URLs to
 *  save into the banner JSON. Throws on failure for the caller to surface. */
export async function uploadBannerVideo(
  prepared: PreparedVideo
): Promise<{ videoUrl: string; posterUrl: string }> {
  // 1) Poster — small JPEG, fine to proxy through the shared image endpoint.
  const posterForm = new FormData();
  posterForm.append("file", prepared.poster, "poster.jpg");
  const pr = await fetch(`${BASE_URL}/api/uploads/image`, { method: "POST", body: posterForm });
  if (!pr.ok) throw new Error("Poster upload failed — please try again");
  const posterJson = (await pr.json()) as { objectPath?: string };
  if (!posterJson.objectPath) throw new Error("Poster upload failed — please try again");

  // 2) Presigned PUT — the browser streams the video STRAIGHT to storage.
  const presign = await fetch(`${BASE_URL}/api/uploads/banner-video-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: prepared.file.size, contentType: prepared.contentType }),
  });
  if (!presign.ok) {
    const j = (await presign.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "Could not start the upload");
  }
  const { uploadURL, objectPath } = (await presign.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  // The presign signs `x-amz-acl` as a signed header, so the PUT MUST replay
  // `x-amz-acl: public-read` with that exact value or the signature won't match
  // (and the object must be public to stream back). Content-Type is unsigned
  // but harmless to send.
  const put = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": prepared.contentType, "x-amz-acl": "public-read" },
    body: prepared.file,
  });
  if (!put.ok) throw new Error("Video upload failed — please try again");

  return { videoUrl: objectPath, posterUrl: posterJson.objectPath };
}

/** Best-effort purge of a replaced/removed banner video + poster. Never throws
 *  — orphan cleanup must not block the editor. */
export async function purgeBannerMedia(urls: Array<string | undefined>): Promise<void> {
  const list = urls.filter((u): u is string => !!u);
  if (list.length === 0) return;
  try {
    await fetch(`${BASE_URL}/api/uploads/banner-media/purge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: list }),
    });
  } catch {
    /* best-effort */
  }
}
