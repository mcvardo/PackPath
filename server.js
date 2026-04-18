// server.js
// Express API server for PackPath.
// Wraps the pipeline as an HTTP API and serves the static frontend.
//
// Routes:
//   GET  /api/regions          — list available regions
//   POST /api/chat             — AI conversation to collect trip preferences
//   POST /api/routes           — create a background job, returns { jobId, status }
//   GET  /api/routes/:jobId    — poll job status and result
//   GET  /                     — serve the frontend

import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
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
const SENTRY_DSN = process.env.SENTRY_DSN;
const MODEL = process.env.NARRATION_MODEL || 'claude-haiku-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_RETRIES = 2;
const CLAUDE_TIMEOUT_MS = 120_000;
const JOB_TTL_MS = 60 * 60 * 1000;

// ── Sentry ────────────────────────────────────────────────────────────
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.2,
  });
}

// ── Structured logger ─────────────────────────────────────────────────
function log(level, event, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

// Request logger middleware
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    log('info', 'http_request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      ip: req.ip,
    });
  });
  next();
}

// ── In-memory job store ───────────────────────────────────────────────
const jobs = new Map();

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000);

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
  : true;

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use(requestLogger);

// ── Rate limiting ─────────────────────────────────────────────────────
// Chat: 30 messages per 10 minutes per IP
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat messages. Please wait a few minutes.' },
  skip: () => process.env.NODE_ENV !== 'production',
});

// Route generation: 10 searches per hour per IP (each costs ~$0.08)
const routesLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Route search limit reached. Try again later.' },
  skip: () => process.env.NODE_ENV !== 'production',
});

// General API: 200 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  skip: () => process.env.NODE_ENV !== 'production',
});

app.use('/api/', apiLimiter);
app.use('/api/chat', chatLimiter);
app.use('/api/routes', routesLimiter);

// ── Serve static frontend with CDN-friendly cache headers ─────────────
// Hashed assets (JS/CSS bundles) get 1 year cache — safe because filenames change on rebuild
// HTML gets no-cache so users always get the latest shell
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.match(/\.(js|css|woff2?|png|jpg|svg|ico)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// ── Load all region configs at startup ───────────────────────────────
async function loadAllRegions() {
  const regionsDir = path.join(__dirname, 'regions');
  const files = await fs.readdir(regionsDir);
  const regions = await Promise.all(
    files
      .filter(f => f.endsWith('.json') && f !== 'permit-registry.json')
      .map(async f => {
        const config = JSON.parse(await fs.readFile(path.join(regionsDir, f), 'utf-8'));
        const id = f.replace('.json', '');
        const hasCache =
          existsSync(path.join(__dirname, 'cache', `${id}-clusters.json`)) ||
          (id === 'ansel-adams' && existsSync(path.join(__dirname, 'cache', 'clusters.json')));
        return { id, name: config.name, ready: hasCache };
      })
  );
  return regions.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Load permit registry ──────────────────────────────────────────────
let permitRegistry = null;
async function loadPermitRegistry() {
  if (permitRegistry) return permitRegistry;
  try {
    const raw = await fs.readFile(path.join(__dirname, 'regions', 'permit-registry.json'), 'utf-8');
    permitRegistry = JSON.parse(raw).regions;
  } catch {
    permitRegistry = {};
  }
  return permitRegistry;
}

// ── GET /api/regions ──────────────────────────────────────────────────
app.get('/api/regions', async (req, res) => {
  try {
    const regions = await loadAllRegions();
    res.json({ regions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/permits/:regionId ────────────────────────────────────────
// Returns permit info + live availability from recreation.gov for a region.
// Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
app.get('/api/permits/:regionId', async (req, res) => {
  const { regionId } = req.params;
  const { startDate } = req.query;

  const registry = await loadPermitRegistry();
  const info = registry[regionId];

  if (!info) {
    return res.json({ permitRequired: false, available: null, info: null });
  }

  const result = {
    permitRequired: info.permitRequired,
    permitName: info.permitName,
    permitId: info.permitId,
    bookingUrl: info.bookingUrl,
    isLottery: info.isLottery,
    lotteryWindow: info.lotteryWindow || null,
    quotaSeason: info.quotaSeason || null,
    notes: info.notes,
    bestMonths: info.bestMonths,
    snowfreeTypically: info.snowfreeTypically,
    available: null,
    availabilityChecked: false,
  };

  // Try to fetch live availability if we have a permit ID and a start date
  if (info.permitId && startDate && info.permitRequired) {
    try {
      const date = new Date(startDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const startOfMonth = `${year}-${month}-01`;
      const endOfMonth = new Date(year, date.getMonth() + 1, 0);
      const endStr = `${year}-${month}-${String(endOfMonth.getDate()).padStart(2, '0')}`;

      const url = `https://www.recreation.gov/api/permitinyo/${info.permitId}/availabilityv2?start_date=${startOfMonth}&end_date=${endStr}&commercial_acct=false`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'PackPath/1.0 (trip planning app)' },
          signal: controller.signal,
        });

        if (response.ok) {
          const data = await response.json();
          // Count available dates in the user's window
          const availability = data.payload || data;
          let availableCount = 0;
          let totalChecked = 0;

          if (availability && typeof availability === 'object') {
            for (const [dateStr, status] of Object.entries(availability)) {
              const d = new Date(dateStr);
              if (d >= date) {
                if (status === 'Available' || status === 'AVAILABLE') availableCount++;
              }
            }
          }

          result.available = availableCount > 0;
          result.availableCount = availableCount;
          result.availabilityChecked = true;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // Availability check failed — non-critical, just skip it
    }
  }

  res.json(result);
});

// ── GET /api/available-now ────────────────────────────────────────────
// Returns regions with permit availability for the next 2 weekends.
app.get('/api/available-now', async (req, res) => {
  const registry = await loadPermitRegistry();
  const regions = await loadAllRegions();
  const readyRegions = regions.filter(r => r.ready);

  // Next two weekends
  const today = new Date();
  const weekends = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 6) { // Saturday
      weekends.push(d.toISOString().split('T')[0]);
      if (weekends.length >= 2) break;
    }
  }

  const results = await Promise.allSettled(
    readyRegions.map(async (region) => {
      const info = registry[region.id];
      if (!info) return null;

      // No permit = always available
      if (!info.permitRequired) {
        return {
          regionId: region.id,
          regionName: region.name,
          available: true,
          permitRequired: false,
          isLottery: false,
          bookingUrl: null,
          bestMonths: info.bestMonths,
          weekends,
        };
      }

      // Lottery = not bookable on demand
      if (info.isLottery) return null;

      // Check live availability for first weekend
      if (!info.permitId || !weekends[0]) return null;

      try {
        const date = new Date(weekends[0]);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const startOfMonth = `${year}-${month}-01`;
        const endOfMonth = new Date(year, date.getMonth() + 1, 0);
        const endStr = `${year}-${month}-${String(endOfMonth.getDate()).padStart(2, '0')}`;

        const url = `https://www.recreation.gov/api/permitinyo/${info.permitId}/availabilityv2?start_date=${startOfMonth}&end_date=${endStr}&commercial_acct=false`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6_000);

        try {
          const response = await fetch(url, {
            headers: { 'User-Agent': 'PackPath/1.0' },
            signal: controller.signal,
          });
          if (!response.ok) return null;
          const data = await response.json();
          const availability = data.payload || data;

          let available = false;
          for (const weekend of weekends) {
            const status = availability[`${weekend}T00:00:00Z`] || availability[weekend];
            if (status === 'Available' || status === 'AVAILABLE') {
              available = true;
              break;
            }
          }

          if (!available) return null;

          return {
            regionId: region.id,
            regionName: region.name,
            available: true,
            permitRequired: true,
            isLottery: false,
            bookingUrl: info.bookingUrl,
            bestMonths: info.bestMonths,
            weekends,
          };
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        return null;
      }
    })
  );

  const available = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  res.json({ available, weekends });
});
// Conversational AI endpoint to collect trip preferences naturally.
// Body: { messages: [{role, content}], collectedPrefs: {} }
// Returns: { reply: string, collectedPrefs: {}, readyToRun: bool }
app.post('/api/chat', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on the server.' });
  }

  const { messages = [], collectedPrefs = {} } = req.body;

  try {
    const regions = await loadAllRegions();
    const readyRegions = regions.filter(r => r.ready).map(r => r.name);
    const allRegionNames = regions.map(r => `${r.name}${r.ready ? '' : ' (coming soon)'}`);

    const systemPrompt = `You are PackPath — an expert backpacking guide and trip planner. You have deep knowledge of wilderness areas, trail conditions, permits, gear, and what makes a great multi-day trip. You're direct, warm, and genuinely helpful. You don't just collect information — you give real advice.

REGIONS YOU CAN PLAN ROUTES FOR RIGHT NOW:
${readyRegions.map(n => `- ${n}`).join('\n')}

COMING SOON (not yet available):
${regions.filter(r => !r.ready).map(r => `- ${r.name}`).join('\n')}

YOUR PERSONALITY:
- You're like a knowledgeable friend who's done all these trails, not a form-filling bot
- Ask one good question at a time, not a list of questions
- Give real opinions: "Wind River Range in August is spectacular — probably the best backpacking in the lower 48"
- Push back gently when something doesn't add up: "20 miles/day for 5 days is a serious undertaking — most people do 10-14. Are you an experienced ultralight hiker?"
- Volunteer useful info they didn't ask for: "Grand Teton permits for the Teton Crest Trail book out in January — if you're planning for summer, you need to move fast"
- Be honest about limitations: "We only have Ansel Adams Wilderness ready right now — the others are coming soon"

WHAT YOU'RE TRYING TO LEARN (collect naturally through conversation):
- location: which region (must match a ready region above)
- startDate + endDate: trip dates (YYYY-MM-DD)
- milesPerDayTarget: realistic daily mileage (3-25)
- elevationTolerance: easy / moderate / hard
- sceneryPreferences: what they love (lakes, peaks, passes, meadows, forest, streams, ridgeline)
- crowdPreference: solitude / mixed / popular is fine
- experienceLevel: beginner / intermediate / advanced
- groupType: solo / couple / small group / large group
- avoid: anything to steer clear of
- priorities: what matters most to them

REGION KNOWLEDGE:
- Ansel Adams Wilderness (CA): High Sierra, JMT corridor, spectacular alpine lakes and Minarets. Best Jul-Sep. Permit required (Inyo NF).
- Glacier NP (MT): Crown of the Continent, dramatic peaks, grizzly country. Best Jul-Sep. Permit lottery in March.
- Grand Teton (WY): Teton Crest Trail is iconic. Best Jul-Sep. Permits book out fast in January.
- Rocky Mountain NP (CO): Front Range, Trail Ridge Road area. Best Jul-Sep. Permits required.
- Mount Rainier (WA): Wonderland Trail circumnavigation is world-class. Best Jul-Sep. Very competitive permits.
- Wind River Range (WY): Most remote and wild in lower 48. No permit required. Best Jul-Sep.
- Yosemite Backcountry (CA): Tuolumne Meadows, Cathedral Range. Best Jul-Sep. Permit required.
- Olympic NP (WA): Rainforest to alpine, unique terrain. Best Jul-Aug.
- Weminuche Wilderness (CO): San Juan Mountains, no permit required. Best Jul-Sep.
- Bryce Canyon (UT): Under-the-Rim Trail, hoodoos. Best May-Jun, Sep-Oct. No permit required.
- Grand Canyon Backcountry (AZ): Iconic but brutal in summer. Best Mar-Apr, Oct-Nov. Very competitive permits.

WHEN TO TRIGGER ROUTE SEARCH:
When you have: location (ready region) + startDate + endDate + milesPerDayTarget, say something like:
"Perfect — I have everything I need. Ready to find your routes?" and set readyToRun: true.

IMPORTANT — append these hidden blocks at the very end of every reply (they get stripped before display):
<!--PREFS:{"location":null,"startDate":null,"endDate":null,"milesPerDayTarget":null,"elevationTolerance":null,"sceneryPreferences":[],"crowdPreference":null,"experienceLevel":null,"groupType":null}-->
<!--READY:false-->

Replace null values with actual collected data. Set READY:true only when you have the minimum fields above.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let responseText;
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
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API ${response.status}: ${errText}`);
      }

      const result = await response.json();
      responseText = result.content[0].text;
    } finally {
      clearTimeout(timeout);
    }

    // Extract hidden data blocks
    const prefsMatch = responseText.match(/<!--PREFS:(.*?)-->/s);
    const readyMatch = responseText.match(/<!--READY:(true|false)-->/);

    let newPrefs = { ...collectedPrefs };
    if (prefsMatch) {
      try {
        const extracted = JSON.parse(prefsMatch[1]);
        // Merge — only overwrite with non-null values
        for (const [k, v] of Object.entries(extracted)) {
          if (v !== null && v !== undefined && v !== '') {
            newPrefs[k] = v;
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    const readyToRun = readyMatch ? readyMatch[1] === 'true' : false;

    // Strip hidden blocks from the reply shown to the user
    const cleanReply = responseText
      .replace(/<!--PREFS:.*?-->/gs, '')
      .replace(/<!--READY:(true|false)-->/g, '')
      .trim();

    res.json({ reply: cleanReply, collectedPrefs: newPrefs, readyToRun });
  } catch (err) {
    log('error', 'chat_failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/routes ──────────────────────────────────────────────────
app.post('/api/routes', (req, res) => {
  if (!API_KEY) {
    log('error', 'routes_no_api_key');
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY environment variable not set on the server.'
    });
  }

  // Region can come from body or query param; body takes precedence
  const regionName = req.body.region || req.query.region || 'ansel-adams';
  const preferences = { ...req.body };
  delete preferences.region;

  // Compute daysTarget from startDate + endDate if provided
  if (preferences.startDate && preferences.endDate && !preferences.daysTarget) {
    const start = new Date(preferences.startDate);
    const end = new Date(preferences.endDate);
    const diffMs = end - start;
    if (diffMs > 0) {
      preferences.daysTarget = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }
  }

  applyPreferenceDefaults(preferences);
  const prefErrors = validatePreferences(preferences);
  if (prefErrors.length > 0) {
    log('warn', 'routes_validation_failed', { region: regionName, errors: prefErrors, prefs: preferences });
    return res.status(400).json({ error: 'Invalid preferences', details: prefErrors });
  }

  const job = createJob();
  log('info', 'routes_job_created', { jobId: job.jobId, region: regionName, days: preferences.daysTarget, miles: preferences.milesPerDayTarget });

  runPipeline(job.jobId, preferences, regionName).catch(err => {
    log('error', 'routes_pipeline_uncaught', { jobId: job.jobId, error: err.message });
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
    updateJob(jobId, { status: 'running', step: 0, message: 'Loading region data…' });
    log('info', 'pipeline_start', { jobId, region: regionName });

    // Find region by name or id
    const regions = await loadAllRegions();
    const regionMatch = regions.find(r =>
      r.id === regionName ||
      r.name.toLowerCase() === regionName.toLowerCase() ||
      r.name.toLowerCase().includes(regionName.toLowerCase())
    );

    if (!regionMatch) {
      const available = regions.filter(r => r.ready).map(r => r.name).join(', ');
      log('warn', 'pipeline_region_not_found', { jobId, region: regionName });
      throw new RegionConfigError(`Region "${regionName}" not found. Available regions: ${available}`);
    }

    if (!regionMatch.ready) {
      log('warn', 'pipeline_region_not_ready', { jobId, region: regionMatch.name });
      throw new RegionConfigError(`Region "${regionMatch.name}" is coming soon — cluster data not yet available.`);
    }

    let regionConfig;
    try {
      regionConfig = JSON.parse(
        await fs.readFile(path.join(__dirname, 'regions', `${regionMatch.id}.json`), 'utf-8')
      );
    } catch (e) {
      throw new RegionConfigError(`Region config file not found for "${regionMatch.id}".`);
    }

    // Step 1: Check cache — support both <id>-clusters.json and legacy clusters.json
    updateJob(jobId, { step: 1, message: 'Loading trail clusters…' });
    const clusterPath =
      existsSync(path.join(__dirname, 'cache', `${regionMatch.id}-clusters.json`))
        ? path.join(__dirname, 'cache', `${regionMatch.id}-clusters.json`)
        : path.join(__dirname, 'cache', 'clusters.json');

    if (!existsSync(clusterPath)) {
      throw new Error('Trail cluster cache not found. Run the full pipeline first.');
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
            content: 'Your response was not valid JSON. Output ONLY a JSON array with no markdown fences or explanation.',
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

    // Step 5: Fetch weather
    updateJob(jobId, { step: 5, message: 'Fetching weather data…' });
    const weatherResults = await Promise.allSettled(
      finalOutput.map(route =>
        fetchWeatherForRoute(route.geoCenter, preferences.startDate, preferences.daysTarget)
      )
    );
    const finalOutputWithWeather = finalOutput.map((route, i) => ({
      ...route,
      weather: weatherResults[i].status === 'fulfilled' ? weatherResults[i].value : null,
    }));

    await fs.writeFile(
      path.join(__dirname, 'narration-output-real.json'),
      JSON.stringify(finalOutputWithWeather, null, 2)
    );

    updateJob(jobId, {
      status: 'done',
      step: 5,
      message: 'Done',
      routes: finalOutputWithWeather,
      validated: validationResult?.ok ?? false,
      attempts: attempt,
    });
    log('info', 'pipeline_done', { jobId, region: regionName, routes: finalOutputWithWeather.length, attempts: attempt, validated: validationResult?.ok });
  } catch (err) {
    log('error', 'pipeline_failed', { jobId, region: regionName, error: err.message, type: err.constructor.name });
    if (SENTRY_DSN) Sentry.captureException(err, { extra: { jobId, region: regionName } });
    updateJob(jobId, {
      status: 'failed',
      error: err.message || 'Unknown error',
      message: `Failed: ${err.message}`,
    });
  }
}

// ── Preference validation ─────────────────────────────────────────────
// Returns errors array. Does NOT mutate prefs — caller applies defaults.
function validatePreferences(prefs) {
  const errors = [];
  if (!prefs || typeof prefs !== 'object') return ['Request body must be a JSON object'];

  const days = prefs.daysTarget;
  if (!days || days < 1 || days > 14) {
    errors.push(`daysTarget must be between 1 and 14 — got ${JSON.stringify(days)} (provide startDate + endDate or daysTarget directly)`);
  }
  if (!prefs.milesPerDayTarget || prefs.milesPerDayTarget < 3 || prefs.milesPerDayTarget > 25) {
    errors.push(`milesPerDayTarget must be between 3 and 25 — got ${JSON.stringify(prefs.milesPerDayTarget)}`);
  }
  if (!['easy', 'moderate', 'hard'].includes(prefs.elevationTolerance)) {
    errors.push(`elevationTolerance must be easy, moderate, or hard — got ${JSON.stringify(prefs.elevationTolerance)}`);
  }
  if (prefs.startDate !== undefined && prefs.startDate !== null && prefs.startDate !== '') {
    const d = new Date(prefs.startDate);
    if (isNaN(d.getTime())) {
      errors.push(`startDate must be a valid ISO date string (YYYY-MM-DD) — got ${JSON.stringify(prefs.startDate)}`);
    }
  }
  return errors;
}

// Apply defaults to preferences before validation
function applyPreferenceDefaults(prefs) {
  if (!Array.isArray(prefs.sceneryPreferences) || prefs.sceneryPreferences.length === 0) {
    prefs.sceneryPreferences = ['lakes', 'peaks'];
  }
}

// ── Weather fetch ─────────────────────────────────────────────────────
const WEATHER_TIMEOUT_MS = 10_000;

async function fetchWeatherForRoute(geoCenter, startDate, daysTarget) {
  if (!geoCenter) return null;
  const { lat, lon } = geoCenter;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

    let weatherData;
    const today = new Date();
    const tripStart = startDate ? new Date(startDate) : null;
    const daysUntilTrip = tripStart ? Math.ceil((tripStart - today) / (1000 * 60 * 60 * 24)) : null;
    const useForecast = daysUntilTrip !== null && daysUntilTrip >= 0 && daysUntilTrip <= 16;

    try {
      if (useForecast) {
        const endDate = new Date(tripStart);
        endDate.setDate(endDate.getDate() + daysTarget - 1);
        const fmt = d => d.toISOString().split('T')[0];
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,windspeed_10m_max&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&start_date=${fmt(tripStart)}&end_date=${fmt(endDate)}&timezone=America%2FLos_Angeles`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Open-Meteo forecast ${res.status}`);
        const json = await res.json();
        weatherData = parseForecastResponse(json, daysTarget);
        weatherData.source = 'forecast';
        weatherData.startDate = fmt(tripStart);
      } else {
        const refDate = tripStart || today;
        const month = String(refDate.getMonth() + 1).padStart(2, '0');
        const day = String(refDate.getDate()).padStart(2, '0');
        const url = `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_date=1991-${month}-${day}&end_date=2020-${month}-${day}&models=EC_Earth3P_HR&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=fahrenheit&precipitation_unit=inch`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Open-Meteo climate ${res.status}`);
        const json = await res.json();
        weatherData = parseClimateResponse(json);
        weatherData.source = 'climate_normals';
        weatherData.referenceDate = `${month}-${day}`;
      }
    } finally {
      clearTimeout(timeout);
    }

    return weatherData;
  } catch (err) {
    console.warn(`Weather fetch failed for ${lat},${lon}: ${err.message}`);
    return null;
  }
}

function parseForecastResponse(json, daysTarget) {
  const daily = json.daily || {};
  const dates = daily.time || [];
  const days = [];
  for (let i = 0; i < Math.min(dates.length, daysTarget); i++) {
    days.push({
      date: dates[i],
      tempHighF: daily.temperature_2m_max?.[i] ?? null,
      tempLowF: daily.temperature_2m_min?.[i] ?? null,
      precipIn: daily.precipitation_sum?.[i] ?? null,
      windMph: daily.windspeed_10m_max?.[i] ?? null,
      weatherCode: daily.weathercode?.[i] ?? null,
      description: wmoDescription(daily.weathercode?.[i]),
    });
  }
  return { days, elevation: json.elevation ?? null };
}

function parseClimateResponse(json) {
  const daily = json.daily || {};
  const tempHighs = daily.temperature_2m_max || [];
  const tempLows = daily.temperature_2m_min || [];
  const precips = daily.precipitation_sum || [];
  const avgHigh = tempHighs.length ? Math.round(tempHighs.reduce((a, b) => a + b, 0) / tempHighs.length) : null;
  const avgLow = tempLows.length ? Math.round(tempLows.reduce((a, b) => a + b, 0) / tempLows.length) : null;
  const avgPrecip = precips.length ? Number((precips.reduce((a, b) => a + b, 0) / precips.length).toFixed(2)) : null;
  return { avgHighF: avgHigh, avgLowF: avgLow, avgPrecipIn: avgPrecip, elevation: json.elevation ?? null, days: null };
}

function wmoDescription(code) {
  if (code === null || code === undefined) return null;
  if (code === 0) return 'Clear sky';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 49) return 'Fog';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code <= 84) return 'Rain showers';
  if (code <= 94) return 'Thunderstorm';
  return 'Severe thunderstorm';
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
        max_tokens: 4096,
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

function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

// ── POST /api/alerts ──────────────────────────────────────────────────
// Register a permit availability alert for a region + date window.
// Body: { email, regionId, startDate, endDate }
app.post('/api/alerts', async (req, res) => {
  const { email, regionId, startDate, endDate } = req.body;

  // Basic email validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  // Sanitize regionId — only allow safe slug characters
  if (!regionId || !/^[a-z0-9-]+$/.test(regionId)) {
    return res.status(400).json({ error: 'Valid regionId required' });
  }

  const registry = await loadPermitRegistry();
  const info = registry[regionId];
  if (!info?.permitRequired) {
    return res.status(400).json({ error: 'This region does not require a permit — no alert needed' });
  }

  const alertsPath = path.join(__dirname, 'data', 'permit-alerts.json');
  let alerts = [];
  try {
    alerts = JSON.parse(await fs.readFile(alertsPath, 'utf-8'));
  } catch { /* first alert */ }

  // Deduplicate — don't add same email+region+date twice
  const exists = alerts.some(a => a.email === email && a.regionId === regionId && a.startDate === startDate);
  if (!exists) {
    alerts.push({
      id: crypto.randomUUID(),
      email,
      regionId,
      startDate: startDate || null,
      endDate: endDate || null,
      createdAt: new Date().toISOString(),
      lastChecked: null,
      lastNotifiedDates: null,
    });
    await fs.mkdir(path.dirname(alertsPath), { recursive: true });
    await fs.writeFile(alertsPath, JSON.stringify(alerts, null, 2));
    log('info', 'alert_registered', { email: email.replace(/(.{2}).*@/, '$1***@'), regionId, startDate });
  }

  res.json({ ok: true, message: `We'll email you when permits open for ${info.permitName || regionId}` });
});

// ── DELETE /api/alerts ────────────────────────────────────────────────
app.delete('/api/alerts', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const alertsPath = path.join(__dirname, 'data', 'permit-alerts.json');
  try {
    const alerts = JSON.parse(await fs.readFile(alertsPath, 'utf-8'));
    const filtered = alerts.filter(a => a.email !== email);
    await fs.writeFile(alertsPath, JSON.stringify(filtered, null, 2));
    res.json({ ok: true, removed: alerts.length - filtered.length });
  } catch {
    res.json({ ok: true, removed: 0 });
  }
});

// ── GET /api/health ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
    apiKey: API_KEY ? 'set' : 'missing',
    sentry: SENTRY_DSN ? 'configured' : 'not configured',
    uptime: Math.round(process.uptime()),
  });
});

// ── Sentry error handler (must be last) ───────────────────────────────
if (SENTRY_DSN) {
  app.use(Sentry.expressErrorHandler());
}

// ── Global error handler ──────────────────────────────────────────────
app.use((err, req, res, _next) => {
  log('error', 'unhandled_express_error', { path: req.path, error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  log('info', 'server_start', { port: PORT, apiKey: API_KEY ? 'set' : 'MISSING', sentry: SENTRY_DSN ? 'enabled' : 'disabled', model: MODEL });
});
