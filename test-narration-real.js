// test-narration-real.js
// End-to-end CLI pipeline: scoring -> ranking -> narration -> validation.
//
// Usage:
//   node test-narration-real.js [--region=ansel-adams] [--prefs=path/to/prefs.json]
//
// Reads preferences from --prefs file (default: user-preferences.example.json).
// Shared pipeline logic lives in pipeline-core.js — this file handles
// CLI orchestration, logging, and file I/O only.

import 'dotenv/config';
import fs from 'node:fs/promises';
import { validateNarration } from './validate-narration.js';
import { rankClusters } from './rank-clusters.js';
import { NarrationError, RegionConfigError } from './errors.js';
import {
  assignArchetype,
  buildNarrationInput,
  buildPromptMarkdown,
  postProcess,
} from './pipeline-core.js';

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set. Add it to .env or export it.');
  process.exit(1);
}

const MODEL = 'claude-sonnet-4-5-20250929';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_RETRIES = 2;
const CLAUDE_TIMEOUT_MS = 120_000; // 2 minutes — Claude Sonnet with 8k output can be slow

const regionName = process.argv.find(a => a.startsWith('--region='))?.split('=')[1] || 'ansel-adams';
const prefsPath = process.argv.find(a => a.startsWith('--prefs='))?.split('=')[1] || 'user-preferences.example.json';

// ── Claude API call ───────────────────────────────────────────────────
async function callClaude(messages, systemPrompt, attempt) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  CLAUDE API CALL -- Attempt ${attempt}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Model: ${MODEL}`);
  console.log(`  Messages: ${messages.length}`);
  console.log(`  User message length: ${messages[messages.length - 1].content.length} chars`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        system: systemPrompt,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new NarrationError(`API call failed (${response.status}): ${errText}`);
    }

    const result = await response.json();
    const text = result.content[0].text;
    console.log(`  Response length: ${text.length} chars`);
    console.log(`  Usage: input=${result.usage.input_tokens}, output=${result.usage.output_tokens}`);
    return text;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new NarrationError(`Claude API call timed out after ${CLAUDE_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── JSON extraction ───────────────────────────────────────────────────
function extractJSON(text) {
  try { return JSON.parse(text); } catch (e) {
    console.error(`  JSON parse error (direct): ${e.message.slice(0, 100)}`);
  }
  const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (e2) {
      console.error(`  JSON parse error (regex fallback): ${e2.message.slice(0, 100)}`);
    }
  }
  return null;
}

// ── Main pipeline ─────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();

  // Step 0: Load region config
  console.log('='.repeat(60));
  console.log('  STEP 0: LOAD REGION CONFIG');
  console.log('='.repeat(60));
  let regionConfig;
  try {
    regionConfig = JSON.parse(await fs.readFile(`regions/${regionName}.json`, 'utf-8'));
  } catch (e) {
    throw new RegionConfigError(`Failed to load region config "regions/${regionName}.json": ${e.message}`);
  }
  console.log(`  Region: ${regionConfig.name}`);
  console.log(`  Seed trail: ${regionConfig.seedTrail}`);
  console.log(`  Allowed non-features: ${regionConfig.allowedNonFeatures.length} entries`);

  // Step 1: Load system prompt
  let systemPrompt;
  try {
    systemPrompt = await fs.readFile('narration-system-prompt.txt', 'utf-8');
  } catch {
    throw new Error('narration-system-prompt.txt not found. It should be in the repo root.');
  }

  // Step 2: Load preferences
  console.log('\n' + '='.repeat(60));
  console.log('  STEP 1: LOAD USER PREFERENCES');
  console.log('='.repeat(60));
  let preferences;
  try {
    preferences = JSON.parse(await fs.readFile(prefsPath, 'utf-8'));
  } catch (e) {
    throw new Error(`Failed to load preferences from "${prefsPath}": ${e.message}`);
  }
  console.log(`  Days: ${preferences.daysTarget}, Miles/day: ${preferences.milesPerDayTarget}`);
  console.log(`  Elevation: ${preferences.elevationTolerance}, Scenery: ${preferences.sceneryPreferences.join(', ')}`);
  console.log(`  Crowd: ${preferences.crowdPreference}, Experience: ${preferences.experienceLevel}`);

  // Step 3: Rank clusters
  console.log('\n' + '='.repeat(60));
  console.log('  STEP 2: SCORE & RANK CLUSTERS');
  console.log('='.repeat(60));
  const { ranked, allScored, suggestionsComplete } = await rankClusters(preferences);

  console.log(`  Total clusters scored: ${allScored.length}`);
  console.log(`  Score range: ${allScored[allScored.length - 1]._score}--${allScored[0]._score}`);
  console.log(`  Selected: ${ranked.length} picks (suggestionsComplete: ${suggestionsComplete})`);

  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i];
    const b = c._breakdown;
    const rawRank = allScored.indexOf(c) + 1;
    console.log(`\n  Pick ${i + 1} (raw #${rawRank}, score ${c._score}/100):`);
    console.log(`    ${c.miles}mi | +${c.totalGainFt}' | Lakes:${c.distinctLakes} Peaks:${c.distinctPeaks} Passes:${c.distinctPasses}`);
    console.log(`    HT:${(c.htRatio * 100).toFixed(0)}% | TH:${c.trailheadCount} | Center:${c.centerLat.toFixed(3)}N`);
    console.log(`    Breakdown: mile=${b.mileageFit} elev=${b.elevationFit} scene=${b.sceneryMatch} crowd=${b.crowdMatch} access=${b.accessibility} density=${b.featureDensity}`);
  }

  if (ranked.length === 0) {
    console.error('\n  No clusters met the scoring threshold. Exiting.');
    process.exit(1);
  }

  // Step 4: Build narration input
  console.log('\n' + '='.repeat(60));
  console.log('  STEP 3: BUILD NARRATION INPUT');
  console.log('='.repeat(60));
  const structuredInput = buildNarrationInput(ranked, preferences, assignArchetype);
  await fs.writeFile('narration-input.json', JSON.stringify(structuredInput, null, 2));
  const archetypes = Object.keys(structuredInput.candidateRoutes);
  console.log(`  Wrote narration-input.json with ${archetypes.length} routes: ${archetypes.join(', ')}`);

  const promptMd = buildPromptMarkdown(structuredInput);
  await fs.writeFile('narration-prompt.md', promptMd);
  console.log(`  Wrote narration-prompt.md (${promptMd.length} chars)`);

  // Step 5: Call Claude + validate
  console.log('\n' + '='.repeat(60));
  console.log('  STEP 4: NARRATION (Claude API)');
  console.log('='.repeat(60));

  const messages = [{ role: 'user', content: promptMd }];
  let attempt = 1;
  let finalOutput = null;
  let validationResult = null;
  const fullChain = [];

  while (attempt <= MAX_RETRIES + 1) {
    let responseText;
    try {
      responseText = await callClaude(messages, systemPrompt, attempt);
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
          content: `Your response was not valid JSON. Output ONLY a JSON array of ${archetypes.length} route objects with no markdown fences or explanation.`,
        });
        attempt++;
        continue;
      }
      break;
    }

    console.log(`  Parsed ${claudeOutput.length} routes from JSON`);

    try {
      finalOutput = postProcess(claudeOutput, structuredInput);
    } catch (err) {
      console.error(`  POST-PROCESS ERROR: ${err.message}`);
      fullChain[fullChain.length - 1].postProcessError = err.message;
      break;
    }

    for (const r of finalOutput) {
      const dayMiles = r.segments.map(s => `Day${s.day}:${s.miles}mi/+${s.gainFt}'`).join(', ');
      console.log(`  ${r.archetype}: ${r.totalMiles}mi +${r.totalGainFt}'/-${r.totalLossFt}' (${dayMiles})`);
    }

    validationResult = validateNarration(finalOutput, structuredInput, regionConfig);
    fullChain[fullChain.length - 1].validation = validationResult;

    if (validationResult.ok) {
      console.log(`\n  VALIDATION PASSED on attempt ${attempt}`);
      break;
    }

    console.log(`\n  VALIDATION FAILED with ${validationResult.errors.length} errors:`);
    for (const err of validationResult.errors) {
      console.log(`    - [${err.check}] ${err.msg}`);
    }

    if (attempt <= MAX_RETRIES) {
      const errorList = validationResult.errors.map(e => `- [${e.check}] ${e.msg}`).join('\n');
      messages.push({ role: 'assistant', content: responseText });
      messages.push({
        role: 'user',
        content: `Your previous output had ${validationResult.errors.length} validation errors:\n\n${errorList}\n\nFix these and output the corrected JSON array only.`,
      });
      fullChain[fullChain.length - 1].correctionSent = true;
      attempt++;
    } else {
      break;
    }
  }

  // Write outputs
  if (finalOutput) {
    await fs.writeFile('narration-output-real.json', JSON.stringify(finalOutput, null, 2));
    const status = validationResult?.ok ? 'VALIDATED' : 'WITH VALIDATION ERRORS';
    console.log(`\n  Output saved to narration-output-real.json (${status})`);
  }

  await fs.writeFile('narration-chain.json', JSON.stringify(fullChain, null, 2));
  console.log('  Full chain saved to narration-chain.json');

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('  PIPELINE SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Region: ${regionConfig.name}`);
  console.log(`  Clusters scored: ${allScored.length}`);
  console.log(`  Picks selected: ${ranked.length} (complete: ${suggestionsComplete})`);
  console.log(`  Archetypes: ${archetypes.join(', ')}`);
  console.log(`  API attempts: ${fullChain.length}`);
  console.log(`  Final validation: ${validationResult?.ok ? 'PASS' : 'FAIL'}`);
  if (validationResult && !validationResult.ok) {
    for (const err of validationResult.errors) {
      console.log(`    - [${err.check}] ${err.msg}`);
    }
  }
  console.log(`  Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
