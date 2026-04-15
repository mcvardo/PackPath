// fetch-overpass.js
// Pulls trail, trailhead, water, and feature data from OpenStreetMap
// for a bounding box covering the Ansel Adams Wilderness.
//
// Caches the response to disk so we don't hammer the public Overpass instance
// while iterating on the parser.

import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE_PATH = path.join(import.meta.dirname, 'cache', 'ansel-adams.json');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Bounding box: (south, west, north, east)
// Covers Ansel Adams Wilderness + a buffer for trailheads on the edges.
// Includes Mammoth Lakes / Devils Postpile area to the east and
// the Ritter Range / Thousand Island Lake area in the core.
const BBOX = '37.55,-119.30,37.90,-118.90';

const QUERY = `
[out:json][timeout:90];
(
  // Named hiking trails and paths
  way["highway"="path"]["name"](${BBOX});
  way["highway"="footway"]["name"](${BBOX});
  way["highway"="path"]["sac_scale"](${BBOX});
  way["route"="hiking"](${BBOX});

  // Trailheads (multiple tagging conventions in the wild)
  node["highway"="trailhead"](${BBOX});
  node["information"="trailhead"](${BBOX});
  node["amenity"="parking"]["hiking"="yes"](${BBOX});

  // Water features
  node["natural"="spring"](${BBOX});
  way["waterway"="stream"](${BBOX});
  way["waterway"="river"](${BBOX});
  way["natural"="water"](${BBOX});

  // Named features for scenery and navigation
  node["natural"="peak"]["name"](${BBOX});
  node["natural"="saddle"](${BBOX});
  node["mountain_pass"="yes"](${BBOX});
  node["natural"="waterfall"](${BBOX});
  node["natural"="cliff"]["name"](${BBOX});
  node["tourism"="attraction"]["name"](${BBOX});
  node["tourism"="viewpoint"](${BBOX});
  node["historic"]["name"](${BBOX});
  node["geological"]["name"](${BBOX});
  node["place"="locality"]["name"](${BBOX});
);
out body;
>;
out skel qt;
`.trim();

async function fetchOverpass() {
  // Use cache if it exists
  try {
    const cached = await fs.readFile(CACHE_PATH, 'utf-8');
    console.log(`Using cached response from ${CACHE_PATH}`);
    return JSON.parse(cached);
  } catch {
    // not cached, fetch fresh
  }

  console.log('Fetching from Overpass API...');
  console.log(`Bounding box: ${BBOX}`);
  const start = Date.now();

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(QUERY)}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Overpass returned ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Got response in ${elapsed}s — ${data.elements.length} elements`);

  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(data));
  console.log(`Cached to ${CACHE_PATH}`);

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
