export function splitSearchTerms(value: string) {
  return [
    ...new Set(
      String(value || "")
        .split(/[\s,;]+/)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ];
}

export function multipleSkuTerms(value: string) {
  const terms = splitSearchTerms(value);
  if (
    terms.length < 2 ||
    !terms.every((term) => /\d/.test(term) && /^[\p{L}\p{N}._/-]+$/u.test(term))
  )
    return [];
  return terms.map((term) => term.toLocaleLowerCase("pt-BR"));
}

export function missingSkuTerms(value: string, foundValues: unknown[]) {
  if (!multipleSkuTerms(value).length) return [];
  const found = new Set(
    foundValues
      .map((item) =>
        String(item ?? "")
          .trim()
          .toLocaleLowerCase("pt-BR"),
      )
      .filter(Boolean),
  );
  const seen = new Set<string>();
  return splitSearchTerms(value).filter((term) => {
    const normalized = term.toLocaleLowerCase("pt-BR");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return !found.has(normalized);
  });
}
