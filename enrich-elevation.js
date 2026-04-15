// enrich-elevation.js
// Queries Open-Elevation for sampled nodes in the trail graph, caches results,
// and computes per-segment gainFt / lossFt from the elevation profile.
//
// Elevation is computed deterministically from DEM data — Claude never touches it.

import fs from 'node:fs/promises';
import { buildGraph } from './build-graph.js';

const QUERY_BBOX = { minLat: 37.55, minLon: -119.30, maxLat: 37.90, maxLon: -118.90 };
const CACHE_PATH = 'cache/ansel-adams-elevation.json';
const GRAPH_CACHE_PATH = 'cache/ansel-adams-graph.json';
const ELEVATION_API = 'https://api.open-elevation.com/api/v1/lookup';
const BATCH_SIZE = 100;
const SAMPLE_STEP = 1;   // sample every node (was 10 — caused systematic elevation over-counting)
const METERS_TO_FEET = 3.28084;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 3;
const ELEV_THRESHOLD_FT = 10;  // ignore deltas < 10 ft to filter DEM noise (matches CalTopo/Gaia behavior)
const SMOOTH_WINDOW = 5;       // moving-average window size for elevation profile smoothing
                               // At ~14m node spacing, 5 nodes ≈ 70m — spans ~2 DEM cells,
                               // smoothing out SRTM staircase artifacts at cell boundaries.

async function loadOrBuildGraph() {
  const data = JSON.parse(await fs.readFile('cache/ansel-adams.json', 'utf-8'));
  return buildGraph(data, { queryBbox: QUERY_BBOX });
}

function collectSampledNodes(graph) {
  // For each segment, sample every SAMPLE_STEP-th node plus start/end.
  // Returns a Map of nodeId -> {lat, lon} for all nodes we need elevation for.
  const needed = new Map();

  for (const seg of graph.segments) {
    const nids = seg.nodeIds;
    // Always include start and end
    for (const id of [nids[0], nids[nids.length - 1]]) {
      if (!needed.has(id)) {
        const n = graph.nodes.get(id);
        if (n) needed.set(id, { lat: n.lat, lon: n.lon });
      }
    }
    // Sample intermediates
    for (let i = SAMPLE_STEP; i < nids.length - 1; i += SAMPLE_STEP) {
      const id = nids[i];
      if (!needed.has(id)) {
        const n = graph.nodes.get(id);
        if (n) needed.set(id, { lat: n.lat, lon: n.lon });
      }
    }
  }

  return needed;
}

async function fetchElevationBatch(locations, retryCount = 0) {
  const body = JSON.stringify({
    locations: locations.map(l => ({ latitude: l.lat, longitude: l.lon })),
  });

  try {
    const response = await fetch(ELEVATION_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API ${response.status}: ${errText}`);
    }

    const result = await response.json();
    return result.results.map(r => r.elevation);  // meters
  } catch (err) {
    if (retryCount < MAX_RETRIES) {
      console.log(`  Retry ${retryCount + 1}/${MAX_RETRIES} after error: ${err.message}`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (retryCount + 1)));
      return fetchElevationBatch(locations, retryCount + 1);
    }
    throw err;
  }
}

async function queryElevations(neededNodes, cache) {
  // Filter out nodes already in cache
  const uncached = [];
  for (const [id, coords] of neededNodes) {
    if (!(id in cache)) {
      uncached.push({ id, ...coords });
    }
  }

  if (uncached.length === 0) {
    console.log('  All elevations cached, no API calls needed.');
    return cache;
  }

  console.log(`  Need elevation for ${uncached.length} nodes (${neededNodes.size - uncached.length} cached)`);
  const totalBatches = Math.ceil(uncached.length / BATCH_SIZE);
  console.log(`  ${totalBatches} API batches of up to ${BATCH_SIZE} points each`);

  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} points)...`);

    const elevations = await fetchElevationBatch(batch);

    for (let j = 0; j < batch.length; j++) {
      cache[batch[j].id] = elevations[j];  // meters
    }

    console.log(` done (sample: ${elevations[0]?.toFixed(0)}m)`);

    // Small delay between batches to be polite to the free API
    if (i + BATCH_SIZE < uncached.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return cache;
}

function smoothProfile(profile) {
  // Apply centered moving-average to smooth SRTM staircase artifacts.
  // The staircase pattern occurs because nodes are spaced closer (~14m)
  // than DEM cells (~30m), producing long runs of identical elevation
  // punctuated by large jumps at cell boundaries. Smoothing with a window
  // spanning ~2 DEM cells eliminates phantom oscillations.
  if (profile.length <= SMOOTH_WINDOW) return profile;

  const half = Math.floor(SMOOTH_WINDOW / 2);
  const smoothed = new Array(profile.length);

  for (let i = 0; i < profile.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(profile.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += profile[j];
    smoothed[i] = sum / (hi - lo + 1);
  }

  // Preserve exact start and end elevations (these are known good points)
  smoothed[0] = profile[0];
  smoothed[profile.length - 1] = profile[profile.length - 1];

  return smoothed;
}

function computeSegmentElevation(seg, elevCache, graph) {
  // Walk the segment's node list, using cached elevations for sampled nodes.
  // For non-sampled intermediate nodes, interpolate linearly between nearest
  // sampled neighbors. Then smooth the profile and sum positive deltas as gain,
  // negative as loss.

  const nids = seg.nodeIds;

  // Build the sampled elevation profile: which nodes have elevation data?
  const sampledIndices = [0];
  for (let i = SAMPLE_STEP; i < nids.length - 1; i += SAMPLE_STEP) {
    sampledIndices.push(i);
  }
  sampledIndices.push(nids.length - 1);

  // Get elevation for each sampled index
  const rawProfile = [];
  for (const idx of sampledIndices) {
    const nodeId = nids[idx];
    const elevM = elevCache[nodeId];
    if (elevM === undefined || elevM === null) continue;
    rawProfile.push(elevM * METERS_TO_FEET);
  }

  if (rawProfile.length < 2) {
    return { gainFt: 0, lossFt: 0 };
  }

  // Smooth the profile to remove SRTM staircase artifacts, then apply
  // threshold filter on deltas (catches any remaining DEM jitter).
  const profile = smoothProfile(rawProfile);

  let gain = 0;
  let loss = 0;
  for (let i = 1; i < profile.length; i++) {
    const delta = profile[i] - profile[i - 1];
    if (delta > ELEV_THRESHOLD_FT) gain += delta;
    else if (delta < -ELEV_THRESHOLD_FT) loss += Math.abs(delta);
  }

  // The threshold filter discards small deltas, which introduces a residual:
  // (gain - loss) no longer equals the true endpoint-to-endpoint elevation change.
  // This means closed loops won't sum to zero gain/loss balance.
  // Fix: redistribute the residual proportionally so gain - loss = exact net change.
  const netChange = profile[profile.length - 1] - profile[0]; // exact, from pinned endpoints
  const currentNet = gain - loss;
  const residual = netChange - currentNet;
  if (gain + loss > 0) {
    if (residual > 0) {
      // Need more gain (or less loss) — add to gain proportionally
      gain += residual;
    } else {
      // Need more loss (or less gain) — add to loss proportionally
      loss += Math.abs(residual);
    }
  }

  return {
    gainFt: Math.round(gain),
    lossFt: Math.round(loss),
  };
}

async function main() {
  const t0 = Date.now();
  console.log('=== ELEVATION ENRICHMENT ===\n');

  // 1. Load graph
  console.log('Loading graph...');
  const graph = await loadOrBuildGraph();
  console.log(`  ${graph.segments.length} segments, ${graph.junctions.size} junctions`);

  // 2. Collect sampled nodes
  const neededNodes = collectSampledNodes(graph);
  console.log(`  ${neededNodes.size} unique sampled nodes to query`);

  // 3. Load or create elevation cache
  let cache = {};
  try {
    cache = JSON.parse(await fs.readFile(CACHE_PATH, 'utf-8'));
    console.log(`  Loaded ${Object.keys(cache).length} cached elevations from ${CACHE_PATH}`);
  } catch {
    console.log('  No elevation cache found, starting fresh.');
  }

  // 4. Query elevations (with caching)
  console.log('\nQuerying Open-Elevation API...');
  cache = await queryElevations(neededNodes, cache);

  // 5. Save cache
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
  console.log(`  Cache saved: ${Object.keys(cache).length} elevations in ${CACHE_PATH}`);

  // 6. Compute per-segment gain/loss
  console.log('\nComputing per-segment elevation...');
  let enriched = 0;
  let skipped = 0;
  let totalGain = 0;
  let totalLoss = 0;

  for (const seg of graph.segments) {
    const { gainFt, lossFt } = computeSegmentElevation(seg, cache, graph);
    seg.gainFt = gainFt;
    seg.lossFt = lossFt;
    if (gainFt > 0 || lossFt > 0) {
      enriched++;
      totalGain += gainFt;
      totalLoss += lossFt;
    } else {
      skipped++;
    }
  }

  console.log(`  Enriched: ${enriched} segments with elevation data`);
  console.log(`  Flat/skipped: ${skipped} segments (0 gain and 0 loss)`);
  console.log(`  Total network gain: ${totalGain.toLocaleString()} ft`);
  console.log(`  Total network loss: ${totalLoss.toLocaleString()} ft`);

  // 7. Save enriched graph
  // Serialize the graph in a format that find-loops.js can consume.
  // We save segments with their elevation data so downstream scripts can use it.
  const graphForCache = {
    segments: graph.segments.map(seg => ({
      wayId: seg.wayId,
      name: seg.name,
      sacScale: seg.sacScale,
      startNode: seg.startNode,
      endNode: seg.endNode,
      nodeIds: seg.nodeIds,
      nodeCount: seg.nodeCount,
      lengthMi: seg.lengthMi,
      gainFt: seg.gainFt,
      lossFt: seg.lossFt,
      nearbyPeaks: seg.nearbyPeaks,
      nearbyPasses: seg.nearbyPasses,
      nearbySprings: seg.nearbySprings,
      nearbyLandmarks: seg.nearbyLandmarks,
      nearbyLakes: seg.nearbyLakes,
      nearbyStreams: seg.nearbyStreams,
    })),
    junctions: [...graph.junctions],
    boundaryJunctions: [...graph.boundaryJunctions],
    trailheads: graph.trailheads.map(t => ({ id: t.id, tags: t.tags })),
    nodes: Object.fromEntries([...graph.nodes.entries()].map(([id, n]) => [id, { lat: n.lat, lon: n.lon }])),
  };

  await fs.writeFile(GRAPH_CACHE_PATH, JSON.stringify(graphForCache));
  console.log(`  Enriched graph saved to ${GRAPH_CACHE_PATH}`);

  // 8. Print sample segments with elevation
  console.log('\nSample enriched segments:');
  const namedSegs = graph.segments.filter(s => s.name && s.gainFt > 0).slice(0, 10);
  for (const seg of namedSegs) {
    console.log(`  ${seg.name}: ${seg.lengthMi} mi, +${seg.gainFt} ft / -${seg.lossFt} ft`);
  }

  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
