# Backlog

Items deferred for later. Add new items with category, description, and why deferred.

---

## Bugs

**Evaluation failure alerting — failures going unnoticed**
Per-job errors in `evaluate-jobs` are currently logged and counted but never surfaced. OpenRouter errors, JSON parse failures, and other per-user/per-job failures accumulate silently — only visible if you actively check the Trigger.dev run logs. Add a monitoring layer: at minimum, alert (Sentry, email, or Trigger.dev notification) when the failure rate in a single run exceeds a threshold (e.g. >20% of jobs fail). Consider also a daily summary of evaluation health. Sentry DSN is already configured in `.env.local`.

**evaluate-jobs: "Unterminated string in JSON" on some jobs**
Occasional parse failure during evaluation: `Unterminated string in JSON at position 103 (line 3 column 86)`. Seen on job `e88c4b20-8ea8-47d2-ad2a-aa3d7c714181`. Likely the LLM response is being truncated or contains a control character that breaks `JSON.parse`. Investigate `parseEvaluationResponse` in `src/trigger/lib/evaluate.ts` — add defensive parsing and log the raw response when it fails.

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

## UX

**Meaningful toast notifications across the app**
No consistent toast/notification layer exists. Auth flows (login, sign-up, password reset), form submissions, and async operations fail silently or show inline errors only. Add a toast system (e.g. sonner) and wire up success/error toasts on: login, sign-up, onboarding steps, settings saves, and any async action that can fail. When editing UI/UX, always consider whether the change affects user feedback paths and update toasts accordingly.

**Dashboard sort options — newest, highest-scoring, recommended [IMPORTANT]**
The dashboard currently has no sort controls. Add at minimum three sort modes: (1) **Newest** — sort by `jobs.posted_at` desc, (2) **Highest** — sort by evaluation score desc, (3) **Recommended** — a weighted blend of score + recency (e.g. decaying score over age). Recommended should be the default. Needs design decision on whether sort state is persisted (user preference) or ephemeral (session/URL param). Deferred — needs UI design pass on the sort control placement and the recommendation ranking formula.

**Restore Geoapify location picker (nice-to-have)**
Location input was previously backed by a Geoapify autocomplete picker but was removed or broke at some point. Restore city/country autocomplete using the `GEOAPIFY_API_KEY` already in `.env.local` and the existing `/api/geoapify/autocomplete` route. Deferred — free-text location entry works for now.

**Location radius / commute tolerance (nice-to-have)**
Instead of specifying exact regions, users should be able to express how far they're willing to commute — either as a distance radius (e.g. 30 km) or a time budget (e.g. 45 min). The system would then resolve that into eligible locations automatically, so no relevant job slips through because the user didn't think to list a particular suburb or city. Needs a geocoding step (Geoapify key is already in `.env.local`) to convert the user's home location + radius into a set of matched regions, fed into the evaluation prompt or pre-filter. Deferred — depends on stable location schema and restored location picker (see above).

---

## Cost Savings

**Location pre-filtering before LLM evaluation**
Location preferences are passed to the evaluation prompt but jobs are not pre-filtered by location before calling OpenRouter. Adding a pre-filter step (`preferences.locations` vs `jobs.location`) would cut unnecessary API calls for geographically irrelevant jobs. Deferred until LLM API costs become a concern and DB schema is stable.
