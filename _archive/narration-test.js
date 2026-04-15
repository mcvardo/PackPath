// narration-test.js
// Extract full structured data for 3 archetype clusters and output the
// narration prompt + structured input for the Claude API call.

import fs from 'node:fs/promises';
import { buildGraph } from './build-graph.js';

const QUERY_BBOX = { minLat: 37.55, minLon: -119.30, maxLat: 37.90, maxLon: -118.90 };
const MIN_MI = 25;
const MAX_MI = 45;
const PER_ANCHOR_CAP = 2_000;
const MAX_DEPTH = 40;

// Target cluster representatives by their distinguishing traits
// We'll identify them after building the clusters
const TARGET_CLUSTERS = [
  { label: 'classic', matchTrails: ['Shadow Creek Trail', 'Cecile Lake Trail', 'River Trail', 'Garnet Lake Cutoff'], featureCount: 25 },
  { label: 'high-passes', matchTrails: ['John Muir Trail'], passCount: 2, latRange: [37.72, 37.74], size: [1400, 1600] },
  { label: 'remote', matchTrails: ['Iron Creek Trail'], htTarget: 'low', sizeRange: [800, 900] },
];

async function main() {
  const data = JSON.parse(await fs.readFile('cache/ansel-adams.json', 'utf-8'));
  const graph = buildGraph(data, { queryBbox: QUERY_BBOX });

  // ── 1. Replicate the full loop search + clustering (same as find-loops.js) ──
  const mainComp = new Set();
  {
    const seed = graph.segments.find(s => s.name === 'John Muir Trail').startNode;
    const stack = [seed];
    while (stack.length) {
      const n = stack.pop();
      if (mainComp.has(n)) continue;
      mainComp.add(n);
      for (const seg of (graph.adjacency.get(n) || [])) {
        const other = seg.startNode === n ? seg.endNode : seg.startNode;
        if (!mainComp.has(other)) stack.push(other);
      }
    }
  }

  const adj = new Map();
  const mainSegments = [];
  for (const seg of graph.segments) {
    if (!mainComp.has(seg.startNode)) continue;
    mainSegments.push(seg);
    for (const j of [seg.startNode, seg.endNode]) {
      if (!adj.has(j)) adj.set(j, []);
      adj.get(j).push(seg);
    }
  }

  const segIndex = new Map();
  for (let i = 0; i < mainSegments.length; i++) segIndex.set(mainSegments[i], i);

  const trailheadIds = new Set(graph.trailheads.map(t => t.id));
  const trailheadName = new Map(graph.trailheads.map(t => [t.id, t.tags?.name || null]));

  const startNodes = [];
  for (const nid of mainComp) {
    const deg = (adj.get(nid) || []).length;
    if (trailheadIds.has(nid) && deg >= 2) startNodes.push(nid);
    else if (deg >= 3) startNodes.push(nid);
  }

  function junctionLabel(nid) {
    if (trailheadName.has(nid) && trailheadName.get(nid)) return trailheadName.get(nid);
    const segs = adj.get(nid) || [];
    const names = segs.map(s => s.name).filter(Boolean);
    if (names.length) return `jct (${[...new Set(names)].slice(0, 3).join(' / ')})`;
    return `junction ${nid}`;
  }

  // Dijkstra from each start node
  const distFromStart = new Map();
  for (const sid of startNodes) {
    const dist = new Map();
    dist.set(sid, 0);
    const pq = [[0, sid]];
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, u] = pq.shift();
      if (d > (dist.get(u) ?? Infinity)) continue;
      for (const seg of (adj.get(u) || [])) {
        const v = seg.startNode === u ? seg.endNode : seg.startNode;
        const nd = d + seg.lengthMi;
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          pq.push([nd, v]);
        }
      }
    }
    distFromStart.set(sid, dist);
  }

  function dirId(seg, fromNode) {
    const idx = segIndex.get(seg);
    return seg.startNode === fromNode ? idx * 2 : idx * 2 + 1;
  }

  const rawLoops = [];
  for (const startId of startNodes) {
    const minDist = distFromStart.get(startId);
    let anchorCandidates = 0;
    const usedDir = new Set();
    const segList = [];
    let miles = 0;

    function dfs(node, depth) {
      if (anchorCandidates >= PER_ANCHOR_CAP) return;
      if (depth > MAX_DEPTH) return;
      if (node === startId && miles >= MIN_MI && miles <= MAX_MI && segList.length > 0) {
        anchorCandidates++;
        rawLoops.push({ miles, segList: segList.slice(), startNode: startId });
        return;
      }
      for (const seg of (adj.get(node) || [])) {
        const dk = dirId(seg, node);
        if (usedDir.has(dk)) continue;
        const nextNode = seg.startNode === node ? seg.endNode : seg.startNode;
        const nextMiles = miles + seg.lengthMi;
        if (nextNode !== startId) {
          const returnDist = minDist.get(nextNode) ?? Infinity;
          if (nextMiles + returnDist > MAX_MI) continue;
        } else {
          if (nextMiles < MIN_MI || nextMiles > MAX_MI) continue;
        }
        usedDir.add(dk);
        segList.push({ seg, fromNode: node });
        const prevMiles = miles;
        miles = nextMiles;
        dfs(nextNode, depth + 1);
        miles = prevMiles;
        segList.pop();
        usedDir.delete(dk);
        if (anchorCandidates >= PER_ANCHOR_CAP) return;
      }
    }
    dfs(startId, 0);
  }

  // Dedup
  function canonicalFingerprint(segList) {
    const counts = new Map();
    for (const { seg } of segList) {
      const idx = segIndex.get(seg);
      counts.set(idx, (counts.get(idx) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([k, c]) => `${k}x${c}`).join('|');
  }
  const seen = new Map();
  for (const loop of rawLoops) {
    const fp = canonicalFingerprint(loop.segList);
    if (!seen.has(fp) || loop.miles < seen.get(fp).miles) seen.set(fp, loop);
  }
  const uniqueLoops = [...seen.values()];

  // Score
  const HIGH_TRAFFIC = new Set(['John Muir Trail', 'Pacific Crest Trail']);
  const scored = uniqueLoops.map((loop, idx) => {
    const distinctTrails = new Set(loop.segList.map(({ seg }) => seg.name).filter(Boolean));
    const featureSet = new Map();
    for (const { seg } of loop.segList) {
      for (const f of [...seg.nearbyPeaks, ...seg.nearbyPasses, ...seg.nearbySprings, ...(seg.nearbyLandmarks || []), ...(seg.nearbyLakes || [])]) {
        if (f.name && !featureSet.has(f.id)) featureSet.set(f.id, { name: f.name, type: f.type });
      }
      for (const f of (seg.nearbyStreams || [])) {
        const key = `stream:${f.name}`;
        if (f.name && !featureSet.has(key)) featureSet.set(key, { name: f.name, type: f.type });
      }
    }
    const passes = [...featureSet.values()].filter(f => f.type === 'saddle' || f.type === 'pass');
    let htMiles = 0, totalMiles = 0;
    for (const { seg } of loop.segList) {
      totalMiles += seg.lengthMi;
      if (seg.name && HIGH_TRAFFIC.has(seg.name)) htMiles += seg.lengthMi;
    }
    const segSet = new Set();
    for (const { seg } of loop.segList) segSet.add(segIndex.get(seg));
    return {
      miles: Number(loop.miles.toFixed(1)),
      distinctTrailCount: distinctTrails.size,
      distinctTrails: [...distinctTrails].sort(),
      features: [...featureSet.values()].sort((a, b) => a.name.localeCompare(b.name)),
      featureCount: featureSet.size,
      passCount: passes.length,
      htRatio: totalMiles > 0 ? htMiles / totalMiles : 0,
      start: junctionLabel(loop.startNode),
      _segSet: segSet,
      _idx: idx,
      _raw: loop,
    };
  });

  // Cluster
  function segSetIoU(a, b) {
    let intersection = 0;
    for (const s of a) if (b.has(s)) intersection++;
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
  const byQuality = scored.slice().sort((a, b) => b.featureCount - a.featureCount || a.miles - b.miles);
  const clustered = new Set();
  const clusters = [];
  for (const loop of byQuality) {
    if (clustered.has(loop._idx)) continue;
    const cluster = { representative: loop, members: [loop] };
    clustered.add(loop._idx);
    for (const candidate of byQuality) {
      if (clustered.has(candidate._idx)) continue;
      if (segSetIoU(loop._segSet, candidate._segSet) > 0.60) {
        cluster.members.push(candidate);
        clustered.add(candidate._idx);
      }
    }
    clusters.push(cluster);
  }

  console.error(`Built ${clusters.length} clusters from ${uniqueLoops.length} unique loops`);

  // Sort by size to identify the target clusters by rank
  const bySize = clusters.slice().sort((a, b) => b.members.length - a.members.length);
  for (let i = 0; i < Math.min(30, bySize.length); i++) {
    const rep = bySize[i].representative;
    console.error(`  ${String(i+1).padStart(3)}. size=${bySize[i].members.length}  ${rep.miles}mi  feat=${rep.featureCount}  pass=${rep.passCount}  ht=${(rep.htRatio*100).toFixed(0)}%  trails: ${rep.distinctTrails.slice(0,4).join(', ')}`);
  }

  // ── 2. Identify the three target clusters ──
  // Cluster 7 by size (1789, 25 features, Shadow/Minarets)
  // Cluster 11 by size (1500, Donohue/Island Pass)
  // Cluster 26 by size (876, Iron Creek, 5% HT)

  const targets = [
    { label: 'classic', cluster: bySize[6] },     // rank 7 (0-indexed: 6)
    { label: 'high-passes', cluster: bySize[10] }, // rank 11 (0-indexed: 10)
    { label: 'remote', cluster: bySize[25] },      // rank 26 (0-indexed: 25)
  ];

  // Verify we got the right ones
  for (const t of targets) {
    const rep = t.cluster.representative;
    console.error(`\nSelected ${t.label}: size=${t.cluster.members.length}, ${rep.miles}mi, ${rep.featureCount} feat, ${rep.passCount} passes, ht=${(rep.htRatio*100).toFixed(0)}%, trails: ${rep.distinctTrails.join(', ')}`);
  }

  // ── 3. Extract full structured data for each target ──
  function extractClusterData(cluster, graph) {
    const rep = cluster.representative;
    const rawLoop = rep._raw;

    // Ordered segments with per-segment features
    const segments = rawLoop.segList.map(({ seg, fromNode }) => {
      const toNode = seg.startNode === fromNode ? seg.endNode : seg.startNode;
      // Geo midpoint
      const fn = graph.nodes.get(fromNode);
      const tn = graph.nodes.get(toNode);
      const midLat = fn && tn ? (fn.lat + tn.lat) / 2 : null;
      const midLon = fn && tn ? (fn.lon + tn.lon) / 2 : null;

      return {
        trailName: seg.name || '(unnamed connector)',
        lengthMi: seg.lengthMi,
        fromJunction: junctionLabel(fromNode),
        toJunction: junctionLabel(toNode),
        midpoint: midLat ? { lat: Number(midLat.toFixed(4)), lon: Number(midLon.toFixed(4)) } : null,
        peaks: seg.nearbyPeaks.map(f => f.name).filter(Boolean),
        passes: seg.nearbyPasses.filter(f => f.type === 'saddle' || f.type === 'pass').map(f => f.name).filter(Boolean),
        lakes: [...(seg.nearbyLakes || [])].map(f => f.name).filter(Boolean),
        streams: [...(seg.nearbyStreams || [])].map(f => f.name).filter(Boolean),
        springs: seg.nearbySprings.map(f => f.name).filter(Boolean),
        landmarks: [...(seg.nearbyLandmarks || [])].map(f => f.name).filter(Boolean),
      };
    });

    // Unique trailheads across all cluster members
    const trailheadStarts = new Set();
    for (const m of cluster.members) trailheadStarts.add(m.start);

    // Geographic center
    const juncIds = new Set();
    for (const { seg } of rawLoop.segList) {
      juncIds.add(seg.startNode);
      juncIds.add(seg.endNode);
    }
    let sumLat = 0, sumLon = 0, count = 0;
    for (const jid of juncIds) {
      const n = graph.nodes.get(jid);
      if (n) { sumLat += n.lat; sumLon += n.lon; count++; }
    }

    // Deduplicated feature summary
    const allFeatures = {};
    for (const s of segments) {
      for (const p of s.peaks) allFeatures[p] = 'peak';
      for (const p of s.passes) allFeatures[p] = 'pass';
      for (const l of s.lakes) allFeatures[l] = 'lake';
      for (const st of s.streams) allFeatures[st] = 'stream';
      for (const sp of s.springs) allFeatures[sp] = 'spring';
      for (const lm of s.landmarks) allFeatures[lm] = 'landmark';
    }

    return {
      clusterSize: cluster.members.length,
      totalMiles: rep.miles,
      distinctTrailCount: rep.distinctTrailCount,
      distinctFeatureCount: rep.featureCount,
      htRatio: Number((rep.htRatio * 100).toFixed(0)),
      geoCenter: { lat: Number((sumLat / count).toFixed(4)), lon: Number((sumLon / count).toFixed(4)) },
      trailheads: [...trailheadStarts].sort(),
      allFeatures: Object.entries(allFeatures).map(([name, type]) => ({ name, type })).sort((a, b) => a.name.localeCompare(b.name)),
      segments,
    };
  }

  const clusterData = {};
  for (const t of targets) {
    clusterData[t.label] = extractClusterData(t.cluster, graph);
  }

  // ── 4. Output as JSON ──
  const output = {
    userPreferences: {
      days: 4,
      milesPerDay: '~10',
      experience: 'intermediate',
      interests: 'alpine lakes and named peaks',
      permits: 'no permits if possible',
      month: 'July',
      access: 'willing to drive from Bishop',
    },
    candidateRoutes: clusterData,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
