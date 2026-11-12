// Languages a creator is comfortable making videos in. Shown at signup and on
// edit-profile, stored on the Creator and surfaced ONLY in the admin panel +
// CSV export (never on the brand side) — same treatment as the city field.
//
// Order: English + Hindi first (most common for content), then the remaining
// major Indian languages. Labels are the display + stored value (text[] column).

export const CREATOR_LANGUAGES: string[] = [
  "English",
  "Hindi",
  "Marathi",
  "Bengali",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Gujarati",
  "Punjabi",
  "Odia",
  "Assamese",
  "Urdu",
  "Konkani",
  "Maithili",
  "Nepali",
  "Kashmiri",
  "Sindhi",
  "Dogri",
  "Manipuri (Meitei)",
  "Bodo",
  "Santali",
  "Sanskrit",
  "Bhojpuri",
  "Rajasthani",
  "Haryanvi",
  "Tulu",
];

const VALID = new Set(CREATOR_LANGUAGES);

/** Keep only recognised languages, de-duplicated, in the canonical order above.
 *  Used to sanitise anything coming back from the API before rendering. */
export function sanitizeLanguages(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const picked = new Set<string>();
  for (const v of input) if (typeof v === "string" && VALID.has(v)) picked.add(v);
  return CREATOR_LANGUAGES.filter((l) => picked.has(l));
}
