export function markdownPathToSlugs(segs: string[]) {
  if (segs.length === 0) return [];

  const out = [...segs];
  out[out.length - 1] = out[out.length - 1].replace(/\.md$/, '');
  if (out.length === 1 && out[0] === 'index') out.pop();
  return out;
}
