# Discovery Agent

The agent interprets a request and executes a bounded search against the reviewed West Village catalogue. It does not research the web, invent venue facts, estimate crowds or make reservations.

Example: “Somewhere like Via Carota, mainly for pasta, within 1 km.”

1. Resolve the reference venue and request. Exact venue names and exact feature details need no model call. Other wording can use one Gemini 2.5 Flash structured-output request, with a 12-second deadline and no retry loop.
2. Validate the plan against the actual checked venue IDs, recorded feature labels, allowed radii and ranking modes. Reject unknown fields of meaning; keep explicitly detected unsupported requirements visible. A model cannot replace an explicitly recognised reference, drop an explicitly named offering or widen a recognised radius.
3. Search the checked catalogue. Required offerings are strict source-evidence filters. Optional offerings break ties in declared order. The existing distance and fit calculations remain in code. All explanations and source links come from recorded evidence, not generated prose.
4. Return the results, interpreted request summary and completed execution stages. The interface uses plain customer language, without a simulated conversation or marketing claims about AI.
5. Reuse the validated plan for filter changes. Client resume envelopes must match the original query/details. Resume requests never call the model; invalid plans request a new search. A valid plan is only a public search filter, not an authentication or permission token.

Only the public venue names/aliases, available labels and the submitted query/details/priority order are sent for interpretation. Saved places, visits, account identity and learned taste are not sent to Gemini. Existing local personalisation can break ties after source-based filtering.

## Failure and ambiguity

A model error, quota error, invalid output or deadline falls back to a conservative plain parser. That parser recognises a named reference, explicit feature labels, closest ordering and 1/2/5 km radii. It asks for clarification rather than discarding wording it cannot safely interpret. It is not a replacement language model.

Requests for live crowding, unsupported vibe adjectives, dietary guarantees, exclusions, live table availability and unsupported radii ask for clarification. No claim of a venue being quiet or meeting an allergy requirement is inferred from missing evidence. The clarification form accepts a rewritten request.

## Runtime configuration

`GEMINI_API_KEY` is server-only: local `.env` or the existing hosting runtime binding. It must not be exposed as `EXPO_PUBLIC_*`. With no key, exact searches and supported plain-language templates continue to work. `/gemini` remains disabled; all interpretation goes through the guarded `/places` endpoint. Existing host IP/daily quotas still apply.

The structured output uses the existing supported `generateContent` REST API. Schema-constrained output is additionally validated in code. Documentation: https://ai.google.dev/gemini-api/docs/structured-output and https://ai.google.dev/api/generate-content.

## Validation

Automated tests cover invalid venue/feature output, dropped requirements, required evidence, unsupported requests, unavailable Gemini, reference/radius preservation and zero repeat model calls during filtering. Live local checks additionally exercised the configured Gemini connection. These are functionality checks, not a measured claim about language-understanding accuracy.

A Crowd Agent and a Taste Agent are not implemented by this change.
