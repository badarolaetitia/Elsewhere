# Agent-driven area heatmap

Elsewhere uses the 66 West Village venues with separately source-backed offerings. The 96-record identity catalogue is unchanged. This adapts the supplied patch's Mercator map, area-grid and station/event approach; it excludes simulated venues, invented baseline crowds and density-based quietness.

## Agent workflow

1. **Discovery** interprets the dining request through the existing guarded `/places` pipeline and applies checked offering, optional preference, personal taste and radius constraints. Gemini still has the existing plain-search fallback.
2. **Crowd** receives only checked venue IDs at `/crowd`. It independently queries the MTA station-history and NYC permitted-events tools. It validates source records, evaluates geographic coverage and returns dated, source-linked estimates and a heat grid. No visitor reporting is required.
3. **Coordinator** can favour lower estimated area activity only within comparable experience matches when **Prefer less busy areas** is on. Focus score and optional preference/taste priorities must agree, and match scores must be within five points. Places without estimates keep their slots. Closest-first stays in distance order. Displayed experience scores are unchanged.
4. The **map** renders the agent's output: real OpenStreetMap street tiles, an area overlay, numbered venue pins, evidence details and links back to result cards. Zoom, pan and reset controls are available. The map does not generate crowd estimates.

## What the evidence means

- **MTA:** the agent finds the latest records within 1.1 km, then aggregates the preceding eight weeks by station, weekday and hour. Total entries are divided by distinct observed hourly timestamps, not payment-category rows. Slots need at least three observations. Sources over 45 days old, incomplete responses and invalid coordinates are excluded. The nearest covered station within 450 m provides a typical-hour ratio relative to its own weekly peak. This is a low-confidence area proxy, not live pedestrian density or restaurant occupancy.
- **Events:** the agent checks Manhattan permits for today through the next seven days, filters Community Board 2 and attempts at most four distinct NYC GeoSearch locations. Only sufficiently confident venue/address matches inside the pilot map bounds are used. Unresolved locations are skipped and counted, not replaced with guessed street coordinates. An active permit within 250 m adds possible area pressure; attendance is not measured.
- **No coverage:** neutral pins and no shaded cells. No evidence never becomes calm. Event-free streets do not automatically receive a quietness bonus.
- All date/hour comparisons use **America/New_York**, regardless of the visitor's timezone. Planned visits use the requested New York date/time within the next seven days; other searches use the current New York time.

The live check on November 7, 2026 returned eight nearby stations, with source data through October 29. The event service was unavailable during that check; the agent returned partial transit evidence and explicitly excluded events. API availability and coverage may vary.

## Reliability and hosting

The tools have per-request timeouts and a shared 30-second research deadline. A 15-minute in-memory cache and in-flight deduplication bound repeated source requests in each server instance. The client refreshes expired investigations and ignores obsolete responses. Dining results render independently and stay usable during source failure. Unavailable source status and actual agent activity can be inspected below the map.

The hosted `/crowd` route uses the existing origin, method, session and IP request guard. The client supplies a research snapshot marker because these public-data tools do not consume the Gemini search allowance. A deployment must include the updated worker; an unmodified static host cannot run the research tools. No new provider keys, database tables or model calls are needed for this version. Public-source limits still apply. Before a larger launch, move the cache into shared storage and add a dedicated global tool-request budget across server instances.

The OpenStreetMap attribution stays visible; only tiles in the current viewport are requested with ordinary browser caching. There is no bulk download or offline tile feature. A production-scale map needs an appropriate tile-hosting arrangement.

## Boundaries

This is an automated, tool-using Crowd Agent with deterministic, inspectable evidence evaluation. It does not ask an LLM to invent busyness scores or claim that a restaurant has tables available. A future restaurant-specific crowd agent needs trustworthy venue-specific busy-period, queue or availability sources. Reviews and reservation availability are not connected here.

The earlier private crowd-report utilities remain isolated from this workflow for compatibility, but user report controls are no longer rendered in search or visit feedback and reports do not drive the agent heatmap or area ranking. Existing ratings, saves and account sync remain separate.

No simulation, booking or publishing is performed by this change.
