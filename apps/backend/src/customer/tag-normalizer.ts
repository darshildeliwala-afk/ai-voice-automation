/**
 * Canonicalizes a raw tag string so "HOT LEAD", "hot lead", and "Hot Lead"
 * all collapse to the same stored value ("Hot Lead") -- deterministic on
 * content, not on which variant happened to arrive first, which is what
 * makes Set-based dedup in CustomerTagService work without a
 * first-seen-wins race (Sprint 19).
 */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
