// test-graph.js
// Verifies the parser against a synthetic OSM response that mirrors
// what we'd actually get back from Overpass for a small slice of the
// Ansel Adams Wilderness.
//
// The geometry is hand-built but realistic: real-ish coordinates around
// Agnew Meadows / Thousand Island Lake, two trails that share a junction,
// an unnamed spur, a trailhead, a peak, a pass, and a spring.

import { buildGraph, summarizeGraph } from './build-graph.js';

const synthetic = {
  version: 0.6,
  generator: 'synthetic-test',
  elements: [
    // === Nodes for Trail A: Shadow Creek Trail ===
    // Runs roughly NW from Agnew Meadows trailhead toward a junction with the JMT
    { type: 'node', id: 1, lat: 37.6826, lon: -119.0859 }, // Agnew Meadows TH
    { type: 'node', id: 2, lat: 37.6855, lon: -119.0902 },
    { type: 'node', id: 3, lat: 37.6890, lon: -119.0945 },
    { type: 'node', id: 4, lat: 37.6925, lon: -119.0988 },
    { type: 'node', id: 5, lat: 37.6960, lon: -119.1031 }, // Junction with JMT
    { type: 'node', id: 6, lat: 37.6995, lon: -119.1074 }, // continues past junction
    { type: 'node', id: 7, lat: 37.7030, lon: -119.1117 }, // Thousand Island Lake area

    // === Nodes for Trail B: John Muir Trail (segment) ===
    // Crosses Shadow Creek Trail at node 5
    { type: 'node', id: 10, lat: 37.6920, lon: -119.0950 },
    { type: 'node', id: 11, lat: 37.6940, lon: -119.0990 },
    // node 5 is shared
    { type: 'node', id: 12, lat: 37.6985, lon: -119.1075 },
    { type: 'node', id: 13, lat: 37.7015, lon: -119.1140 },

    // === Nodes for Trail C: unnamed spur off Shadow Creek ===
    // Starts at node 4, goes to a dead end
    { type: 'node', id: 20, lat: 37.6940, lon: -119.0960 },
    { type: 'node', id: 21, lat: 37.6955, lon: -119.0930 },

    // === Feature nodes ===
    {
      type: 'node',
      id: 100,
      lat: 37.6828,
      lon: -119.0860,
      tags: { highway: 'trailhead', name: 'Agnew Meadows Trailhead' },
    },
    {
      type: 'node',
      id: 101,
      lat: 37.7035,
      lon: -119.1115,
      tags: { natural: 'peak', name: 'Banner Peak', ele: '3942' },
    },
    {
      type: 'node',
      id: 102,
      lat: 37.6962,
      lon: -119.1033,
      tags: { mountain_pass: 'yes', name: 'Island Pass' },
    },
    {
      type: 'node',
      id: 103,
      lat: 37.6892,
      lon: -119.0948,
      tags: { natural: 'spring', name: 'Shadow Spring' },
    },
    // A peak FAR from any trail — should NOT show up in nearby features
    {
      type: 'node',
      id: 104,
      lat: 37.8500,
      lon: -119.2500,
      tags: { natural: 'peak', name: 'Far Away Mountain' },
    },

    // === Ways ===
    {
      type: 'way',
      id: 1000,
      nodes: [1, 2, 3, 4, 5, 6, 7],
      tags: { highway: 'path', name: 'Shadow Creek Trail' },
    },
    {
      type: 'way',
      id: 1001,
      nodes: [10, 11, 5, 12, 13],
      tags: { highway: 'path', name: 'John Muir Trail' },
    },
    {
      type: 'way',
      id: 1002,
      nodes: [4, 20, 21],
      tags: { highway: 'path' }, // unnamed spur
    },
  ],
};

const graph = buildGraph(synthetic);
const summary = summarizeGraph(graph);

console.log('=== GRAPH SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));

console.log('\n=== SEGMENTS ===');
for (const seg of graph.segments) {
  const features = [
    ...seg.nearbyPeaks.map((p) => `peak:${p.name}`),
    ...seg.nearbyPasses.map((p) => `pass:${p.name || p.id}`),
    ...seg.nearbySprings.map((s) => `spring:${s.name || s.id}`),
  ];
  console.log(
    `  ${seg.name || '(unnamed)'} [${seg.startNode}→${seg.endNode}] ${seg.lengthMi}mi` +
      (features.length ? `  features: ${features.join(', ')}` : '')
  );
}

// === Expectations the parser should satisfy ===
console.log('\n=== ASSERTIONS ===');

const checks = [];

// Shadow Creek Trail should be split at node 5 (junction with JMT)
// into 1→2→3→4→5 and 5→6→7. Plus node 4 is also a junction (spur starts there)
// so the first half splits again into 1→2→3→4 and 4→5.
// Result: 3 segments named "Shadow Creek Trail".
const shadowSegs = graph.segments.filter((s) => s.name === 'Shadow Creek Trail');
checks.push({
  name: 'Shadow Creek Trail splits into 3 segments at junctions',
  pass: shadowSegs.length === 3,
  detail: `got ${shadowSegs.length}`,
});

// JMT should split at node 5 into 10→11→5 and 5→12→13
const jmtSegs = graph.segments.filter((s) => s.name === 'John Muir Trail');
checks.push({
  name: 'JMT splits into 2 segments at the junction',
  pass: jmtSegs.length === 2,
  detail: `got ${jmtSegs.length}`,
});

// The unnamed spur should still be in the graph
const unnamed = graph.segments.filter((s) => !s.name);
checks.push({
  name: 'Unnamed spur is preserved',
  pass: unnamed.length === 1,
  detail: `got ${unnamed.length}`,
});

// Banner Peak should be near at least one segment (the one ending at node 7)
const segmentsNearBanner = graph.segments.filter((s) =>
  s.nearbyPeaks.some((p) => p.name === 'Banner Peak')
);
checks.push({
  name: 'Banner Peak is detected near a segment',
  pass: segmentsNearBanner.length >= 1,
  detail: `${segmentsNearBanner.length} segments`,
});

// Far Away Mountain should NOT be near anything
const segmentsNearFar = graph.segments.filter((s) =>
  s.nearbyPeaks.some((p) => p.name === 'Far Away Mountain')
);
checks.push({
  name: 'Far-away peak is correctly NOT detected',
  pass: segmentsNearFar.length === 0,
  detail: `${segmentsNearFar.length} false positives`,
});

// Total miles should roughly match what you'd expect for these coordinates.
// Each ~0.0035 deg step is about 0.27 miles. Shadow Creek (6 steps) ~1.6mi,
// JMT (4 steps) ~1.1mi, spur (2 steps) ~0.55mi. Total ~3.2mi.
checks.push({
  name: 'Total trail miles is in the expected range (2.5–4.0)',
  pass: summary.graph.totalMiles >= 2.5 && summary.graph.totalMiles <= 4.0,
  detail: `${summary.graph.totalMiles} mi`,
});

// One real component once we account for boundary clipping.
// Node 10 sits inside the bbox so it's a true endpoint, not a boundary node —
// the test data simulates a JMT segment that is fully contained but only
// touches Shadow Creek at one end. So we expect 2 components here, and the
// boundary-junction count should be 0 (since none of our test nodes are at
// the bbox edge). When this runs on real Ansel Adams data, expect many small
// components that ARE on the boundary.
checks.push({
  name: 'Test data has 0 boundary junctions (none at bbox edge)',
  pass: summary.graph.boundaryJunctions === 0,
  detail: `${summary.graph.boundaryJunctions} boundary junctions`,
});

let passed = 0;
for (const c of checks) {
  console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}  (${c.detail})`);
  if (c.pass) passed++;
}
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
