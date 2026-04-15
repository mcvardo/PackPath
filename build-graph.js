// build-graph.js
// Transforms an Overpass JSON response into a trail graph:
//   - Nodes = junctions (where 2+ trails meet) and endpoints (trailheads, dead ends)
//   - Edges = segments (continuous trail between two junctions)
//
// Each segment carries: name, length_miles, gain_ft, loss_ft, point_geometry,
// and nearby features (water, peaks, passes) within a buffer.
//
// Elevation is left as null in this pass — we'll fill it in a separate step
// from a DEM service so the graph builder stays pure and testable.

const EARTH_RADIUS_MI = 3958.8;
const FEATURE_BUFFER_MI = 0.06; // ~100m — "you can see/reach it from the trail"

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(a));
}

function classifyElements(elements) {
  const nodes = new Map(); // id -> {lat, lon, tags}
  const trailWays = []; // ways that are walkable trails
  const waterWays = []; // streams, rivers
  const lakeWays = [];  // named lake/pond polygons
  const trailheadNodes = [];
  const peakNodes = [];
  const passNodes = [];
  const springNodes = [];
  const landmarkNodes = []; // waterfalls, attractions, viewpoints, historic, geological, localities

  for (const el of elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lon: el.lon, tags: el.tags || {} });
      const t = el.tags || {};
      if (t.highway === 'trailhead' || t.information === 'trailhead') {
        trailheadNodes.push(el);
      }
      if (t.natural === 'peak' && t.name) {
        // Filter out terrain features misclassified as peaks in OSM/GNIS.
        // Names containing stairway, gap, notch, chute, step, bench, ledge, shelf
        // indicate terrain features, not summits.
        const NON_PEAK_PATTERN = /stairway|stairs|gap|notch|chute|steps?(?:\s|$)|bench|ledge|shelf|ramp/i;
        if (!NON_PEAK_PATTERN.test(t.name)) {
          peakNodes.push(el);
        } else {
          landmarkNodes.push(el);  // reclassify as landmark
        }
      }
      if (t.mountain_pass === 'yes' || t.natural === 'saddle') passNodes.push(el);
      if (t.natural === 'spring') springNodes.push(el);
      // Broader landmark categories
      if (t.natural === 'waterfall') landmarkNodes.push(el);
      if (t.natural === 'cliff' && t.name) landmarkNodes.push(el);
      if (t.tourism === 'attraction' && t.name) landmarkNodes.push(el);
      if (t.tourism === 'viewpoint') landmarkNodes.push(el);
      if (t.historic && t.name) landmarkNodes.push(el);
      if (t.geological && t.name) landmarkNodes.push(el);
      if (t.place === 'locality' && t.name) landmarkNodes.push(el);
    } else if (el.type === 'way') {
      const t = el.tags || {};
      const isTrail =
        t.highway === 'path' ||
        t.highway === 'footway' ||
        t.route === 'hiking' ||
        t.sac_scale;
      const isStream = t.waterway === 'stream' || t.waterway === 'river';
      const isLake = t.natural === 'water';
      if (isTrail) trailWays.push(el);
      else if (isStream) waterWays.push(el);
      else if (isLake) lakeWays.push(el);
    }
  }

  return {
    nodes,
    trailWays,
    waterWays,
    trailheadNodes,
    peakNodes,
    passNodes,
    springNodes,
    landmarkNodes,
    lakeWays,
  };
}

function findJunctions(trailWays, trailheadNodeIds) {
  // A node is a junction if it appears in 2+ trail ways, OR it's a trailhead,
  // OR it's an endpoint of any trail way (terminus / dead end).
  const nodeUsage = new Map(); // nodeId -> count of trail ways it appears in

  for (const way of trailWays) {
    // Use a Set so a way that loops back on itself doesn't double-count.
    for (const nodeId of new Set(way.nodes)) {
      nodeUsage.set(nodeId, (nodeUsage.get(nodeId) || 0) + 1);
    }
  }

  const junctions = new Set();
  for (const [id, count] of nodeUsage) {
    if (count >= 2) junctions.add(id);
  }
  for (const id of trailheadNodeIds) junctions.add(id);
  for (const way of trailWays) {
    junctions.add(way.nodes[0]);
    junctions.add(way.nodes[way.nodes.length - 1]);
  }

  return junctions;
}

function splitWayAtJunctions(way, junctions) {
  // Walk the way's node list and break it into sub-segments at every junction.
  const segments = [];
  let current = [way.nodes[0]];
  for (let i = 1; i < way.nodes.length; i++) {
    current.push(way.nodes[i]);
    if (junctions.has(way.nodes[i]) && i < way.nodes.length - 1) {
      segments.push(current);
      current = [way.nodes[i]];
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

function segmentLengthMiles(nodeIds, nodes) {
  let total = 0;
  for (let i = 1; i < nodeIds.length; i++) {
    const a = nodes.get(nodeIds[i - 1]);
    const b = nodes.get(nodeIds[i]);
    if (!a || !b) continue;
    total += haversineMiles(a.lat, a.lon, b.lat, b.lon);
  }
  return total;
}

function segmentBoundingBox(nodeIds, nodes) {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const id of nodeIds) {
    const n = nodes.get(id);
    if (!n) continue;
    if (n.lat < minLat) minLat = n.lat;
    if (n.lat > maxLat) maxLat = n.lat;
    if (n.lon < minLon) minLon = n.lon;
    if (n.lon > maxLon) maxLon = n.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

function findNearbyFeatures(segmentNodeIds, nodes, featureNodes, bufferMi) {
  // Cheap pass: check each feature against the segment's bbox first,
  // then do the per-point haversine only for features inside the bbox.
  const bbox = segmentBoundingBox(segmentNodeIds, nodes);
  const latBuffer = bufferMi / 69; // ~degrees latitude per mile
  const nearby = [];

  for (const feature of featureNodes) {
    if (feature.lat < bbox.minLat - latBuffer) continue;
    if (feature.lat > bbox.maxLat + latBuffer) continue;
    const lonBuffer = bufferMi / (69 * Math.cos((feature.lat * Math.PI) / 180));
    if (feature.lon < bbox.minLon - lonBuffer) continue;
    if (feature.lon > bbox.maxLon + lonBuffer) continue;

    // Closest distance from feature to any node on the segment
    let minDist = Infinity;
    for (const id of segmentNodeIds) {
      const n = nodes.get(id);
      if (!n) continue;
      const d = haversineMiles(feature.lat, feature.lon, n.lat, n.lon);
      if (d < minDist) minDist = d;
    }
    if (minDist <= bufferMi) {
      nearby.push({
        id: feature.id,
        name: feature.tags?.name || null,
        type:
          feature.tags?.natural ||
          (feature.tags?.mountain_pass === 'yes' ? 'pass' : 'feature'),
        distMi: Number(minDist.toFixed(3)),
      });
    }
  }

  return nearby;
}

const PEAK_BUFFER_MI = 0.93; // ~1500m — peaks visible from trail
const LAKE_BUFFER_MI = 0.25; // ~400m — trails wrap around shorelines
const STREAM_BUFFER_MI = 0.031; // ~50m — trails follow streams closely

function findNearbyPeaks(segmentNodeIds, nodes, peakNodes, bufferMi) {
  // Like findNearbyFeatures but with a closest-peak-per-segment rule:
  // only attach a named peak if no other named peak is closer to this segment.
  // This prevents a segment under Banner Peak from also getting Mount Ritter
  // and Mount Davis just because they're in the wider buffer.
  const candidates = findNearbyFeatures(segmentNodeIds, nodes, peakNodes, bufferMi);
  if (candidates.length <= 1) return candidates;

  // Sort by distance, then keep only the closest peak.
  // Also keep any peak that's within the tight buffer (FEATURE_BUFFER_MI) regardless.
  candidates.sort((a, b) => a.distMi - b.distMi);
  const closest = candidates[0];
  const result = [closest];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].distMi <= FEATURE_BUFFER_MI) {
      result.push(candidates[i]); // very close — definitely visible from trail
    }
  }
  return result;
}

function findNearbyPolygonFeatures(segmentNodeIds, nodes, wayFeatures, bufferMi) {
  // Like findNearbyFeatures but for way-based features (lakes, etc.).
  // For each way feature, find the closest distance from any node in the
  // way's node list to any node in the segment.  Attach if within buffer.
  const segBbox = segmentBoundingBox(segmentNodeIds, nodes);
  const latBuffer = bufferMi / 69;
  const nearby = [];

  for (const way of wayFeatures) {
    const name = way.tags?.name;
    if (!name) continue;

    // Quick bbox reject: compute the way's bbox and check overlap
    let wMinLat = Infinity, wMaxLat = -Infinity, wMinLon = Infinity, wMaxLon = -Infinity;
    for (const nid of way.nodes) {
      const n = nodes.get(nid);
      if (!n) continue;
      if (n.lat < wMinLat) wMinLat = n.lat;
      if (n.lat > wMaxLat) wMaxLat = n.lat;
      if (n.lon < wMinLon) wMinLon = n.lon;
      if (n.lon > wMaxLon) wMaxLon = n.lon;
    }
    if (wMinLat > segBbox.maxLat + latBuffer) continue;
    if (wMaxLat < segBbox.minLat - latBuffer) continue;
    const midLat = (wMinLat + wMaxLat) / 2;
    const lonBuffer = bufferMi / (69 * Math.cos((midLat * Math.PI) / 180));
    if (wMinLon > segBbox.maxLon + lonBuffer) continue;
    if (wMaxLon < segBbox.minLon - lonBuffer) continue;

    // Detailed check: closest distance between any way node and any segment node.
    // Sample the way nodes (for large polygons, every 3rd node is plenty).
    let minDist = Infinity;
    const step = Math.max(1, Math.floor(way.nodes.length / 40));
    for (let wi = 0; wi < way.nodes.length; wi += step) {
      const wn = nodes.get(way.nodes[wi]);
      if (!wn) continue;
      for (const sid of segmentNodeIds) {
        const sn = nodes.get(sid);
        if (!sn) continue;
        const d = haversineMiles(wn.lat, wn.lon, sn.lat, sn.lon);
        if (d < minDist) minDist = d;
        if (d < bufferMi) break; // early exit — already close enough
      }
      if (minDist < bufferMi) break;
    }

    if (minDist <= bufferMi) {
      const type = way.tags?.water || way.tags?.waterway || way.tags?.natural || 'water';
      nearby.push({
        id: way.id,
        name,
        type,
        distMi: Number(minDist.toFixed(3)),
      });
    }
  }

  return nearby;
}

function computeBbox(nodes) {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const n of nodes.values()) {
    if (n.lat < minLat) minLat = n.lat;
    if (n.lat > maxLat) maxLat = n.lat;
    if (n.lon < minLon) minLon = n.lon;
    if (n.lon > maxLon) maxLon = n.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

const BOUNDARY_TOLERANCE_DEG = 0.005; // ~0.3 mi

function isOnBoundary(node, bbox) {
  return (
    Math.abs(node.lat - bbox.minLat) < BOUNDARY_TOLERANCE_DEG ||
    Math.abs(node.lat - bbox.maxLat) < BOUNDARY_TOLERANCE_DEG ||
    Math.abs(node.lon - bbox.minLon) < BOUNDARY_TOLERANCE_DEG ||
    Math.abs(node.lon - bbox.maxLon) < BOUNDARY_TOLERANCE_DEG
  );
}

export function buildGraph(overpassData, options = {}) {
  const { elements } = overpassData;
  const classified = classifyElements(elements);
  const { nodes, trailWays, waterWays, peakNodes, passNodes, springNodes, landmarkNodes, lakeWays, trailheadNodes } =
    classified;

  const trailheadIds = new Set(trailheadNodes.map((n) => n.id));
  const junctions = findJunctions(trailWays, trailheadIds);
  // Use the query bbox if the caller provided one (real production usage).
  // Otherwise fall back to the data-derived bbox, but skip boundary detection
  // because every extreme node would falsely look like a boundary.
  const bbox = options.queryBbox || computeBbox(nodes);
  const detectBoundary = !!options.queryBbox;

  // Phase 1: collect all raw sub-segments per way, with their node lists.
  const rawSubs = [];
  for (const way of trailWays) {
    const subs = splitWayAtJunctions(way, junctions);
    for (const sub of subs) {
      rawSubs.push({ way, nodeIds: sub });
    }
  }

  // Phase 2: merge micro-segments (< 0.01 mi) into a neighbour so they act as
  // connectors instead of being silently dropped — which was severing trails
  // at OSM way boundaries where mappers split a way into tiny bridge pieces.
  //
  // Strategy: for each micro-segment, find an adjacent sub-segment that shares
  // its start or end node and merge the node lists.  If no neighbour exists
  // (isolated junk), drop it as before.
  const MICRO_THRESHOLD = 0.01; // miles

  // Index: junction node -> [indices into rawSubs that touch it]
  const nodeToSubs = new Map();
  for (let i = 0; i < rawSubs.length; i++) {
    const sub = rawSubs[i];
    const start = sub.nodeIds[0];
    const end = sub.nodeIds[sub.nodeIds.length - 1];
    for (const n of [start, end]) {
      if (!nodeToSubs.has(n)) nodeToSubs.set(n, []);
      nodeToSubs.get(n).push(i);
    }
  }

  const merged = new Set(); // indices already consumed by a merge
  for (let i = 0; i < rawSubs.length; i++) {
    const sub = rawSubs[i];
    const len = segmentLengthMiles(sub.nodeIds, nodes);
    if (len >= MICRO_THRESHOLD) continue; // not micro — leave it alone

    // Try to merge into a neighbour at either endpoint
    const endpoints = [
      sub.nodeIds[0],
      sub.nodeIds[sub.nodeIds.length - 1],
    ];
    let didMerge = false;
    for (const ep of endpoints) {
      const neighbours = (nodeToSubs.get(ep) || []).filter(
        (j) => j !== i && !merged.has(j)
      );
      if (neighbours.length === 0) continue;

      // Pick the first non-micro neighbour; fall back to any neighbour.
      const target =
        neighbours.find(
          (j) => segmentLengthMiles(rawSubs[j].nodeIds, nodes) >= MICRO_THRESHOLD
        ) ?? neighbours[0];

      const tgt = rawSubs[target];
      const tgtStart = tgt.nodeIds[0];
      const tgtEnd = tgt.nodeIds[tgt.nodeIds.length - 1];

      // Splice the micro node list onto the correct end of the target.
      if (tgtEnd === sub.nodeIds[0]) {
        // target ... ep -> micro ...
        tgt.nodeIds = tgt.nodeIds.concat(sub.nodeIds.slice(1));
      } else if (tgtStart === sub.nodeIds[sub.nodeIds.length - 1]) {
        // micro ... ep -> target ...
        tgt.nodeIds = sub.nodeIds.slice(0, -1).concat(tgt.nodeIds);
      } else if (tgtEnd === sub.nodeIds[sub.nodeIds.length - 1]) {
        // target ... ep <- micro (reversed)
        tgt.nodeIds = tgt.nodeIds.concat(sub.nodeIds.slice(0, -1).reverse());
      } else if (tgtStart === sub.nodeIds[0]) {
        // micro (reversed) -> ep ... target
        tgt.nodeIds = sub.nodeIds.slice(1).reverse().concat(tgt.nodeIds);
      } else {
        continue; // shouldn't happen — endpoints didn't match
      }

      merged.add(i);
      didMerge = true;
      break;
    }

    // No neighbour found — truly isolated junk, drop it.
    if (!didMerge) merged.add(i);
  }

  // Phase 3: build final segment objects from surviving sub-segments.
  const segments = [];
  for (let i = 0; i < rawSubs.length; i++) {
    if (merged.has(i)) continue;
    const { way, nodeIds: sub } = rawSubs[i];
    const lengthMi = segmentLengthMiles(sub, nodes);
    if (lengthMi < 0.001) continue; // safety net for degenerate merges
    segments.push({
      wayId: way.id,
      name: way.tags?.name || null,
      sacScale: way.tags?.sac_scale || null,
      startNode: sub[0],
      endNode: sub[sub.length - 1],
      nodeIds: sub.slice(), // full ordered node list for elevation pass
      nodeCount: sub.length,
      lengthMi: Number(lengthMi.toFixed(3)),
      gainFt: null, // filled in by elevation pass
      lossFt: null,
      nearbyPeaks: findNearbyPeaks(sub, nodes, peakNodes, PEAK_BUFFER_MI),
      nearbyPasses: findNearbyFeatures(sub, nodes, passNodes, FEATURE_BUFFER_MI),
      nearbySprings: findNearbyFeatures(sub, nodes, springNodes, FEATURE_BUFFER_MI),
      nearbyLandmarks: findNearbyFeatures(sub, nodes, landmarkNodes, FEATURE_BUFFER_MI),
      nearbyLakes: findNearbyPolygonFeatures(sub, nodes, lakeWays, LAKE_BUFFER_MI),
      nearbyStreams: findNearbyPolygonFeatures(sub, nodes, waterWays, STREAM_BUFFER_MI),
    });
  }

  // Build adjacency: junctionId -> segments touching it
  const adjacency = new Map();
  for (const seg of segments) {
    for (const j of [seg.startNode, seg.endNode]) {
      if (!adjacency.has(j)) adjacency.set(j, []);
      adjacency.get(j).push(seg);
    }
  }

  // Flag boundary junctions: a junction with degree 1 (one segment touching it)
  // that sits on the bbox edge is almost certainly a clipped trail, not a real
  // dead end. The graph search will skip these as start/end candidates.
  const boundaryJunctions = new Set();
  if (detectBoundary) {
    for (const [juncId, segs] of adjacency) {
      if (segs.length !== 1) continue;
      const node = nodes.get(juncId);
      if (node && isOnBoundary(node, bbox)) boundaryJunctions.add(juncId);
    }
  }

  return {
    nodes, // raw OSM nodes (for coordinate lookup)
    bbox,
    junctions, // Set of junction node IDs
    boundaryJunctions, // Set of clipped-at-bbox junctions
    segments, // Array of segments
    adjacency, // junctionId -> [segments]
    trailheads: trailheadNodes,
    peaks: peakNodes,
    passes: passNodes,
    springs: springNodes,
    landmarks: landmarkNodes,
    lakes: lakeWays,
    waterWays: classified.waterWays,
  };
}

export function summarizeGraph(graph) {
  const namedSegs = graph.segments.filter((s) => s.name);
  const trailNames = new Set(namedSegs.map((s) => s.name));
  const totalMi = graph.segments.reduce((sum, s) => sum + s.lengthMi, 0);
  const namedMi = namedSegs.reduce((sum, s) => sum + s.lengthMi, 0);

  // Connected component analysis — are all trails in one network or scattered?
  const visited = new Set();
  const components = [];
  for (const startJunc of graph.junctions) {
    if (visited.has(startJunc)) continue;
    const stack = [startJunc];
    const comp = new Set();
    while (stack.length) {
      const j = stack.pop();
      if (visited.has(j)) continue;
      visited.add(j);
      comp.add(j);
      const segs = graph.adjacency.get(j) || [];
      for (const seg of segs) {
        const other = seg.startNode === j ? seg.endNode : seg.startNode;
        if (!visited.has(other)) stack.push(other);
      }
    }
    components.push(comp.size);
  }
  components.sort((a, b) => b - a);

  return {
    rawElements: {
      nodes: graph.nodes.size,
      trailheads: graph.trailheads.length,
      peaks: graph.peaks.length,
      passes: graph.passes.length,
      springs: graph.springs.length,
    },
    graph: {
      junctions: graph.junctions.size,
      boundaryJunctions: graph.boundaryJunctions.size,
      segments: graph.segments.length,
      namedSegments: namedSegs.length,
      uniqueTrailNames: trailNames.size,
      totalMiles: Number(totalMi.toFixed(1)),
      namedMiles: Number(namedMi.toFixed(1)),
      namedPct: Number(((namedMi / totalMi) * 100).toFixed(0)),
    },
    connectivity: {
      componentCount: components.length,
      largestComponent: components[0] || 0,
      largestComponentPct: Number(
        (((components[0] || 0) / graph.junctions.size) * 100).toFixed(0)
      ),
      top5: components.slice(0, 5),
      note: 'Small components are usually trails clipped by the bounding box, not real disconnects.',
    },
    sampleTrailNames: [...trailNames].slice(0, 20),
  };
}
