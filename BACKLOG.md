# Backlog

Items deferred for later. Add new items with category, description, and why deferred.

---

## Data Quality

**Jobich null company**
The Jobich API sometimes returns `null` for `company`. Currently falling back to `'Unknown'`. Investigate why (scraping gap? data quality issue upstream?) and consider filtering these jobs out entirely or making `company` nullable end-to-end. See `src/trigger/lib/jobich.ts` → `normalizeJobichJob`.

---

## Improvements

**Pre-filter role matching is too strict (silent job loss)**
The title pre-filter uses exact substring matching (`title.includes(role)`). This silently drops relevant jobs before they reach the LLM — e.g. `"Product Manager"` won't match `"Senior PM"`, `"Head of Product"`, or `"CPO"`. Two options to fix:
- **Short-term**: expand role aliases in the role picker (user picks "Product Manager" → system also matches `["PM", "Product Lead", "Head of Product"]`)
- **Long-term**: remove title pre-filtering entirely and let the LLM score all jobs — with mandatory target roles the prompt already steers relevance scoring, and that's what the LLM is good at

---

## Compliance

**Resend Audiences — CAN-SPAM / unsubscribe compliance**
The current email digest has no unsubscribe link. For legal compliance (CAN-SPAM, GDPR), commercial transactional/marketing emails must include an opt-out mechanism. Current workaround: the in-app toggle at `/notifications` serves this role for a personal app but is not visible from the email itself. When user base grows or the product becomes commercial, migrate to Resend Audiences: add recipients as contacts, enable Resend's managed unsubscribe URL, and sync unsubscribe events back to `profiles.notifications_enabled`. Deferred because current scale is personal/beta and the in-app toggle is sufficient.

---

## Cost Savings

**Location pre-filtering before LLM evaluation**
Location preferences are passed to the evaluation prompt but jobs are not pre-filtered by location before calling OpenRouter. Adding a pre-filter step (`preferences.locations` vs `jobs.location`) would cut unnecessary API calls for geographically irrelevant jobs. Deferred until LLM API costs become a concern and DB schema is stable.
