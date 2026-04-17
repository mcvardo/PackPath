# PackPath

AI backpacking route planner for the Sierra Nevada. Real trail geometry from OpenStreetMap, deterministic loop search and scoring, Claude narration with strict grounding rules. No hallucinated trail names. No invented mileage.

Pilot region: **Ansel Adams Wilderness, Sierra Nevada.**

---

## The architecture

The original PackPath was prompt-only — Claude invented routes from memory, which meant fabricated trail names, impossible mileage, and no way to validate any of it.

The redesign inverts control. Code plans. Claude narrates.

Real OSM trail geometry feeds a deterministic loop search and clustering algorithm. A six-component scoring engine picks three diverse winners. Claude narrates the structured data under strict grounding rules — it never types a number, never invents a trail name. A deterministic validator catches anything ungrounded. If validation fails, a single retry with a correction prompt fixes it.

The result is an itinerary where every mile, every foot of elevation, and every trail name traces back to real geometry.

---

## Running the web app

```bash
git clone https://github.com/mmiddle5/PackPath.git
cd PackPath
npm install
cp .env.example .env
# Add your Anthropic API key to .env
npm start
# Open http://localhost:3000
```

The **Load demo output** button works immediately on a fresh clone — no API key needed, no pipeline run required. It loads the latest validated output for three Ansel Adams routes.

**Find routes** requires the cluster cache. If `cache/clusters.json` is missing, run the data pipeline first (see below).

---

## Running the CLI pipeline

```bash
node test-narration-real.js
# or with a specific region:
node test-narration-real.js --region=ansel-adams
```

Cost is roughly $0.07–0.21 per run depending on validator retries (typically 1–3 attempts). Uses Claude Sonnet.

The pipeline reads from `cache/` so you don't need to re-run the data steps on every run. To regenerate from scratch:

```bash
npm run fetch    # Pull OSM data from Overpass API (~2 min)
npm run enrich   # Query elevation for 33k nodes (~1 hour)
npm run loops    # DFS loop search + clustering (~5 min)
npm run pipeline # Score, narrate, validate
```

---

## Pipeline steps

1. **Fetch OSM data** — `fetch-overpass.js` pulls trails, trailheads, water, and features from the Overpass API. Caches to `cache/ansel-adams.json`.
2. **Build graph** — `build-graph.js` parses OSM elements into a trail graph of junctions and segments, attaches nearby features (peaks, lakes, streams), classifies terrain features vs. true peaks.
3. **Enrich elevation** — `enrich-elevation.js` queries Open-Elevation SRTM DEM data for every node, applies 5-node moving-average smoothing to eliminate SRTM staircase artifacts, computes per-segment gain/loss with a 10 ft threshold filter and residual redistribution to guarantee closed loops sum to zero.
4. **Find loops and cluster** — `find-loops.js` runs DFS loop search (25–45 mi range), computes per-loop elevation, clusters overlapping loops by geographic center. Produces 282 clusters for Ansel Adams.
5. **Score and rank** — `score-cluster.js` scores each cluster on six weighted components: mileage fit, elevation fit, scenery match, crowd preference, accessibility, feature density. `rank-clusters.js` picks the top 3 with a 5-mile geographic diversity filter.
6. **Narrate** — `pipeline-core.js` builds a structured prompt from the winning clusters and calls Claude Sonnet. Claude assigns segments to days and writes prose. It never computes a number.
7. **Validate** — `validate-narration.js` checks trail name grounding, feature grounding, mileage sums, elevation sums, banned words, day balance, and day-note accuracy. Failures trigger a targeted retry.

---

## File map

| File | Purpose |
|---|---|
| `server.js` | Express API server — serves the frontend and wraps the pipeline as an HTTP API |
| `pipeline-core.js` | Shared pipeline logic used by both the server and CLI |
| `test-narration-real.js` | CLI pipeline orchestrator |
| `validate-narration.js` | Deterministic validator: grounding, banned words, day balance, note accuracy |
| `score-cluster.js` | Six-component weighted scoring engine |
| `rank-clusters.js` | Diversity-filtered top-3 selection |
| `build-graph.js` | OSM → trail graph with junctions, segments, and classified features |
| `enrich-elevation.js` | DEM elevation queries, smoothing, per-segment gain/loss |
| `find-loops.js` | DFS loop enumeration, elevation, geographic clustering |
| `fetch-overpass.js` | Pulls OSM data for a region bounding box |
| `geo-utils.js` | Haversine distance, shared geographic utilities |
| `errors.js` | Typed error classes for pipeline failures |
| `regions/ansel-adams.json` | Region config: bbox, seed trail, allowed non-features |
| `narration-system-prompt.txt` | System prompt shared by CLI and server |
| `narration-output-real.json` | Latest validated output — three Sierra routes with day-by-day itineraries |
| `public/` | Frontend — preferences form, route cards, topo maps, itinerary |
| `cache/` | Generated data files (not committed — regenerate with pipeline steps) |

---

## Known limitations

- **Pilot region only.** Adding a region means a new Overpass bbox, elevation enrichment, and loop search — roughly an hour of mechanical work plus curation.
- **Archetype labels are partially positional.** Content-based signals (high-passes, remote) take priority, but positional fallbacks (classic/scenic/explorer by pick index) produce occasional mismatches — e.g. Pick 3 labeled "explorer" despite 50% JMT overlap.
- **No permit data.** The system can't tell a backpacker whether their route requires a wilderness permit or which ranger station to contact.
- **Geo centers in demo output are approximate.** The three demo routes use manually set coordinates. Routes generated by the pipeline use real cluster centroids.
