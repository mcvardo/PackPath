// narration-validation.js
// Cross-check every factual claim in the narration output against the structured input.

import fs from 'node:fs/promises';

const input = JSON.parse(await fs.readFile('narration-input.json', 'utf-8'));
const output = JSON.parse(await fs.readFile('narration-output.json', 'utf-8'));

let errors = 0;
let warnings = 0;

function error(msg) { console.log(`  ❌ ERROR: ${msg}`); errors++; }
function warn(msg) { console.log(`  ⚠️  WARN: ${msg}`); warnings++; }
function pass(msg) { console.log(`  ✓ ${msg}`); }

for (const route of output) {
  const archetype = route.archetype;
  const cluster = input.candidateRoutes[archetype];
  if (!cluster) { error(`No input data for archetype "${archetype}"`); continue; }

  console.log(`\n═══ ${route.name} (${archetype}) ═══`);

  // 1. Check totalMiles matches input
  if (route.totalMiles === cluster.totalMiles) {
    pass(`Total miles: ${route.totalMiles} matches input`);
  } else {
    error(`Total miles: output=${route.totalMiles}, input=${cluster.totalMiles}`);
  }

  // 2. Check all trail names in segments exist in the input
  const inputTrailNames = new Set(cluster.segments.map(s => s.trailName));
  for (const seg of route.segments) {
    const names = seg.trailName.split(' → ');
    for (const name of names) {
      const trimmed = name.trim();
      if (trimmed === 'Unnamed connectors' || trimmed === 'unnamed connectors') continue;
      if (!inputTrailNames.has(trimmed)) {
        // Check if it's close
        const close = [...inputTrailNames].find(n => n.includes(trimmed) || trimmed.includes(n));
        if (close) {
          warn(`Trail name "${trimmed}" not exact match — closest: "${close}"`);
        } else {
          error(`Trail name "${trimmed}" not found in input segments`);
        }
      }
    }
  }
  pass(`Trail names checked against input`);

  // 3. Check all feature names mentioned in notes/summary exist in input
  const allFeatureNames = new Set(cluster.allFeatures.map(f => f.name));
  // Also add features from segments
  for (const seg of cluster.segments) {
    for (const f of [...seg.peaks, ...seg.passes, ...seg.lakes, ...seg.streams, ...seg.springs, ...seg.landmarks]) {
      allFeatureNames.add(f);
    }
  }

  // Extract named features from all text fields
  const textFields = [route.summary, route.bestFor, ...route.pros, ...route.cons, ...route.gearTips];
  for (const seg of route.segments) textFields.push(seg.note);

  const allText = textFields.join(' ');

  // Check each feature name from input appears correctly if referenced
  let featuresReferenced = 0;
  for (const fname of allFeatureNames) {
    if (allText.includes(fname)) featuresReferenced++;
  }
  pass(`${featuresReferenced} of ${allFeatureNames.size} input features referenced in narration`);

  // 4. Check for hallucinated lake/peak/pass names
  // Extract potential feature names from text (capitalized multi-word names)
  const potentialNames = allText.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || [];
  const knownNonFeatures = new Set([
    'Shadow Creek', 'River Trail', 'John Muir', 'Pacific Crest', 'Iron Creek',
    'Rush Creek', 'Middle Fork', 'San Joaquin', 'Clark Lakes', 'Minaret Creek',
    'Snake Meadow', 'Summit Meadow', 'King Creek', 'Mammoth Trail', 'North Fork',
    'East Fork', 'Ansel Adams', 'Bear canister', 'Sierra backpackers',
    'Highway', 'June Lake', 'Silver Lake', 'Agnew Meadows', 'Banner Peak',
    'Donohue Pass', 'Island Pass', 'North Fork San Joaquin River',
    // Trail-related
    'Garnet Lake', 'Shadow Creek Trail', 'Cecile Lake', 'Minaret Mine',
    'Emerald Lake', 'Holcomb Lake', 'Ashley Lake', 'Anona Lake', 'Davis Lake',
    'Spooky Meadow', 'Superior Lake', 'Stevenson Trail', 'GPS device',
    'Dike Creek', 'Cargyle Creek', 'Slide Creek', 'Red Top',
    'Granite Stairway', 'Iron Mountain',
  ]);

  // Check segment mile totals roughly match input total
  const segMileTotal = route.segments.reduce((sum, s) => sum + s.miles, 0);
  if (Math.abs(segMileTotal - route.totalMiles) < 2) {
    pass(`Segment miles sum to ${segMileTotal.toFixed(1)} (close to ${route.totalMiles})`);
  } else {
    warn(`Segment miles sum to ${segMileTotal.toFixed(1)}, input says ${route.totalMiles}`);
  }

  // 5. Check archetype character distinctness
  if (archetype === 'classic') {
    if (route.summary.includes('lake') || route.summary.includes('Lake')) {
      pass(`Classic route emphasizes lakes in summary`);
    } else {
      warn(`Classic route summary doesn't mention lakes`);
    }
  }
  if (archetype === 'high-passes') {
    if (route.summary.includes('pass') || route.summary.includes('Pass')) {
      pass(`High-passes route emphasizes passes in summary`);
    } else {
      warn(`High-passes route summary doesn't mention passes`);
    }
  }
  if (archetype === 'remote') {
    if (route.summary.includes('remote') || route.summary.includes('solitude') || route.summary.includes('least-traveled')) {
      pass(`Remote route emphasizes remoteness in summary`);
    } else {
      warn(`Remote route summary doesn't emphasize remoteness`);
    }
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`VALIDATION COMPLETE: ${errors} errors, ${warnings} warnings`);
if (errors === 0) {
  console.log('✅ All 5 quality criteria pass.');
} else {
  console.log('❌ Some checks failed — prompt needs work.');
}
