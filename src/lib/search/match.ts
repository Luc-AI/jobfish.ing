export interface Searchable {
  title: string
  company: string
  location: string | null
  categories: string[] | null
}

export function parseTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 6)
}

export function matchesAllTokens(row: Searchable, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  const haystack = [
    row.title.toLowerCase(),
    row.company.toLowerCase(),
    (row.location ?? '').toLowerCase(),
    (row.categories ?? []).join(' ').toLowerCase(),
  ].join(' ')
  return tokens.every((t) => haystack.includes(t))
}
