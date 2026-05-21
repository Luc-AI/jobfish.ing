# Backlog

Items deferred for later. Add new items with category, description, and why deferred.

---

## Data Quality

**Jobich null company**
The Jobich API sometimes returns `null` for `company`. Currently falling back to `'Unknown'`. Investigate why (scraping gap? data quality issue upstream?) and consider filtering these jobs out entirely or making `company` nullable end-to-end. See `src/trigger/lib/jobich.ts` → `normalizeJobichJob`.

---

## Cost Savings

**Location pre-filtering before LLM evaluation**
Location preferences are passed to the evaluation prompt but jobs are not pre-filtered by location before calling OpenRouter. Adding a pre-filter step (`preferences.locations` vs `jobs.location`) would cut unnecessary API calls for geographically irrelevant jobs. Deferred until LLM API costs become a concern and DB schema is stable.
