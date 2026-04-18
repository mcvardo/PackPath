// fetch-overpass.js
// Pulls trail, trailhead, water, and feature data from OpenStreetMap
// for a bounding box defined in the region config.
//
// Usage: node fetch-overpass.js [--region=<id>]
// Default region: ansel-adams

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function getRegionId() {
  const arg = process.argv.find(a => a.startsWith('--region='));
  return arg ? arg.split('=')[1] : 'ansel-adams';
}

function buildQuery(bbox) {
  return `[out:json][timeout:180];
(
  way["highway"="path"]["name"](${bbox});
  way["highway"="footway"]["name"](${bbox});
  way["highway"="path"]["sac_scale"](${bbox});
  way["route"="hiking"](${bbox});

  node["highway"="trailhead"](${bbox});
  node["information"="trailhead"](${bbox});
  node["amenity"="parking"]["hiking"="yes"](${bbox});

  node["natural"="spring"](${bbox});
  way["waterway"="stream"](${bbox});
  way["waterway"="river"](${bbox});
  way["natural"="water"](${bbox});

  node["natural"="peak"]["name"](${bbox});
  node["natural"="saddle"](${bbox});
  node["mountain_pass"="yes"](${bbox});
  node["natural"="waterfall"](${bbox});
  node["natural"="cliff"]["name"](${bbox});
  node["tourism"="attraction"]["name"](${bbox});
  node["tourism"="viewpoint"](${bbox});
  node["historic"]["name"](${bbox});
  node["geological"]["name"](${bbox});
  node["place"="locality"]["name"](${bbox});
);
out body;
>;
out skel qt;`.trim();
}

async function fetchOverpass(regionId) {
  const id = regionId || getRegionId();
  const regionPath = path.join(__dirname, 'regions', `${id}.json`);
  const cachePath = path.join(__dirname, 'cache', `${id}.json`);

  let regionConfig;
  try {
    regionConfig = JSON.parse(await fs.readFile(regionPath, 'utf-8'));
  } catch {
    throw new Error(`Region config not found: ${regionPath}`);
  }

  const { bbox: b } = regionConfig;
  const bbox = `${b.minLat},${b.minLon},${b.maxLat},${b.maxLon}`;
  const query = regionConfig.overpassQuery || buildQuery(bbox);

  // Use cache if it exists
  try {
    const cached = await fs.readFile(cachePath, 'utf-8');
    console.log(`Using cached response from ${cachePath}`);
    return JSON.parse(cached);
  } catch {
    // not cached, fetch fresh
  }

  console.log(`Fetching OSM data for region: ${regionConfig.name}`);
  console.log(`Bounding box: ${bbox}`);
  const start = Date.now();

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Overpass returned ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Got response in ${elapsed}s — ${data.elements.length} elements`);

  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(data));
  console.log(`Cached to ${cachePath}`);

  return data;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchOverpass()
    .then((data) => {
      console.log(`\nTotal elements: ${data.elements.length}`);
    })
    .catch((err) => {
      console.error('Failed:', err.message);
      process.exit(1);
    });
}

export { fetchOverpass };
