const BREAK_AFTER = /[。！？!?…\n]/u;
const SOFT_BREAK = /[、,，\s]/u;

function pageBreakAt(text, limit) {
  const lowerBound = Math.floor(limit * 0.55);
  for (let index = Math.min(limit, text.length) - 1; index >= lowerBound; index -= 1) {
    if (BREAK_AFTER.test(text[index])) return index + 1;
  }
  for (let index = Math.min(limit, text.length) - 1; index >= lowerBound; index -= 1) {
    if (SOFT_BREAK.test(text[index])) return index + 1;
  }
  return Math.min(limit, text.length);
}

export function splitBubblePages(value, maxCharacters = 160) {
  const text = String(value || '').trim();
  const limit = Math.max(40, Number(maxCharacters) || 160);
  if (!text) return [];
  const pages = [];
  let rest = text;
  while (rest.length > limit) {
    const end = pageBreakAt(rest, limit);
    pages.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) pages.push(rest);
  return pages;
}
