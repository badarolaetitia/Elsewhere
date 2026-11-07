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

## Hugging Face follow-up

Inspected Hugging Face repository metadata, cards and downloadable files on November 7, 2026. These are candidates for enrichment review, not accepted current menu evidence.

### MongoDB whats cooking restaurants

Source: https://huggingface.co/datasets/MongoDB/whatscooking.restaurants

- Card declares Apache 2.0. Repository metadata reports a last modification in June 2024; that is not a per-venue verification date.
- Downloaded and parsed the actual JSON outside this repository: 25,361 records, with 14,128 nonempty `menu` fields. Borough values cover the five NYC boroughs, plus 51 records marked `Missing`.
- Includes names, addresses, coordinates, cuisine, price fields, menu lists, ambiance/noise attributes and embeddings. No record had a nonempty top-level `website` field in the inspected file.
- The documentation does not establish per-menu source URLs, collection dates or whether all enriched attributes were observed rather than generated. Do not call its menu, rating, price or atmosphere fields verified or current without checking them independently. Noise level is not live crowding.
- Possible use: candidate matching by establishment ID/address, schema and retrieval experiments, and an enrichment review queue. Not an automatic verified-menu import.

### Rummage Labs NYTimes best restaurants 2024

Source: https://huggingface.co/datasets/RummageLabs/nytimes_best_restaurants_2024

- Card declares CC BY 4.0 and recommends independent verification. It describes a nationwide 2024 selection, not a comprehensive NYC catalog.
- Parsed the CSV: 50 records total; four records have NYC borough/city locations: Blanca (Brooklyn), Bungalow (New York City), Penny (New York City), and Shaw-naé’s House (Staten Island).
- Includes addresses, cuisine, descriptions and official website URLs. No coordinate columns. The descriptions are dataset claims, not newly checked evidence of current offerings or atmosphere.
- Possible use: four venue/website leads to cross-check with current official sources and NYC establishment records. Preserve attribution if incorporating data.

### Foursquare NYC POI

Source: https://huggingface.co/datasets/w11wo/FourSquare-NYC-POI

The published schema contains `system_prompt`, `inputs`, `targets` and `llama_prompt` for next-place recommendation research. Viewer examples contain historical 2012 trajectories. This is not a ready-to-use current restaurant/menu database. No explicit license was identified in the inspected card metadata. Exclude from the live venue database.

### BeamStation NYC sample

Source: https://huggingface.co/datasets/beamstation/restaurant-verified-email-access-in-new-york-city-new-york-us-697812

This is genuinely NYC-specific, unlike the Rochester sample. Its card declares a custom BeamStation evaluation license, and its README explicitly describes evaluation use and a separately offered full dataset. Do not redistribute or integrate it on the assumption that Hugging Face hosting implies an unrestricted open-data license. Its contact-marketing focus is also unnecessary for Elsewhere.

### Inaccessible candidate

https://huggingface.co/datasets/itinerai/restaurants appeared in search results with NYC examples, but both the repository page and dataset metadata request returned HTTP 401 during this investigation. Current files, license and coverage could not be verified. Exclude until accessible and reviewed.

### Decision

Hugging Face offers useful leads and experimental data, but this investigation did not establish a complete, current, source-verifiable NYC menu/atmosphere/crowd database. Keep DOHMH as the venue backbone, inspect the MongoDB enrichment fields before trusting them, and use independently checked official restaurant pages for demo claims. None of these sources supplies established live crowd evidence for Elsewhere. No downloaded Hugging Face files or venue claims were imported into the runtime by this research.
