// find-loops.js
// Enumerate simple loops (25–45 mi) in the main backcountry component.
// Uses recursive DFS with mutable state for performance.
//
// Usage: node find-loops.js [--region=<id>]
// Default region: ansel-adams

import fs from 'node:fs/promises';
import path from 'node:path';
import { buildGraph } from './build-graph.js';

function getRegionId() {
  const arg = process.argv.find(a => a.startsWith('--region='));
  return arg ? arg.split('=')[1] : 'ansel-adams';
}

const SAMPLE_STEP = 1;
const ELEV_THRESHOLD_FT = 10;
const SMOOTH_WINDOW = 5;
const METERS_TO_FEET = 3.28084;
const MIN_MI = 25;
const MAX_MI = 45;
const PER_ANCHOR_CAP = 2_000;
const MAX_DEPTH = 40;

async function main() {
  const t0 = Date.now();
  const regionId = getRegionId();
  const regionPath = path.join(import.meta.dirname, 'regions', `${regionId}.json`);
  const osmCachePath = path.join(import.meta.dirname, 'cache', `${regionId}.json`);
  const elevCachePath = path.join(import.meta.dirname, 'cache', `${regionId}-elevation.json`);
  const clusterOutPath = path.join(import.meta.dirname, 'cache', `${regionId}-clusters.json`);

  let regionConfig;
  try {
    regionConfig = JSON.parse(await fs.readFile(regionPath, 'utf-8'));
  } catch {
    throw new Error(`Region config not found: ${regionPath}`);
  }

  const { bbox: b, seedTrail } = regionConfig;
  const QUERY_BBOX = { minLat: b.minLat, minLon: b.minLon, maxLat: b.maxLat, maxLon: b.maxLon };

  console.log(`Finding loops for region: ${regionConfig.name}`);

  const data = JSON.parse(await fs.readFile(osmCachePath, 'utf-8'));
  const graph = buildGraph(data, { queryBbox: QUERY_BBOX });

  // Apply elevation data from the enrichment cache
  let elevCache = {};
  try {
    elevCache = JSON.parse(await fs.readFile(elevCachePath, 'utf-8'));
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
    console.log(`Applied elevation to ${enriched} segments from ${elevCachePath}`);
  } catch {
    console.log('WARNING: No elevation cache found. Run enrich-elevation.js first. Elevation will be 0 for all segments.');
  }

  // ── 1. Main connected component ───────────────────────────────────────
  const mainComp = new Set();
  {
    // Find seed trail segment — fall back to first segment if not found
    const seedSeg = graph.segments.find(s => s.name === seedTrail) || graph.segments[0];
    if (!seedSeg) throw new Error('No segments found in graph — check OSM data');
    const seed = seedSeg.startNode;
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

  console.log(`Main component: ${mainComp.size} junctions, ${mainSegments.length} segments`);
  console.log(`Start nodes: ${startNodes.length}`);
  console.log(`Dijkstra precompute done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // ── 2. DFS loop search ────────────────────────────────────────────────
  function dirId(seg, fromNode) {
    const idx = segIndex.get(seg);
    return seg.startNode === fromNode ? idx * 2 : idx * 2 + 1;
  }

  const rawLoops = [];
  let totalCandidates = 0;

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
        totalCandidates++;
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

  console.log(`\nRaw loops: ${rawLoops.length}  (per-anchor cap: ${PER_ANCHOR_CAP})`);
  console.log(`Time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // ── 3. Deduplicate ────────────────────────────────────────────────────
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
  console.log(`Unique loops after dedup: ${uniqueLoops.length}`);

  // ── 4. Score and cluster ──────────────────────────────────────────────
  const HIGH_TRAFFIC_TRAILS = new Set(['John Muir Trail', 'Pacific Crest Trail', 'Continental Divide Trail', 'Appalachian Trail']);

  const scored = uniqueLoops.map(loop => {
    const trailNamesInOrder = loop.segList.map(({ seg }) => seg.name || '(unnamed)');
    const distinctTrails = new Set(loop.segList.map(({ seg }) => seg.name).filter(Boolean));

    const featureSet = new Map();
    for (const { seg } of loop.segList) {
      for (const f of [...(seg.nearbyPeaks || []), ...(seg.nearbyPasses || []), ...(seg.nearbySprings || []), ...(seg.nearbyLandmarks || []), ...(seg.nearbyLakes || [])]) {
        if (f.name && !featureSet.has(f.id)) featureSet.set(f.id, { name: f.name, type: f.type });
      }
      for (const f of (seg.nearbyStreams || [])) {
        const key = `stream:${f.name}`;
        if (f.name && !featureSet.has(key)) featureSet.set(key, { name: f.name, type: f.type });
      }
    }

    const collapsed = [];
    for (const n of trailNamesInOrder) {
      if (!collapsed.length || collapsed[collapsed.length - 1] !== n) collapsed.push(n);
    }

    let totalGainFt = 0, totalLossFt = 0;
    for (const { seg, fromNode } of loop.segList) {
      const forward = fromNode === seg.startNode;
      totalGainFt += (forward ? seg.gainFt : seg.lossFt) || 0;
      totalLossFt += (forward ? seg.lossFt : seg.gainFt) || 0;
    }

    return {
      miles: Number(loop.miles.toFixed(1)),
      totalGainFt,
      totalLossFt,
      trailRoute: collapsed,
      distinctTrailCount: distinctTrails.size,
      distinctTrails: [...distinctTrails].sort(),
      features: [...featureSet.values()].sort((a, b) => a.name.localeCompare(b.name)),
      featureCount: featureSet.size,
      start: junctionLabel(loop.startNode),
    };
  });

  // Cluster near-duplicates (>60% segment overlap)
  const scoredWithRaw = scored.map((s, i) => {
    const segSet = new Set();
    for (const { seg } of uniqueLoops[i].segList) segSet.add(segIndex.get(seg));
    return { ...s, _segSet: segSet, _idx: i };
  });

  function segSetIoU(a, b) {
    let intersection = 0;
    for (const s of a) if (b.has(s)) intersection++;
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  const byQuality = scoredWithRaw.slice().sort((a, b) => b.featureCount - a.featureCount || a.miles - b.miles);
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

  const clusterReps = clusters.map(c => c.representative);
  console.log(`\nClusters: ${clusters.length} distinct route families (from ${scored.length} unique loops)`);

  // Compute cluster signals
  const clusterSignals = clusters.map(cl => {
    const rep = cl.representative;
    const passes = rep.features.filter(f => f.type === 'saddle' || f.type === 'pass').map(f => f.name);
    const lakes = rep.features.filter(f => f.type === 'lake' || f.type === 'water' || f.type === 'reservoir').map(f => f.name);
    const peaks = rep.features.filter(f => f.type === 'peak').map(f => f.name);

    const trailheadStarts = new Set();
    for (const m of cl.members) trailheadStarts.add(m.start);

    const rawRepLoop = uniqueLoops[rep._idx];
    let htMiles = 0, totalMiles = 0;
    for (const { seg } of rawRepLoop.segList) {
      totalMiles += seg.lengthMi;
      if (seg.name && HIGH_TRAFFIC_TRAILS.has(seg.name)) htMiles += seg.lengthMi;
    }
    const htRatio = totalMiles > 0 ? htMiles / totalMiles : 0;

    const juncIds = new Set();
    for (const { seg } of rawRepLoop.segList) {
      juncIds.add(seg.startNode);
      juncIds.add(seg.endNode);
    }
    let sumLat = 0, sumLon = 0, count = 0;
    for (const jid of juncIds) {
      const n = graph.nodes.get(jid);
      if (n) { sumLat += n.lat; sumLon += n.lon; count++; }
    }

    const nameCounts = {};
    for (const t of rep.distinctTrails) nameCounts[t] = 0;
    for (const { seg } of rawRepLoop.segList) {
      if (seg.name && nameCounts[seg.name] !== undefined) nameCounts[seg.name] += seg.lengthMi;
    }
    const topTrail = Object.entries(nameCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '(unnamed)';

    return {
      size: cl.members.length,
      miles: rep.miles,
      trailCount: rep.distinctTrailCount,
      featureCount: rep.featureCount,
      distinctPasses: [...new Set(passes)].length,
      distinctLakes: [...new Set(lakes)].length,
      distinctPeaks: [...new Set(peaks)].length,
      uniqueTrailheads: trailheadStarts.size,
      htRatio,
      centerLat: count > 0 ? sumLat / count : 0,
      centerLon: count > 0 ? sumLon / count : 0,
      totalGainFt: rep.totalGainFt,
      totalLossFt: rep.totalLossFt,
      topTrail,
      rep,
      passNames: [...new Set(passes)],
      peakNames: [...new Set(peaks)],
    };
  });

  // ── 5. Export ─────────────────────────────────────────────────────────
  const MAX_COORDS_PER_SEG = 20;

  const exportClusters = clusterSignals.map((sig) => {
    const rep = sig.rep;
    const rawRepLoop = uniqueLoops[rep._idx];

    const segments = rawRepLoop.segList.map(({ seg, fromNode }) => {
      const midIdx = Math.floor(seg.nodeIds.length / 2);
      const midNode = graph.nodes.get(seg.nodeIds[midIdx]);
      const forward = fromNode === seg.startNode;
      const nodeIds = forward ? seg.nodeIds : [...seg.nodeIds].reverse();
      const step = Math.max(1, Math.floor(nodeIds.length / MAX_COORDS_PER_SEG));
      const sampledIds = [];
      for (let si = 0; si < nodeIds.length; si += step) sampledIds.push(nodeIds[si]);
      if (sampledIds[sampledIds.length - 1] !== nodeIds[nodeIds.length - 1]) {
        sampledIds.push(nodeIds[nodeIds.length - 1]);
      }
      const coords = sampledIds.map(nid => graph.nodes.get(nid)).filter(Boolean).map(n => [n.lat, n.lon]);

      return {
        trailName: seg.name || '(unnamed)',
        lengthMi: seg.lengthMi,
        gainFt: (forward ? seg.gainFt : seg.lossFt) || 0,
        lossFt: (forward ? seg.lossFt : seg.gainFt) || 0,
        fromJunction: junctionLabel(fromNode),
        toJunction: junctionLabel(seg.startNode === fromNode ? seg.endNode : seg.startNode),
        midpoint: midNode ? { lat: midNode.lat, lon: midNode.lon } : null,
        coords,
        peaks: [...new Set((seg.nearbyPeaks || []).map(f => f.name).filter(Boolean))],
        passes: [...new Set((seg.nearbyPasses || []).map(f => f.name).filter(Boolean))],
        lakes: [...new Set((seg.nearbyLakes || []).map(f => f.name).filter(Boolean))],
        streams: [...new Set((seg.nearbyStreams || []).map(f => f.name).filter(Boolean))],
        springs: [...new Set((seg.nearbySprings || []).map(f => f.name).filter(Boolean))],
        landmarks: [...new Set((seg.nearbyLandmarks || []).map(f => f.name).filter(Boolean))],
      };
    });

    return {
      miles: sig.miles,
      totalGainFt: sig.totalGainFt,
      totalLossFt: sig.totalLossFt,
      featureCount: sig.featureCount,
      features: rep.features,
      distinctLakes: sig.distinctLakes,
      distinctPeaks: sig.distinctPeaks,
      distinctPasses: sig.distinctPasses,
      htRatio: sig.htRatio,
      trailheadCount: sig.uniqueTrailheads,
      clusterSize: sig.size,
      centerLat: sig.centerLat,
      centerLon: sig.centerLon,
      topTrail: sig.topTrail,
      distinctTrailCount: sig.trailCount,
      distinctTrails: rep.distinctTrails,
      trailRoute: rep.trailRoute,
      passNames: sig.passNames,
      peakNames: sig.peakNames,
      start: rep.start,
      allFeatures: rep.features,
      segments,
    };
  });

  await fs.writeFile(clusterOutPath, JSON.stringify(exportClusters, null, 2));
  console.log(`\nExported ${exportClusters.length} clusters to ${clusterOutPath}`);
  console.log(`Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
