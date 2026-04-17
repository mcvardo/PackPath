// server.js
// Express API server for PackPath.
// Wraps the pipeline as an HTTP API and serves the static frontend.
//
// Routes:
//   GET  /api/regions          — list available regions
//   POST /api/routes           — create a background job, returns { jobId, status }
//   GET  /api/routes/cached    — return the last validated output (no API cost)
//   GET  /api/routes/:jobId    — poll job status and result
//   GET  /                     — serve the frontend

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { rankClusters } from './rank-clusters.js';
import { validateNarration } from './validate-narration.js';
import { NarrationError, RegionConfigError } from './errors.js';
import {
  assignArchetype,
  buildNarrationInput,
  buildPromptMarkdown,
  postProcess,
} from './pipeline-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-5-20250929';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_RETRIES = 2;
const CLAUDE_TIMEOUT_MS = 120_000; // 2 minutes
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── In-memory job store ───────────────────────────────────────────────
const jobs = new Map();

// Periodically remove jobs older than JOB_TTL_MS to prevent memory leak.
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000); // run every 5 minutes

function createJob() {
  const jobId = crypto.randomUUID();
  const now = Date.now();
  const job = {
    jobId,
    status: 'queued',
    step: 0,
    message: 'Queued',
    routes: null,
    error: null,
    validated: false,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(jobId, job);
  return job;
}

function updateJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}

const app = express();
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      'https://packpath.com',
      'https://www.packpath.com',
      /https:\/\/.*\.onrender\.com$/,
    ]
  : true; // allow all in dev

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ── Serve static frontend ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── GET /api/regions ──────────────────────────────────────────────────
app.get('/api/regions', async (req, res) => {
  try {
    const files = await fs.readdir(path.join(__dirname, 'regions'));
    const regions = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .map(async f => {
          const config = JSON.parse(await fs.readFile(path.join(__dirname, 'regions', f), 'utf-8'));
          const id = f.replace('.json', '');
          const hasCache = existsSync(path.join(__dirname, 'cache', `${id}-clusters.json`)) ||
                           existsSync(path.join(__dirname, 'cache', 'clusters.json'));
          return { id, name: config.name, ready: hasCache };
        })
    );
    res.json({ regions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/routes/cached ────────────────────────────────────────────
// Returns the last validated output without calling Claude.
// Useful for development and demos.
// NOTE: This route must be defined before GET /api/routes/:jobId so Express
// doesn't treat "cached" as a jobId.
app.get('/api/routes/cached', async (req, res) => {
  const outputPath = path.join(__dirname, 'narration-output-real.json');
  if (!existsSync(outputPath)) {
    return res.status(404).json({
      error: 'No cached output found. Run the pipeline first with POST /api/routes or npm run pipeline.'
    });
  }
  try {
    const output = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
    res.json({ routes: output, cached: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/routes ──────────────────────────────────────────────────
// Body: user preferences object (see user-preferences.example.json for schema)
// Optional query param: ?region=ansel-adams (default: ansel-adams)
// Returns immediately with { jobId, status: 'queued' }.
// Poll GET /api/routes/:jobId for progress and results.
app.post('/api/routes', (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY environment variable not set on the server.'
    });
  }

  const regionName = req.query.region || 'ansel-adams';
  const preferences = req.body;

  const prefErrors = validatePreferences(preferences);
  if (prefErrors.length > 0) {
    return res.status(400).json({ error: 'Invalid preferences', details: prefErrors });
  }

  const job = createJob();

  // Fire-and-forget — do NOT await
  runPipeline(job.jobId, preferences, regionName).catch(err => {
    // Catch any unexpected top-level error not already handled inside runPipeline
    updateJob(job.jobId, {
      status: 'failed',
      error: err.message || 'Unknown error',
    });
  });

  res.json({ jobId: job.jobId, status: 'queued' });
});

// ── GET /api/routes/:jobId ────────────────────────────────────────────
app.get('/api/routes/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// ── Background pipeline ───────────────────────────────────────────────
async function runPipeline(jobId, preferences, regionName) {
  try {
    // Step 0: Load region config
    updateJob(jobId, { status: 'running', step: 0, message: 'Loading region data…' });
    let regionConfig;
    try {
      regionConfig = JSON.parse(
        await fs.readFile(path.join(__dirname, 'regions', `${regionName}.json`), 'utf-8')
      );
    } catch (e) {
      throw new RegionConfigError(`Region "${regionName}" not found.`);
    }

    // Step 1: Check cache
    updateJob(jobId, { step: 1, message: 'Loading trail clusters…' });
    const clusterPath = existsSync(path.join(__dirname, 'cache', `${regionName}-clusters.json`))
      ? path.join(__dirname, 'cache', `${regionName}-clusters.json`)
      : path.join(__dirname, 'cache', 'clusters.json');

    if (!existsSync(clusterPath)) {
      throw new Error(
        'Trail cluster cache not found. Run the full pipeline first: npm run fetch && npm run enrich && npm run loops'
      );
    }

    // Step 2: Rank clusters
    updateJob(jobId, { step: 2, message: 'Scoring and ranking routes…' });
    const { ranked } = await rankClusters(preferences, { clusterPath });

    if (ranked.length === 0) {
      throw new Error('No routes matched your preferences. Try adjusting mileage or elevation tolerance.');
    }

    // Step 3: Build narration input
    updateJob(jobId, { step: 3, message: `Found ${ranked.length} candidate routes. Building itinerary…` });
    const structuredInput = buildNarrationInput(ranked, preferences, assignArchetype);
    const promptMd = buildPromptMarkdown(structuredInput);

    // Step 4: Call Claude (with retry loop)
    updateJob(jobId, { step: 4, message: 'Generating route narration (this takes 15–30 seconds)…' });
    const messages = [{ role: 'user', content: promptMd }];
    let attempt = 1;
    let finalOutput = null;
    let validationResult = null;

    while (attempt <= MAX_RETRIES + 1) {
      if (attempt > 1) {
        updateJob(jobId, { step: 4, message: `Fixing validation errors (attempt ${attempt})…` });
      }

      let responseText;
      try {
        responseText = await callClaude(messages, API_KEY);
      } catch (err) {
        throw new NarrationError(`Claude API call failed: ${err.message}`);
      }

      const claudeOutput = extractJSON(responseText);
      if (!claudeOutput) {
        if (attempt <= MAX_RETRIES) {
          messages.push({ role: 'assistant', content: responseText });
          messages.push({
            role: 'user',
            content: `Your response was not valid JSON. Output ONLY a JSON array with no markdown fences or explanation.`,
          });
          attempt++;
          continue;
        }
        throw new NarrationError('Claude returned unparseable JSON after all retries.');
      }

      try {
        finalOutput = postProcess(claudeOutput, structuredInput);
      } catch (err) {
        throw new NarrationError(`Post-processing failed: ${err.message}`);
      }

      validationResult = validateNarration(finalOutput, structuredInput, regionConfig);

      if (validationResult.ok) break;

      if (attempt <= MAX_RETRIES) {
        const errorList = validationResult.errors.map(e => `- [${e.check}] ${e.msg}`).join('\n');
        messages.push({ role: 'assistant', content: responseText });
        messages.push({
          role: 'user',
          content: `Your previous output had ${validationResult.errors.length} validation errors:\n\n${errorList}\n\nPlease fix these and output the corrected JSON array only.`,
        });
        attempt++;
      } else {
        break;
      }
    }

    // Step 5: Persist and mark done
    updateJob(jobId, { step: 5, message: 'Validating output…' });

    await fs.writeFile(
      path.join(__dirname, 'narration-output-real.json'),
      JSON.stringify(finalOutput, null, 2)
    );

    updateJob(jobId, {
      status: 'done',
      step: 5,
      message: 'Done',
      routes: finalOutput,
      validated: validationResult?.ok ?? false,
      attempts: attempt,
    });
  } catch (err) {
    updateJob(jobId, {
      status: 'failed',
      error: err.message || 'Unknown error',
      message: `Failed: ${err.message}`,
    });
  }
}

// ── Preference validation ─────────────────────────────────────────────
function validatePreferences(prefs) {
  const errors = [];
  if (!prefs || typeof prefs !== 'object') return ['Request body must be a JSON object'];
  if (!prefs.daysTarget || prefs.daysTarget < 1 || prefs.daysTarget > 14) {
    errors.push('daysTarget must be between 1 and 14');
  }
  if (!prefs.milesPerDayTarget || prefs.milesPerDayTarget < 3 || prefs.milesPerDayTarget > 25) {
    errors.push('milesPerDayTarget must be between 3 and 25');
  }
  if (!['easy', 'moderate', 'hard'].includes(prefs.elevationTolerance)) {
    errors.push('elevationTolerance must be easy, moderate, or hard');
  }
  if (!Array.isArray(prefs.sceneryPreferences) || prefs.sceneryPreferences.length === 0) {
    errors.push('sceneryPreferences must be a non-empty array');
  }
  return errors;
}

// ── Claude API call ───────────────────────────────────────────────────
async function callClaude(messages, apiKey) {
  const systemPrompt = await fs.readFile(
    path.join(__dirname, 'narration-system-prompt.txt'), 'utf-8'
  ).catch(() => null);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        system: systemPrompt || undefined,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API ${response.status}: ${errText}`);
    }

    const result = await response.json();
    return result.content[0].text;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new NarrationError(`Claude API timed out after ${CLAUDE_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── JSON extraction ───────────────────────────────────────────────────
function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`PackPath server running at http://localhost:${PORT}`);
  console.log(`API key: ${API_KEY ? 'set ✓' : 'NOT SET — set ANTHROPIC_API_KEY to run the pipeline'}`);
  console.log(`Cached output: ${existsSync(path.join(__dirname, 'narration-output-real.json')) ? 'available ✓' : 'none — run pipeline first'}`);
});
