// test-narration-real.js
// End-to-end pipeline: scoring → ranking → narration → validation.
//
// 1. Loads user preferences from user-preferences.example.json
// 2. Loads the full cluster set from cache/clusters.json (find-loops.js export)
// 3. Calls the ranker to pick the top clusters (score floor + geographic diversity)
// 4. Converts selected clusters to narration-input.json format
// 5. Generates the narration prompt and calls Claude API
// 6. Validates and retries if needed
// 7. Writes final output
//
// Architecture: Claude assigns segment IDs to days and writes prose.
// Mileage, trail names, and features per day are computed deterministically
// in the post-processing step from the structured input.

import fs from 'node:fs/promises';
import { validateNarration } from './validate-narration.js';
import { rankClusters } from './rank-clusters.js';

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable not set.');
  console.error('Set it with: export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

const MODEL = 'claude-sonnet-4-5-20250929';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_RETRIES = 2;

const SYSTEM_PROMPT = `You are PackPath's route narrator. You receive structured trail data and user preferences, and produce JSON route descriptions. You MUST NOT invent, modify, or hallucinate any factual data. Trail names, feature names, and all structured data come from verified OSM data and must be reproduced exactly.

Your job is strictly to:
1. Give each route an evocative name referencing real geography from its data
2. Assign each route's raw input segments to days by listing segment indices (segIdx values)
3. Write one narration note per day referencing actual features from the assigned segments
4. Write route-level summary, bestFor, pros, cons, and gearTips

You do NOT compute any numbers. Mileage and elevation gain/loss per day are computed deterministically in code from the segment IDs you assign. Never type a distance or elevation number in the itinerary. Each segment includes gainFt and lossFt from real DEM data, so you can reference elevation qualitatively in day notes (e.g. "a steady climb," "descending toward the lake") based on which segments you assign to each day.

Critical rules:
1. Route names must reference real geography from the data (e.g. "Minarets & Shadow Lake Loop"), not generic adjectives ("Alpine Paradise").
2. Always use FULL trail names — never abbreviations like "JMT" or "PCT". Write "John Muir Trail" and "Pacific Crest Trail".
3. When writing trail names, use plain ASCII hyphens (-) only. Never use en-dash or em-dash, even if that is how the trail name is commonly typeset.
4. Day notes must name actual lakes, peaks, passes, and streams from the per-segment feature lists — never invent features.
5. Pros and cons must be specific to this route's actual characteristics. Each pro/con must reference at least one named feature, trail, or numeric fact from the input data. Never use generic statements like "great views" or "can be crowded".
6. Each pro and con must be exactly 1 or 2 sentences. Never 3 or more.
7. Day notes must be 20-80 words each.
8. Use exactly the number of days specified by the user. Every segment index for a route must appear in exactly one day.
9. Output valid JSON only — a JSON array of route objects (one per candidate route). No markdown fences, no explanation text.
10. Do not generate scores — the scoring layer is deterministic and added later in code.
11. If any single day's mileage exceeds 150% of the user's milesPerDay target, explicitly acknowledge in that day's note that this is a long day and briefly explain why the routing requires it (water availability, camp spacing, trail connectivity, etc.).`;

// ── Archetype labels for the ranker picks ─────────────────────────────
// The narration system uses archetype strings to key into candidateRoutes.
// We assign them based on pick order and character signals.
function assignArchetype(cluster, pickIndex) {
  // Simple labeling based on pick index and cluster character
  if (cluster.distinctPasses >= 2) return 'high-passes';
  if (cluster.htRatio < 0.15) return 'remote';
  if (pickIndex === 0) return 'classic';
  if (pickIndex === 1) return 'scenic';
  return 'explorer';
}

// ── Convert ranked cluster to narration-input.json format ─────────────
function buildNarrationInput(rankedClusters, preferences) {
  const candidateRoutes = {};

  for (let i = 0; i < rankedClusters.length; i++) {
    const cluster = rankedClusters[i];
    const archetype = assignArchetype(cluster, i);
    cluster._archetype = archetype;  // stash for prompt generation

    candidateRoutes[archetype] = {
      clusterSize: cluster.clusterSize,
      totalMiles: cluster.miles,
      totalGainFt: cluster.totalGainFt,
      totalLossFt: cluster.totalLossFt,
      distinctTrailCount: cluster.distinctTrailCount,
      distinctFeatureCount: cluster.featureCount,
      htRatio: Math.round(cluster.htRatio * 100),
      geoCenter: { lat: cluster.centerLat, lon: cluster.centerLon },
      trailheads: [cluster.start],
      allFeatures: cluster.allFeatures,
      segments: cluster.segments.map((seg, idx) => ({
        segIdx: idx,
        trailName: seg.trailName,
        lengthMi: seg.lengthMi,
        gainFt: seg.gainFt,
        lossFt: seg.lossFt,
        fromJunction: seg.fromJunction,
        toJunction: seg.toJunction,
        midpoint: seg.midpoint,
        peaks: seg.peaks,
        passes: seg.passes,
        lakes: seg.lakes,
        streams: seg.streams,
        springs: seg.springs,
        landmarks: seg.landmarks,
      })),
    };
  }

  return {
    userPreferences: {
      days: preferences.daysTarget,
      milesPerDay: `~${preferences.milesPerDayTarget}`,
      elevationTolerance: preferences.elevationTolerance,
      experienceLevel: preferences.experienceLevel,
      groupType: preferences.groupType,
      sceneryPreferences: preferences.sceneryPreferences,
      crowdPreference: preferences.crowdPreference,
      avoid: preferences.avoid,
      priorities: preferences.priorities,
      notes: preferences.notes,
    },
    candidateRoutes,
  };
}

// ── Generate narration prompt markdown from structured input ──────────
function buildPromptMarkdown(structuredInput) {
  const prefs = structuredInput.userPreferences;
  let md = `# PackPath Narration Prompt — sent to Claude Sonnet

## System prompt

(See system message)

## User preferences

\`\`\`json
${JSON.stringify(prefs, null, 2)}
\`\`\`

## Candidate routes

`;

  const routeLabels = 'ABCDEFGHIJ';
  const archetypes = Object.keys(structuredInput.candidateRoutes);

  for (let i = 0; i < archetypes.length; i++) {
    const archetype = archetypes[i];
    const route = structuredInput.candidateRoutes[archetype];
    const label = routeLabels[i] || String(i + 1);

    // Feature summary grouped by type
    const featuresByType = {};
    for (const f of route.allFeatures) {
      if (!featuresByType[f.type]) featuresByType[f.type] = [];
      featuresByType[f.type].push(f.name);
    }
    const featureSummary = Object.entries(featuresByType)
      .map(([type, names]) => `${names.length} ${type}s: ${names.join(', ')}`)
      .join('; ');

    // Trail names from segments
    const trailNames = [...new Set(route.segments.map(s => s.trailName).filter(n => n && n !== '(unnamed)'))];

    // Pass names
    const passNames = [...new Set(route.segments.flatMap(s => s.passes))];

    md += `### Route ${label} — "${archetype}" archetype
- Total miles: ${route.totalMiles}
- Total elevation gain: ${route.totalGainFt.toLocaleString()} ft
- Total elevation loss: ${route.totalLossFt.toLocaleString()} ft
- Distinct trails: ${route.distinctTrailCount} (${trailNames.join(', ')})
- Distinct features: ${route.distinctFeatureCount} (${featureSummary})
- High-traffic ratio: ${route.htRatio}% (JMT+PCT miles / total)
- Cluster size: ${route.clusterSize} variants
- Geo center: ${route.geoCenter.lat.toFixed(2)}°N, ${Math.abs(route.geoCenter.lon).toFixed(2)}°W
- Passes: ${passNames.length ? passNames.join(', ') : 'none'}

Ordered segments (segIdx : trail : miles : elevation : features):
`;

    // Group consecutive segments with the same trail name for compact display
    let segIdx = 0;
    while (segIdx < route.segments.length) {
      const seg = route.segments[segIdx];
      const trailName = seg.trailName;

      // Find consecutive segments with same trail name
      let endIdx = segIdx;
      while (endIdx + 1 < route.segments.length && route.segments[endIdx + 1].trailName === trailName) {
        endIdx++;
      }

      // Aggregate stats for the group
      let groupMiles = 0, groupGain = 0, groupLoss = 0;
      const groupFeatures = { peaks: [], passes: [], lakes: [], streams: [], springs: [], landmarks: [] };
      for (let j = segIdx; j <= endIdx; j++) {
        const s = route.segments[j];
        groupMiles += s.lengthMi;
        groupGain += s.gainFt;
        groupLoss += s.lossFt;
        for (const cat of ['peaks', 'passes', 'lakes', 'streams', 'springs', 'landmarks']) {
          for (const name of (s[cat] || [])) {
            if (!groupFeatures[cat].includes(name)) groupFeatures[cat].push(name);
          }
        }
      }

      const segRange = segIdx === endIdx ? String(segIdx) : `${segIdx}-${endIdx}`;
      const subCount = endIdx - segIdx + 1;
      const subNote = subCount > 1 ? ` (${subCount} sub-segments)` : '';

      let featureStr = '';
      const parts = [];
      for (const [cat, names] of Object.entries(groupFeatures)) {
        if (names.length) parts.push(`${cat}: ${names.join(', ')}`);
      }
      if (parts.length) featureStr = ` — ${parts.join(' | ')}`;

      md += `- ${segRange}: ${trailName} ${groupMiles.toFixed(1)}mi +${groupGain}'/-${groupLoss}'${subNote}${featureStr}\n`;

      segIdx = endIdx + 1;
    }

    md += '\n';
  }

  // Output schema
  const archetypeList = archetypes.join(' | ');
  md += `## Output schema

Produce a JSON array of exactly ${archetypes.length} route objects. Each object:

\`\`\`json
{
  "routeName": "Evocative route name referencing real geography",
  "archetype": "${archetypeList}",
  "summary": "2-3 sentence overview naming specific features from this route's data",
  "bestFor": "1 sentence describing what kind of backpacker this route suits",
  "itinerary": [
    {
      "day": 1,
      "segmentIds": [0, 1, 2, 3, 4, 5, 6],
      "note": "20-80 word narration for this day referencing actual named features from the assigned segments"
    }
  ],
  "pros": ["specific pro referencing actual route data (1-2 sentences max)", "..."],
  "cons": ["specific con referencing actual route data (1-2 sentences max)", "..."],
  "gearTips": ["tip specific to this route's conditions", "..."]
}
\`\`\`

**CRITICAL:** The \`segmentIds\` array for each day must list the exact \`segIdx\` values from the input segments. Every segment index for a route must appear in exactly one day. The code will compute miles, trail names, and features per day from these IDs — you never type a number. Just assign segments to days and write prose.

Assign all segments for each route across exactly ${prefs.days} days, aiming for roughly equal daily mileage (~${prefs.milesPerDay.replace('~','')}mi/day). The segment order within each day must match the route order (ascending segIdx).

## Voice rules

**Banned words and what to do instead:**

- "nestled" / "tucked" / "set" → just use "beneath," "below," or "at the base of." ("Iceberg Lake sits beneath the Riegelhuth Minaret" not "Iceberg Lake is nestled beneath…")
- "dramatic" / "dramatically" → name the specific thing that makes it striking. ("The Minarets rise 2,000 ft above the lake" not "dramatic Minarets scenery.")
- "pristine" → delete it. Nothing in a day note is improved by being called pristine.
- "stunning" / "breathtaking" → delete. Show, don't tell. Describe what the hiker sees; let them decide if it's stunning.
- "spectacular" / "magnificent" → same as above. Name the physical detail instead of asserting grandeur. ("Iceberg Lake sits 800 ft below the Clyde Minaret" not "spectacular lake settings.")

These are AI-travel-writer tells that immediately mark prose as machine-generated to a real Sierra backpacker. Do not simply swap in synonyms — the fix is always to either delete the filler word or replace it with a concrete physical description.

**Long-day acknowledgments (150% rule):** When a day exceeds 150% of the target daily mileage or elevation, acknowledge it as a practical planning note for the user — e.g., "Day 4 is your long day — 16 miles, 5,000 ft gain. Start before dawn." Do NOT frame it as a justification for the route ("The extended mileage is necessary to complete the loop…"). The acknowledgment is for the hiker's planning, not the pipeline defending itself.

**Day balance (30% rule):** No day should be shorter than 30% of the daily mileage target (${Math.round(parseInt(prefs.milesPerDay.replace('~','')) * 0.3)} miles for this trip). If the route's final day would be very short based on natural segment breaks, redistribute segments across earlier days to balance. The goal is a reasonable day-by-day cadence, not perfect equality — days should roughly fall in the ${Math.round(parseInt(prefs.milesPerDay.replace('~','')) * 0.3)}-${Math.round(parseInt(prefs.milesPerDay.replace('~','')) * 1.5)} mile range. A 1-mile finishing day looks broken to a backpacker reading the itinerary. If the route geometry genuinely forces an unbalanced day (e.g., the only campsite is 2 miles from the trailhead and the next is 14 miles further), acknowledge it honestly in the day note rather than hiding it — but that's a rare edge case, not a default.

**Day note accuracy:** When a day note references a mileage figure, elevation figure, or makes a long-day acknowledgment, those numbers must match the day they appear in. If Day 4 is the 16.6-mile day, the long-day acknowledgment goes in Day 4's note, not Day 3's. Each day's note describes that day's actual mileage and elevation - never another day's. The code computes exact per-day miles and elevation from your segment assignments; your prose must not contradict those numbers.
`;

  return md;
}


// ── Unchanged: callClaude, extractJSON, postProcess ──────────────────

async function callClaude(messages, attempt) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  CLAUDE API CALL — Attempt ${attempt}`);
  console.log(`${'═'.repeat(60)}`);

  const body = {
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages,
  };

  console.log(`  Model: ${MODEL}`);
  console.log(`  Messages: ${messages.length}`);
  console.log(`  User message length: ${messages[messages.length - 1].content.length} chars`);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API call failed (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const text = result.content[0].text;

  console.log(`  Response length: ${text.length} chars`);
  console.log(`  Usage: input=${result.usage.input_tokens}, output=${result.usage.output_tokens}`);

  return text;
}

function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* noop */ }
    }
  }
  return null;
}

function postProcess(claudeOutput, structuredInput) {
  const result = [];

  for (const route of claudeOutput) {
    const archetype = route.archetype;
    const cluster = structuredInput.candidateRoutes[archetype];
    if (!cluster) {
      console.error(`  WARNING: No input data for archetype "${archetype}"`);
      result.push(route);
      continue;
    }

    const segments = [];
    let routeMileSum = 0;

    for (const dayEntry of route.itinerary) {
      const daySegIds = dayEntry.segmentIds;
      let dayMiles = 0;
      const dayTrails = new Set();
      const dayFeatures = { peaks: [], passes: [], lakes: [], streams: [], springs: [], landmarks: [] };

      let dayGainFt = 0;
      let dayLossFt = 0;

      for (const idx of daySegIds) {
        const seg = cluster.segments[idx];
        if (!seg) {
          console.error(`  WARNING: segIdx ${idx} not found in ${archetype} (max ${cluster.segments.length - 1})`);
          continue;
        }
        dayMiles += seg.lengthMi;
        dayGainFt += seg.gainFt || 0;
        dayLossFt += seg.lossFt || 0;
        dayTrails.add(seg.trailName);
        for (const cat of ['peaks', 'passes', 'lakes', 'streams', 'springs', 'landmarks']) {
          for (const name of (seg[cat] || [])) {
            if (!dayFeatures[cat].includes(name)) dayFeatures[cat].push(name);
          }
        }
      }

      routeMileSum += dayMiles;

      segments.push({
        day: dayEntry.day,
        trailNames: [...dayTrails],
        miles: Number(dayMiles.toFixed(1)),
        gainFt: dayGainFt,
        lossFt: dayLossFt,
        note: dayEntry.note,
        features: dayFeatures,
      });
    }

    const computedTotal = Number(routeMileSum.toFixed(1));
    const statedTotal = cluster.totalMiles;

    const sanitizeDashes = s => typeof s === 'string' ? s.replace(/[–—]/g, '-') : s;
    const sanitizedRoute = {
      routeName: sanitizeDashes(route.routeName),
      summary: sanitizeDashes(route.summary),
      bestFor: sanitizeDashes(route.bestFor),
      pros: route.pros.map(sanitizeDashes),
      cons: route.cons.map(sanitizeDashes),
      gearTips: (route.gearTips || []).map(sanitizeDashes),
    };
    for (const seg of segments) {
      seg.note = sanitizeDashes(seg.note);
    }

    const routeGainFt = segments.reduce((sum, s) => sum + s.gainFt, 0);
    const routeLossFt = segments.reduce((sum, s) => sum + s.lossFt, 0);

    result.push({
      routeName: sanitizedRoute.routeName,
      archetype: route.archetype,
      totalMiles: statedTotal,
      computedMiles: computedTotal,
      totalGainFt: routeGainFt,
      totalLossFt: routeLossFt,
      days: route.itinerary.length,
      summary: sanitizedRoute.summary,
      bestFor: sanitizedRoute.bestFor,
      segments,
      pros: sanitizedRoute.pros,
      cons: sanitizedRoute.cons,
      gearTips: sanitizedRoute.gearTips,
    });
  }

  return result;
}


// ── Main pipeline ─────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();

  // ── Step 1: Load preferences ────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════════');
  console.log('  STEP 1: LOAD USER PREFERENCES');
  console.log('════════════════════════════════════════════════════════════');
  const preferences = JSON.parse(await fs.readFile('user-preferences.example.json', 'utf-8'));
  console.log(`  Days: ${preferences.daysTarget}, Miles/day: ${preferences.milesPerDayTarget}`);
  console.log(`  Elevation: ${preferences.elevationTolerance}, Scenery: ${preferences.sceneryPreferences.join(', ')}`);
  console.log(`  Crowd: ${preferences.crowdPreference}, Experience: ${preferences.experienceLevel}, Group: ${preferences.groupType}`);
  if (preferences.priorities) console.log(`  Priorities: ${preferences.priorities}`);
  if (preferences.avoid) console.log(`  Avoid: ${preferences.avoid}`);
  if (preferences.notes) console.log(`  Notes: ${preferences.notes}`);

  // ── Step 2: Rank clusters ───────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  STEP 2: SCORE & RANK CLUSTERS');
  console.log('════════════════════════════════════════════════════════════');
  const { ranked, allScored, suggestionsComplete } = await rankClusters(preferences);

  console.log(`  Total clusters scored: ${allScored.length}`);
  console.log(`  Score range: ${allScored[allScored.length - 1]._score}–${allScored[0]._score}`);
  console.log(`  Selected: ${ranked.length} picks (suggestionsComplete: ${suggestionsComplete})`);

  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i];
    const b = c._breakdown;
    const rawRank = allScored.indexOf(c) + 1;
    console.log(`\n  Pick ${i + 1} (raw #${rawRank}, score ${c._score}/100):`);
    console.log(`    ${c.miles}mi | +${c.totalGainFt}' | Lakes:${c.distinctLakes} Peaks:${c.distinctPeaks} Passes:${c.distinctPasses}`);
    console.log(`    HT:${(c.htRatio*100).toFixed(0)}% | TH:${c.trailheadCount} | Center:${c.centerLat.toFixed(3)}°N`);
    console.log(`    Breakdown: mile=${b.mileageFit} elev=${b.elevationFit} scene=${b.sceneryMatch} crowd=${b.crowdMatch} access=${b.accessibility} density=${b.featureDensity}`);
    console.log(`    Top trail: ${c.topTrail}`);
    if (c.passNames.length) console.log(`    Passes: ${c.passNames.join(', ')}`);
    if (c.peakNames.length) console.log(`    Peaks: ${c.peakNames.join(', ')}`);
  }

  if (ranked.length === 0) {
    console.error('\n  No clusters met the scoring threshold. Exiting.');
    process.exit(1);
  }

  // ── Step 3: Build narration input ───────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  STEP 3: BUILD NARRATION INPUT');
  console.log('════════════════════════════════════════════════════════════');
  const structuredInput = buildNarrationInput(ranked, preferences);

  // Write narration-input.json
  await fs.writeFile('narration-input.json', JSON.stringify(structuredInput, null, 2));
  const archetypes = Object.keys(structuredInput.candidateRoutes);
  console.log(`  Wrote narration-input.json with ${archetypes.length} routes: ${archetypes.join(', ')}`);
  for (const arch of archetypes) {
    const route = structuredInput.candidateRoutes[arch];
    console.log(`    ${arch}: ${route.totalMiles}mi, ${route.segments.length} segments, ${route.allFeatures.length} features`);
  }
  console.log(`  User preferences passed to prompt:`);
  console.log(`    experienceLevel: ${structuredInput.userPreferences.experienceLevel}`);
  console.log(`    groupType: ${structuredInput.userPreferences.groupType}`);
  console.log(`    avoid: ${structuredInput.userPreferences.avoid || '(none)'}`);
  console.log(`    priorities: ${structuredInput.userPreferences.priorities || '(none)'}`);
  console.log(`    notes: ${structuredInput.userPreferences.notes || '(none)'}`);

  // Build and write the prompt markdown
  const promptMd = buildPromptMarkdown(structuredInput);
  await fs.writeFile('narration-prompt.md', promptMd);
  console.log(`  Wrote narration-prompt.md (${promptMd.length} chars)`);

  // ── Step 4: Call Claude API ─────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  STEP 4: NARRATION (Claude API)');
  console.log('════════════════════════════════════════════════════════════');

  const messages = [
    { role: 'user', content: promptMd },
  ];

  let attempt = 1;
  let finalOutput = null;
  let validationResult = null;
  const fullChain = [];

  while (attempt <= MAX_RETRIES + 1) {
    let responseText;
    try {
      responseText = await callClaude(messages, attempt);
    } catch (err) {
      console.error(`  API ERROR: ${err.message}`);
      fullChain.push({ attempt, error: err.message });
      break;
    }

    fullChain.push({ attempt, responseLength: responseText.length });

    await fs.writeFile(`narration-raw-attempt-${attempt}.txt`, responseText);
    console.log(`  Raw response saved to narration-raw-attempt-${attempt}.txt`);

    const claudeOutput = extractJSON(responseText);
    if (!claudeOutput) {
      console.error('  ERROR: Could not parse JSON from response');
      fullChain[fullChain.length - 1].parseError = true;
      if (attempt <= MAX_RETRIES) {
        messages.push({ role: 'assistant', content: responseText });
        messages.push({
          role: 'user',
          content: `Your response was not valid JSON. Please output ONLY a JSON array of ${archetypes.length} route objects with no surrounding text, markdown fences, or explanation. Just the raw JSON array starting with [ and ending with ].`,
        });
        attempt++;
        continue;
      }
      break;
    }

    console.log(`  Parsed ${claudeOutput.length} routes from JSON`);

    // Post-process: resolve segment IDs to deterministic miles/trails/features
    finalOutput = postProcess(claudeOutput, structuredInput);

    // Log computed miles per route
    for (const r of finalOutput) {
      const dayMiles = r.segments.map(s => `Day${s.day}:${s.miles}mi/+${s.gainFt}'`).join(', ');
      console.log(`  ${r.archetype}: ${r.totalMiles}mi +${r.totalGainFt}'/-${r.totalLossFt}' (${dayMiles})`);
    }

    // Validate post-processed output
    validationResult = validateNarration(finalOutput, structuredInput);
    fullChain[fullChain.length - 1].validation = validationResult;

    if (validationResult.ok) {
      console.log(`\n  ✅ VALIDATION PASSED on attempt ${attempt}`);
      break;
    }

    console.log(`\n  ❌ VALIDATION FAILED with ${validationResult.errors.length} errors:`);
    for (const err of validationResult.errors) {
      console.log(`    - [${err.check}] ${err.msg}`);
    }

    if (attempt <= MAX_RETRIES) {
      const errorList = validationResult.errors.map(e => `- [${e.check}] ${e.msg}`).join('\n');
      const correctionPrompt = `Your previous output had ${validationResult.errors.length} validation errors:

${errorList}

Please fix these specific issues and output the corrected JSON array. Remember:
- Use FULL trail names (never "JMT" or "PCT")
- Use plain ASCII hyphens only (never en-dash or em-dash)
- Every segment index for a route must appear in exactly one day
- Day notes must be 20-80 words each
- Each pro and con must be 1-2 sentences max
- Output ONLY the JSON array, no markdown fences or explanation text`;

      messages.push({ role: 'assistant', content: responseText });
      messages.push({ role: 'user', content: correctionPrompt });
      fullChain[fullChain.length - 1].correctionPrompt = correctionPrompt;
      attempt++;
    } else {
      break;
    }
  }

  // Write final output
  if (finalOutput && validationResult?.ok) {
    await fs.writeFile('narration-output-real.json', JSON.stringify(finalOutput, null, 2));
    console.log('\n  Final validated output saved to narration-output-real.json');
  } else if (finalOutput) {
    await fs.writeFile('narration-output-real.json', JSON.stringify(finalOutput, null, 2));
    console.log('\n  Output saved to narration-output-real.json (WITH VALIDATION ERRORS)');
  }

  await fs.writeFile('narration-chain.json', JSON.stringify(fullChain, null, 2));
  console.log('  Full chain saved to narration-chain.json');

  // ── Pipeline summary ────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  PIPELINE SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Clusters scored: ${allScored.length}`);
  console.log(`  Picks selected: ${ranked.length} (suggestionsComplete: ${suggestionsComplete})`);
  console.log(`  Archetypes: ${archetypes.join(', ')}`);
  console.log(`  API attempts: ${fullChain.length}`);
  console.log(`  Final validation: ${validationResult?.ok ? '✅ PASS' : '❌ FAIL'}`);
  if (validationResult && !validationResult.ok) {
    console.log(`  Remaining errors: ${validationResult.errors.length}`);
    for (const err of validationResult.errors) {
      console.log(`    - [${err.check}] ${err.msg}`);
    }
  }

  // Print final narration output
  if (finalOutput) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  FINAL NARRATION OUTPUT');
    console.log(`${'═'.repeat(60)}`);
    for (const route of finalOutput) {
      console.log(`\n  ── ${route.routeName} (${route.archetype}) ──`);
      console.log(`  ${route.totalMiles}mi | +${route.totalGainFt}'/-${route.totalLossFt}' | ${route.days} days`);
      console.log(`  Summary: ${route.summary}`);
      console.log(`  Best for: ${route.bestFor}`);
      for (const seg of route.segments) {
        const trails = seg.trailNames.join(', ');
        const feats = Object.entries(seg.features)
          .filter(([_, v]) => v.length > 0)
          .map(([k, v]) => `${k}: ${v.join(', ')}`)
          .join(' | ');
        console.log(`    Day ${seg.day}: ${seg.miles}mi +${seg.gainFt}'/-${seg.lossFt}' [${trails}]`);
        console.log(`      ${seg.note}`);
        if (feats) console.log(`      Features: ${feats}`);
      }
      console.log(`  Pros: ${route.pros.join(' // ')}`);
      console.log(`  Cons: ${route.cons.join(' // ')}`);
      console.log(`  Gear tips: ${(route.gearTips || []).join(' // ')}`);
    }
  }

  console.log(`\n  Total pipeline time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
