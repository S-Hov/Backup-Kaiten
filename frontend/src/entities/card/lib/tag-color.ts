/** Source palette IDs stay stable across views; absent/unknown colors use a stable fallback. */
export function tagColor(color: string | null, tagId: string): number {
  if (color && /^(?:[1-9]|1[0-7])$/.test(color)) return Number(color);
  let hash = 0;
  for (const char of color || tagId)
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % 17) + 1;
}
