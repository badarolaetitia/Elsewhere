# Discovery personalization tool

Elsewhere keeps two specialist agents. Discovery owns the taste-profile tool; Crowd continues to investigate area signals. This feature does not add a third model or another provider request.

## Inputs and weights

The client derives a profile from the current account's saves, visits and profile corrections:

- A saved checked venue contributes one point for each relevant checked offering. Weak signals from saves and highly rated venues are capped at three points per feature.
- An explicit like contributes six points at five stars, four at four stars, two at three stars, and one at lower ratings. A high venue rating without a recognized explicit like contributes only a weak offering-affinity signal, clearly described as an inference rather than a confirmed like.
- An explicit dislike contributes minus six points at one or two stars, or minus four otherwise. Weak saved interests do not cancel an explicit dislike. Conflicting strong feedback can balance out.
- A venue is counted once per collection. If it has a visit rating, its save is not also counted.
- The Profile page can set a trait to Prefer (+12), Prefer to avoid (-12), Don't use (0), or Use my activity (remove the correction). Corrections override inference.
- Only feature labels recorded in the source-checked pilot are used. Activity at unchecked or unrecognized venue IDs is ignored. Unsupported free text, private visit notes, price assumptions and invented atmosphere claims do not become recommendation facts.

## Agent flow

On every search, including searches opened from Saved or a direct results URL, the client reads the current profile. Discovery's `personalizeDiscovery` tool validates a bounded aggregate of up to 16 signals, then matches them only to candidate features with positive source-linked evidence. Each personalized candidate receives a short explanation identifying whether the signal came from saves, explicit feedback, high-rated places or an edited preference.

Required features and radius remain hard constraints. Optional current-request priorities and experience similarity sort before taste. Taste changes tie order; it does not replace the current request or alter the displayed experience score. Closest-first remains strictly in distance order. The area Coordinator's grouping key includes the taste tie-break so area estimates cannot undo a taste priority.

Updating a save, rating or correction rebuilds the profile. Mounted results reuse their existing search plan to apply an updated profile without another Gemini request. Deleting a rating or save removes its inferred signals. Manual corrections remain until edited or switched back to activity-based learning.

## Controls and privacy

Profile shows learned traits and their origins, allows corrections and supports adding any checked feature as an explicit preference. Personalization can be disabled from Profile or Discover. Disabling it sends an empty profile; saves and ratings remain available.

The corrected profile is a typed metadata record with ID `elsewhere:taste-settings:v1` in the existing private `saved` collection. It has no venue name/address and is excluded from `readSavedPlaces`, the saved-place count and its 30-place limit. Save/remove operations preserve this record. This uses the existing `user_items` table, pending-edit handling, owner-only RLS, guest import and account deletion without a SQL migration. Settings are isolated between accounts and sync using the existing account provider.

Only feature names, bounded weights, source categories and evidence counts enter the search request. The Gemini request reader still receives the public request and catalogue only; it does not receive the profile, saved history, ratings or private notes. No user's activity is used for anyone else's recommendations or to assert venue facts.

This is explainable weighted learning from explicit user activity, not a trained collaborative-filtering model, background location tracking or free-text review analysis.
