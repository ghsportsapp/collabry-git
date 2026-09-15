import { pool } from "@workspace/db";

/**
 * Compiles the seven creator filters the brand filter bar emits into SQL
 * conditions against a Creator alias.
 *
 * Param names and matching semantics are deliberately identical to
 * /brand/search/creators-all (OR within a filter, AND across filters; audience
 * fields matched by substring, state exact), so one frontend filter bar can
 * drive search and the campaign applicant lists without translation.
 *
 * Conditions are returned rather than applied, so the caller can AND them into
 * whatever WHERE it already has — and so the same set can feed both a COUNT and
 * a paged list query in Phase 3.
 */

export interface BuiltCreatorFilters {
  conditions: string[];
  params: unknown[];
}

/** Express gives a bare string for one value and an array for repeats. */
function list(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as string[]).map(String) : [String(value)];
}

/**
 * @param alias   SQL alias of the Creator table in the caller's query.
 * @param startIndex how many bind params the caller already uses, so the
 *                   placeholders returned here continue that numbering.
 */
export async function buildCreatorFilters(
  query: Record<string, unknown>,
  alias: string,
  startIndex: number,
): Promise<BuiltCreatorFilters> {
  const params: unknown[] = [];
  const conditions: string[] = [];
  const push = (v: unknown): string => { params.push(v); return `$${startIndex + params.length}`; };

  // Followers — OR across the selected slabs.
  const slabIds = list(query["slabId"]);
  if (slabIds.length > 0) {
    const slabs = await pool.query(
      `SELECT "minFollowers","maxFollowers" FROM "FollowerSlab" WHERE id=ANY($1::text[])`,
      [slabIds]
    );
    const ors: string[] = [];
    for (const row of slabs.rows) {
      const min = push(row.minFollowers);
      if (row.maxFollowers !== null) {
        const max = push(row.maxFollowers);
        ors.push(`(${alias}."followerCount" >= ${min} AND ${alias}."followerCount" <= ${max})`);
      } else {
        ors.push(`(${alias}."followerCount" >= ${min})`);
      }
    }
    if (ors.length > 0) conditions.push(`(${ors.join(" OR ")})`);
  }

  // Category — alias the inner join (fcc/fcat) so it can't collide with a
  // CreatorCategory join the caller already has in scope.
  const cats = list(query["category"]);
  if (cats.length > 0) {
    const p = push(cats);
    conditions.push(
      `EXISTS (SELECT 1 FROM "CreatorCategory" fcc WHERE fcc."creatorId"=${alias}.id AND fcc."categoryId"=ANY(${p}::text[]))`
    );
  }

  // Creator age — buckets like "18-24" or "45+", resolved off dateOfBirth.
  const creatorAges = list(query["creatorAge"]);
  if (creatorAges.length > 0) {
    const ors: string[] = [];
    for (const bucket of creatorAges) {
      const m = bucket.match(/^(\d+)(?:-(\d+))?(\+)?$/);
      if (!m) continue;
      const lo = push(parseInt(m[1]!, 10));
      const hi = push(m[2] ? parseInt(m[2], 10) : 999);
      ors.push(`(EXTRACT(YEAR FROM AGE(NOW(), ${alias}."dateOfBirth")) BETWEEN ${lo} AND ${hi})`);
    }
    if (ors.length > 0) conditions.push(`(${ors.join(" OR ")})`);
  }

  // Creator gender — "Other" means anything set that isn't male/female.
  const genders = list(query["creatorGender"]).map(g => g.toLowerCase());
  if (genders.length > 0) {
    const ors: string[] = [];
    if (genders.includes("male")) ors.push(`LOWER(${alias}.gender) = 'male'`);
    if (genders.includes("female")) ors.push(`LOWER(${alias}.gender) = 'female'`);
    if (genders.includes("other")) ors.push(`(LOWER(${alias}.gender) NOT IN ('male','female') AND ${alias}.gender IS NOT NULL)`);
    if (ors.length > 0) conditions.push(`(${ors.join(" OR ")})`);
  }

  // Audience age / location — stored as free text, so matched by substring.
  for (const key of ["audienceAge", "audienceLocation"] as const) {
    const values = list(query[key]);
    if (values.length === 0) continue;
    const ors = values.map(v => `${alias}."${key}" ILIKE ${push(`%${v}%`)}`);
    conditions.push(`(${ors.join(" OR ")})`);
  }

  // Creator state — exact match.
  const states = list(query["creatorState"]);
  if (states.length > 0) {
    const ors = states.map(st => `${alias}.state = ${push(st)}`);
    conditions.push(`(${ors.join(" OR ")})`);
  }

  return { conditions, params };
}
