# PackPath

AI backpacking route planner. Takes real trail geometry from OpenStreetMap, finds loop routes algorithmically, scores them, then hands structured data to Claude for narration. Pilot region: Ansel Adams Wilderness, Sierra Nevada. The architectural bet: code plans, Claude narrates.

## The architectural bet

The original PackPath was prompt-only -- Claude invented routes from memory, which meant fabricated trail names, impossible mileage, and no way to validate any of it. The redesign inverts control: real OSM trail geometry feeds a deterministic loop search and clustering algorithm, a six-component scoring engine picks three diverse winners, Claude narrates the structured data with strict grounding rules (it never types a number, never invents a trail name), and a deterministic validator catches anything ungrounded. If validation fails, a single retry with a correction prompt fixes it. The result is an itinerary where every mile, every foot of elevation, and every trail name traces back to real geometry.

## Pipeline

1. **Fetch OSM data** -- `fetch-overpass.js` pulls trails, trailheads, water, and features from the Overpass API for the Ansel Adams bounding box. Caches to `cache/ansel-adams.json`.
2. **Build graph** -- `build-graph.js` parses raw OSM elements into a trail graph of junctions and segments, attaches nearby features (peaks, lakes, streams), classifies terrain features vs. true peaks.
3. **Enrich elevation** -- `enrich-elevation.js` queries Open-Elevation SRTM DEM data for every node, applies 5-node moving-average smoothing to eliminate SRTM staircase artifacts, computes per-segment gain/loss with a 10 ft threshold filter and residual redistribution to guarantee closed loops sum to zero.
4. **Find loops and cluster** -- `find-loops.js` runs DFS loop search (25-45 mi range), computes per-loop elevation, clusters overlapping loops by geographic center. Exports `cache/clusters.json` (282 clusters for Ansel Adams).
5. **Score and rank** -- `score-cluster.js` scores each cluster on six weighted components (mileage fit, elevation fit, scenery match, crowd preference, accessibility, feature density). `rank-clusters.js` picks the top 3 with a diversity filter (5-mile minimum haversine distance between cluster centers).
6. **Narrate** -- `test-narration-real.js` builds a structured prompt from the winning clusters, calls Claude Sonnet, and post-processes the response into a validated JSON itinerary.
7. **Validate** -- `validate-narration.js` checks grounding (trail names, features, mileage sums, elevation sums), banned words, day balance, day-note mileage/elevation accuracy, and note length. Failures trigger a retry with the specific errors as a correction prompt.

## File map

| File | Purpose |
|---|---|
| `fetch-overpass.js` | Pulls OSM data for the pilot region bounding box, caches the response |
| `build-graph.js` | Parses OSM into trail graph with junctions, segments, and classified features |
| `enrich-elevation.js` | Queries DEM elevation for every node, computes smoothed per-segment gain/loss |
| `find-loops.js` | DFS loop enumeration, per-loop elevation, geographic clustering |
| `score-cluster.js` | Six-component weighted scoring engine for route clusters |
| `rank-clusters.js` | Diversity-filtered top-3 selection from scored clusters |
| `test-narration-real.js` | Pipeline orchestrator: loads prefs, ranks, builds prompt, calls Claude, post-processes, validates, retries |
| `validate-narration.js` | Deterministic validator: grounding checks, banned words, day balance, note accuracy |
| `narration-prompt.md` | Reference copy of the system prompt with grounding rules and voice rules |
| `narration-output-real.json` | Latest validated end-to-end output -- three Sierra routes with day-by-day itineraries |
| `narration-input.json` | Structured input fed to Claude (segments, features, trails per route) |
| `narration-chain.json` | Full API conversation chain including retry messages |
| `user-preferences.example.json` | Example user preferences file (days, miles/day, scenery, crowd preference, etc.) |
| `cache/ansel-adams.json` | Raw Overpass API response (~13 MB) |
| `cache/ansel-adams-elevation.json` | Cached DEM elevations for 33,348 nodes |
| `cache/ansel-adams-graph.json` | Enriched graph with per-segment elevation |
| `cache/clusters.json` | 282 loop clusters with elevation data |

## What to look at first

1. **`narration-output-real.json`** -- the latest validated end-to-end output. Three Sierra routes (classic, scenic, explorer) with day-by-day itineraries. All numbers are grounded in real geometry. Read this to see what the system actually produces.

2. **`narration-prompt.md`** -- the system prompt with all the grounding rules and voice rules. This is where the "Claude never types a number" constraint lives, along with banned-word guidance, day-balance rules, and day-note accuracy requirements.

3. **`validate-narration.js`** -- the validator that makes the whole architecture trustworthy. It checks mileage sums, elevation sums, trail name grounding, feature grounding, banned AI-travel-writer words, day balance (30% minimum), and day-note mileage/elevation cross-validation. The validator catching errors on attempt 1 and passing on attempt 2-3 is by design, not failure.

## Running it

```bash
npm install
cp .env.example .env
# Edit .env and add your Anthropic API key
node test-narration-real.js
```

Cost is roughly $0.07-$0.21 per run depending on how many retry attempts the validator triggers (typically 1-3 attempts). Uses Claude Sonnet.

The pipeline reads from `cache/` so you don't need to re-run the Overpass fetch or elevation enrichment. If you want to regenerate from scratch: `node fetch-overpass.js`, then `node enrich-elevation.js`, then `node find-loops.js`, then `node test-narration-real.js`.

## Known limitations

- Pilot region is Ansel Adams only. Adding a region means a new Overpass bbox, elevation enrichment, and loop search -- roughly an hour of mechanical work plus curation of the results.
- Archetype labels (classic, scenic, explorer) are mostly positional (assigned by pick index), not content-driven. Only "high-passes" (2+ passes) and "remote" (<15% high-traffic ratio) are signal-based. This produces visible mismatches -- e.g., Pick 3 labeled "explorer" despite 50% JMT overlap -- across multiple runs.
- No permit data or wilderness metadata table yet. The system can't tell a backpacker whether their route needs a wilderness permit or which ranger station to contact.

## What I want feedback on

Read the latest output and the code. Tell me: does the architecture hold up? Is the validator doing what I think it's doing? Anything you'd build differently?
