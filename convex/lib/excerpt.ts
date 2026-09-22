function collapseWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function excerptIsVerbatim(source: string, excerpt: string) {
  const needle = collapseWhitespace(excerpt);

  if (needle.length < 12) {
    return false;
  }

  return collapseWhitespace(source).includes(needle);
}
