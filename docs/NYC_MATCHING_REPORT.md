# NYC dataset identity matching and West Village pilot

Checked November 7, 2026. Identity agreement is not proof of current opening status or of a menu offering.

## Matching results

Compared the downloaded MongoDB Hugging Face JSON with a current official DOHMH snapshot containing 31,463 distinct CAMIS IDs.

| Outcome | Records |
| --- | ---: |
| Hugging Face input | 25,361 |
| No matching CAMIS in the official snapshot | 18,460 |
| Matching CAMIS | 6,901 |
| Same CAMIS, normalized name and address, with usable NYC coordinates | 4,375 |
| Matching CAMIS but name/address disagreement needing review | 2,504 |
| Same identity but missing/out-of-range coordinates | 22 |
| Conservative matches in ZIP codes 10012 and 10014 | 187 |
| Full identity intersection inside West Village NTA MN0203 | 96 |
| Venues with source-backed offerings or experiences enabled for discovery | 66 |

A missing ID does not establish that a business has closed. No-ID and changed-name/address records are excluded rather than guessed. Matching normalizes punctuation, accents, street abbreviations and numeric street ordinals; it requires the same CAMIS, name, building, street and ZIP. Coordinates come from the official snapshot and pass a NYC bounds check, not a manual map survey.

Counts and input SHA-256 fingerprints are in `data/research/nyc-match-summary.json`. The 187-place identity review list is `data/research/downtown-identity-matches.csv`. This list is not the runtime dataset and contains no imported menus, ratings, prices, atmosphere or crowd predictions.

## First pilot

The catalogue retains all 96 identity matches inside NYC’s West Village NTA (MN0203), a reproducible statistical boundary. All 96 received a primary-source review. Discovery is enabled for 66 with independently sourced offerings or experiences. The other 30 remain identity records only; unsupported fields are omitted and they cannot be recommended as menu matches. See [the full venue-by-venue report](WEST_VILLAGE_SOURCE_REVIEW.md) for sources, unresolved records and address conflicts. A published offering is not a guarantee of current stock or availability.

Each venue's feature evidence and website are in `src/data/nyc-pilot-venues.json`. Unsupported fields are omitted from the runtime records and source-detail cards. No allergy, dietary-safety, price, wait-time, current stock or reservation-availability claims are accepted from these checks.

## Why raw enrichment was excluded

The Hugging Face data contains unsupported menu combinations. For example, its Dominique Ansel record lists Filet Mignon and Boeuf Bourguignon. The bakery's official site and linked menu document pastry products. This does not prove those dishes have never been served, but the dataset provides no evidence that supports importing them as current offerings. All raw HF menus, atmosphere, ratings, review counts, price fields and embeddings were therefore excluded from this pilot.

## Runtime behavior

The public `/places` route resolves names against the 96 bundled identities, but only the 66 with separately sourced offerings enter discovery and does not use live place search. Gemini can interpret the request, but cannot add venue facts. Unlisted or ambiguous names return a clear pilot-coverage message. Feature selection requires recorded evidence. Missing evidence excludes a venue from a requested feature; it does not establish that the venue lacks that offering. Match scores are deterministic comparisons of documented feature overlap, not measured quality or model accuracy. No popularity or independence statistics are available in this pilot. The interface offers Best match and Closest; unsupported local/hidden/popular distinctions are not offered.

The Discovery Agent now interprets natural-language requests into validated venue IDs, feature labels, distance and preference ordering. A plain-search fallback handles simple requests if Gemini is unavailable. Existing saves, ratings, plans and account sync remain available. A future crowd agent can consume the stable `nyc-dohmh:<CAMIS>` venue IDs without inventing a baseline crowd level.

## Sources and reproduction

- MongoDB dataset and declared Apache 2.0 license: https://huggingface.co/datasets/MongoDB/whatscooking.restaurants
- Official DOHMH dataset: https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j/about_data
- NYC public-use policies: https://cityofnewyork.github.io/opendatatsm/publicpolicies.html
- Venue sources: recorded per feature in the pilot JSON.

The runtime JSON includes selected factual identity data, website links and paraphrased source assertions; it does not redistribute the full HF dataset. Preserve source attribution and check dates when extending it. Raw downloaded snapshots are outside Git.

Run `python3 scripts/match-nyc-venues.py <hf-json> <official-json> <output-directory>` against the recorded snapshots to reproduce identity counts. The source-check selection is a separate manual review; the matching script does not verify menus. New snapshots may produce different counts.

## Full neighbourhood selection

The complete identity list is `data/research/west-village-identity-matches.csv`; the official boundary is preserved in `data/research/west-village-boundary.geojson`. Run `python3 scripts/build-west-village-pilot.py <exact-matches.json> <nta-json>` after the identity matcher. Point-in-polygon uses the outer ring minus any holes. All 96 records are included, including licensed bars, cafes, caterers and cinema food concessions; registry inclusion alone is not a claim of a sit-down restaurant or current opening status.

Registry cuisine remains an identity-record attribute; it is not exposed as a verified experience keyword or used to prove a dish, atmosphere or service. Websites and menu claims are omitted unless separately sourced. No HF menu or atmosphere field is treated as verified by identity agreement.

Boundary source: https://data.cityofnewyork.us/resource/9nt8-h7nd.json?nta2020=MN0203

The build applies the checked review with `python3 scripts/apply-venue-reviews.py`. Rebuilding the geographic intersection also reapplies that review. It does not copy unverified HF attributes or resurrect the old category-only feature labels.
