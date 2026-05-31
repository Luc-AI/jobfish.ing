// src/lib/companies/normalize.ts
// Pure normalization for company-name matching. Lowercases, strips punctuation
// and trailing legal-form suffixes, and collapses whitespace.

// 'company' also strips descriptive uses ("3M Company" -> "3m", "Good Company"
// -> "good"); accepted tradeoff — for dedup, over-matching is safer than
// missing a duplicate.
const LEGAL_SUFFIXES = new Set([
  'gmbh', 'ag', 'llc', 'inc', 'ltd', 'limited', 'sa', 'sarl', 'sàrl',
  'co', 'corp', 'corporation', 'company', 'plc', 'bv', 'oy', 'oyj', 'aps', 'kg',
  'ohg', 'se', 'srl', 'spa', 'nv',
])

export function normalizeCompanyName(raw: string | null | undefined): string {
  if (!raw) return ''
  // Lowercase, replace any non-letter/non-digit/non-space with a space,
  // then collapse whitespace. Unicode-aware so accented letters survive.
  const s = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return ''

  const tokens = s.split(' ')
  // Strip trailing legal-form tokens (handles "Foo Co Ltd" -> "foo"),
  // but never reduce to zero tokens.
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop()
  }
  return tokens.join(' ')
}
