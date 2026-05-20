# Backlog

## Nice to Have

- **Jobich null company**: The Jobich API sometimes returns `null` for `company`. Currently falling back to `'Unknown'`. Investigate why (scraping gap? data quality issue upstream?) and consider filtering these jobs out entirely or making `company` nullable end-to-end. See `src/trigger/lib/jobich.ts` `normalizeJobichJob`.
