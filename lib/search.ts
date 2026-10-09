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
