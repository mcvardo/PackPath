// summarize-real.js
// Runs the parser against the cached real Overpass response and prints the
// numbers we care about for the data-quality decision:
//   - How many named trails are there, and what fraction of total trail miles
//     are named?
//   - How many junctions, segments, trailheads, peaks, springs?
//   - How connected is the network after we account for boundary clipping?
//   - What do the trail names look like — do they match what a backpacker
//     would actually call them?

import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchOverpass } from './fetch-overpass.js';
import { buildGraph, summarizeGraph } from './build-graph.js';

// Must match the bbox used in fetch-overpass.js
const QUERY_BBOX = {
  minLat: 37.55,
  minLon: -119.30,
  maxLat: 37.90,
  maxLon: -118.90,
};

async function main() {
  const data = await fetchOverpass();
  console.log(`Parsing ${data.elements.length} OSM elements...`);

  const graph = buildGraph(data, { queryBbox: QUERY_BBOX });
  const summary = summarizeGraph(graph);

  console.log('\n=== ANSEL ADAMS WILDERNESS — DATA QUALITY REPORT ===\n');
  console.log(JSON.stringify(summary, null, 2));

  // Top 30 named trails by total mileage — the question is whether these
  // are the trails a Sierra backpacker would actually plan around.
  const milesByName = new Map();
  for (const seg of graph.segments) {
    if (!seg.name) continue;
    milesByName.set(seg.name, (milesByName.get(seg.name) || 0) + seg.lengthMi);
  }
  const topTrails = [...milesByName.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  console.log('\n=== TOP 30 NAMED TRAILS BY MILEAGE ===');
  for (const [name, miles] of topTrails) {
    console.log(`  ${miles.toFixed(1).padStart(6)} mi   ${name}`);
  }

  // Trailheads — the entry points users will start from
  console.log('\n=== TRAILHEADS ===');
  const namedTrailheads = graph.trailheads.filter((t) => t.tags?.name);
  console.log(`  ${namedTrailheads.length} named / ${graph.trailheads.length} total`);
  for (const th of namedTrailheads.slice(0, 20)) {
    console.log(`    ${th.tags.name}  (${th.lat}, ${th.lon})`);
  }

  // Save the parsed graph as JSON for inspection / next-step input
  const outPath = path.join(import.meta.dirname, 'cache', 'ansel-adams-graph.json');
  // Convert Maps and Sets so JSON.stringify works
  const serializable = {
    bbox: graph.bbox,
    junctionIds: [...graph.junctions],
    boundaryJunctionIds: [...graph.boundaryJunctions],
    segments: graph.segments,
    trailheads: graph.trailheads.map((t) => ({
      id: t.id,
      lat: t.lat,
      lon: t.lon,
      name: t.tags?.name || null,
    })),
    peaks: graph.peaks.map((p) => ({
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      name: p.tags?.name,
      eleM: p.tags?.ele ? Number(p.tags.ele) : null,
    })),
    passes: graph.passes.map((p) => ({
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      name: p.tags?.name || null,
    })),
  };
  await fs.writeFile(outPath, JSON.stringify(serializable, null, 2));
  console.log(`\nGraph saved to ${outPath}`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
