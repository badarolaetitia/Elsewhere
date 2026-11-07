# NYC venue dataset research

Research date: November 7, 2026. This is a source assessment, not a completed or integrated demo dataset.

## Recommended backbone

Use NYC Department of Health and Mental Hygiene's **DOHMH New York City Restaurant Inspection Results**, dataset ID `43nn-pn8j`.

- Dataset: https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j/about_data
- JSON API: https://data.cityofnewyork.us/resource/43nn-pn8j.json
- Metadata: https://data.cityofnewyork.us/api/views/43nn-pn8j.json
- NYC Open Data public policies: https://cityofnewyork.github.io/opendatatsm/publicpolicies.html

Confirmed fields include CAMIS establishment ID, trading name, borough, street address, ZIP code, cuisine description, latitude, longitude, inspection date and record date. Retain the source dataset ID and CAMIS ID for provenance and stable venue identity.

The source consists of inspection/violation records, not a clean one-row-per-venue catalog. Deduplicate by CAMIS and reconcile changes in names or addresses. Its inspection scores and grades are health-inspection results; never use them as experience-match scores, customer ratings or crowding signals. An inspection record alone does not establish that a venue is currently open.

## Live sample check

The official metadata and JSON endpoints returned HTTP 200. A 1,000-row sample fetched during this research contained:

- 986 distinct CAMIS IDs;
- 187 rows without cuisine descriptions;
- 64 rows with missing or zero latitude/longitude;
- sample record dates of November 6, 2026.

These figures describe this sample only, not the whole dataset. They demonstrate why deduplication, coordinate checks and enrichment are necessary. Raw samples are kept outside the repository and are not loaded by the app.

## What must be added

The inspected schema has no official website, menu items, atmosphere, price band, opening hours, live availability or crowd reports. Borough and NTA fields should not be presented as checked neighborhood labels.

For the first 40–60 demo venues across 6–8 neighborhoods:

1. Select real establishments with usable coordinates and diverse cuisine/category coverage.
2. Check current identity, address and operating status against the venue's own website.
3. Add the official website and menu links. Record supporting sources and check dates for each specific offering or atmosphere claim.
4. Leave unsupported attributes unknown. Do not generate offerings or quietness labels from a cuisine category or a venue name.
5. Have each teammate check 20–30 entries, then cross-review the other person's entries.

Suggested records should contain a stable ID, source CAMIS ID, name, borough, checked neighborhood, address, coordinates, cuisine, official website, supported offerings and atmosphere attributes, per-claim evidence, check dates and review status. Crowd reports belong in a separate timestamped evidence store; the venue dataset should not contain invented baseline crowd levels or booking availability.

## Other sources considered

OpenStreetMap can supplement location, website and cuisine information, but coverage varies and it does not supply reliable live crowding. Its ODbL attribution and database redistribution requirements must be accounted for if its data is incorporated: https://www.openstreetmap.org/copyright

Official restaurant websites are the enrichment source for the initial demo. Extract supported factual attributes rather than republishing entire menus, photographs or reviews. Preserve links and check dates.

## Reuse and next step

NYC Open Data publishes public-use policies and references NYC.gov and agency-specific terms. The inspected dataset metadata did not specify a named license, so do not label this dataset CC0, MIT or CC BY. Preserve source, retrieval date and transformation information when publishing a derived snapshot.

Next deliverable: a cleaned candidate list and evidence-backed review workflow, followed by a checked JSON demo dataset. No search-provider replacement, runtime dataset integration or crowd-data integration has been implemented by this research.
