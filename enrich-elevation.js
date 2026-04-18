// enrich-elevation.js
// Queries Open-Elevation for sampled nodes in the trail graph, caches results,
// and computes per-segment gainFt / lossFt from the elevation profile.
//
// Usage: node enrich-elevation.js [--region=<id>]
// Default region: ansel-adams

import fs from 'node:fs/promises';
import path from 'node:path';
import { buildGraph } from './build-graph.js';

function getRegionId() {
  const arg = process.argv.find(a => a.startsWith('--region='));
  return arg ? arg.split('=')[1] : 'ansel-adams';
}

const ELEVATION_API = 'https://api.open-elevation.com/api/v1/lookup';
const BATCH_SIZE = 100;
const SAMPLE_STEP = 1;
const METERS_TO_FEET = 3.28084;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 3;
const ELEV_THRESHOLD_FT = 10;
const SMOOTH_WINDOW = 5;

function collectSampledNodes(graph) {
  const needed = new Map();
  for (const seg of graph.segments) {
    const nids = seg.nodeIds;
    for (const id of [nids[0], nids[nids.length - 1]]) {
      if (!needed.has(id)) {
        const n = graph.nodes.get(id);
        if (n) needed.set(id, { lat: n.lat, lon: n.lon });
      }
    }
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
    const res = await fetch(ELEVATION_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.results.map(r => r.elevation);
  } catch (err) {
    if (retryCount < MAX_RETRIES) {
      console.log(`  Retry ${retryCount + 1}/${MAX_RETRIES} after error: ${err.message}`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (retryCount + 1)));
      return fetchElevationBatch(locations, retryCount + 1);
    }
    throw err;
  }
}

async function main() {
  const regionId = getRegionId();
  const regionPath = path.join(import.meta.dirname, 'regions', `${regionId}.json`);
  const osmCachePath = path.join(import.meta.dirname, 'cache', `${regionId}.json`);
  const elevCachePath = path.join(import.meta.dirname, 'cache', `${regionId}-elevation.json`);
  const graphCachePath = path.join(import.meta.dirname, 'cache', `${regionId}-graph.json`);

  let regionConfig;
  try {
    regionConfig = JSON.parse(await fs.readFile(regionPath, 'utf-8'));
  } catch {
    throw new Error(`Region config not found: ${regionPath}`);
  }

  const { bbox: b } = regionConfig;
  const queryBbox = { minLat: b.minLat, minLon: b.minLon, maxLat: b.maxLat, maxLon: b.maxLon };

  console.log(`Enriching elevation for region: ${regionConfig.name}`);

  const data = JSON.parse(await fs.readFile(osmCachePath, 'utf-8'));
  const graph = buildGraph(data, { queryBbox });

  // Load existing elevation cache if present
  let elevCache = {};
  try {
    elevCache = JSON.parse(await fs.readFile(elevCachePath, 'utf-8'));
    console.log(`Loaded existing elevation cache: ${Object.keys(elevCache).length} nodes`);
  } catch {
    console.log('No existing elevation cache — fetching from scratch');
  }

  const needed = collectSampledNodes(graph);
  const missing = [...needed.entries()].filter(([id]) => !(id in elevCache));
  console.log(`Nodes needed: ${needed.size}, missing from cache: ${missing.length}`);

  if (missing.length > 0) {
    const batches = [];
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      batches.push(missing.slice(i, i + BATCH_SIZE));
    }
    console.log(`Fetching ${batches.length} batches of up to ${BATCH_SIZE} nodes...`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const locations = batch.map(([, pos]) => pos);
      process.stdout.write(`  Batch ${i + 1}/${batches.length}... `);
      const elevations = await fetchElevationBatch(locations);
      for (let j = 0; j < batch.length; j++) {
        elevCache[batch[j][0]] = elevations[j];
      }
      console.log('done');
      await fs.writeFile(elevCachePath, JSON.stringify(elevCache));
    }
  }

  // Apply elevation to segments
  let enriched = 0;
  for (const seg of graph.segments) {
    const nids = seg.nodeIds;
    const sampledIndices = [0];
    for (let i = SAMPLE_STEP; i < nids.length - 1; i += SAMPLE_STEP) sampledIndices.push(i);
    sampledIndices.push(nids.length - 1);

    const profile = [];
    for (const idx of sampledIndices) {
      const elevM = elevCache[nids[idx]];
      if (elevM !== undefined && elevM !== null) profile.push(elevM * METERS_TO_FEET);
    }

    if (profile.length >= 2) {
      const smoothed = new Array(profile.length);
      const half = Math.floor(SMOOTH_WINDOW / 2);
      for (let i = 0; i < profile.length; i++) {
        const lo = Math.max(0, i - half);
        const hi = Math.min(profile.length - 1, i + half);
        let sum = 0;
        for (let j = lo; j <= hi; j++) sum += profile[j];
        smoothed[i] = sum / (hi - lo + 1);
      }
      smoothed[0] = profile[0];
      smoothed[profile.length - 1] = profile[profile.length - 1];

      let gain = 0, loss = 0;
      for (let i = 1; i < smoothed.length; i++) {
        const delta = smoothed[i] - smoothed[i - 1];
        if (delta > ELEV_THRESHOLD_FT) gain += delta;
        else if (delta < -ELEV_THRESHOLD_FT) loss += Math.abs(delta);
      }

      const netChange = profile[profile.length - 1] - profile[0];
      const residual = netChange - (gain - loss);
      if (gain + loss > 0) {
        if (residual > 0) gain += residual;
        else loss += Math.abs(residual);
      }

      seg.gainFt = Math.round(gain);
      seg.lossFt = Math.round(loss);
      enriched++;
    }
  }

  console.log(`Applied elevation to ${enriched} segments`);

  // Save enriched graph
  const graphExport = {
    nodes: Object.fromEntries(graph.nodes),
    segments: graph.segments,
    trailheads: graph.trailheads,
  };
  await fs.writeFile(graphCachePath, JSON.stringify(graphExport));
  console.log(`Graph cached to ${graphCachePath}`);
  console.log('Elevation enrichment complete.');
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
