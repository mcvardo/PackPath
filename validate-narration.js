// validate-narration.js
// Formal validation of post-processed narration output against structured input.
// The post-processing step already resolved segment IDs to deterministic miles,
// so mile-sum checks are verifying code correctness, not LLM arithmetic.
//
// Usage: import { validateNarration } from './validate-narration.js';
//
// @param {Array} narration — post-processed route array from postProcess()
// @param {Object} structuredInput — the narration input fed to Claude
// @param {Object} [regionConfig] — region config (e.g. from regions/ansel-adams.json)
//                                  Used for the allowedNonFeatures allowlist.

export function validateNarration(narration, structuredInput, regionConfig = {}) {
  const errors = [];

  // Load region-specific non-feature proper nouns from config.
  // These are real geographic names that appear in Sierra prose but aren't
  // in the OSM point data (wilderness names, range names, river forks, etc.).
  // Keeping this in region config means the validator stays region-agnostic.
  const allowedNonFeatures = new Set(regionConfig.allowedNonFeatures || []);

  for (const route of narration) {
    const archetype = route.archetype;
    const cluster = structuredInput.candidateRoutes[archetype];
    if (!cluster) {
      errors.push({ route: archetype, check: 'cluster-exists', msg: `No input data for archetype "${archetype}"` });
      continue;
    }

    const prefix = `[${archetype}]`;

    // Build lookup sets from input
    const inputTrailNames = new Set(cluster.segments.map(s => s.trailName));
    const inputFeatureNames = new Set(cluster.allFeatures.map(f => f.name));
    for (const seg of cluster.segments) {
      for (const f of [...seg.peaks, ...seg.passes, ...seg.lakes, ...seg.streams, ...seg.springs, ...seg.landmarks]) {
        inputFeatureNames.add(f);
      }
    }

    // (a) routeName must be populated
    if (!route.routeName || route.routeName === 'undefined') {
      errors.push({ route: archetype, check: 'route-name', msg: `${prefix} routeName is missing or undefined` });
    }

    // (b) Every trail name in day segments appears in input trail names
    for (const seg of route.segments) {
      for (const name of seg.trailNames) {
        const normalized = name.replace(/\s*[–—]\s*/g, ' - ');
        if (name.toLowerCase().includes('unnamed') || name.toLowerCase().includes('connector')) continue;
        if (!inputTrailNames.has(name) && !inputTrailNames.has(normalized)) {
          errors.push({ route: archetype, check: 'trail-name', msg: `${prefix} Trail name "${name}" not in input segments` });
        }
      }
    }

    // (c) Feature hallucination detection
    // Checks both multi-word title-case phrases AND single capitalized words
    // that look like proper nouns but aren't in the feature/trail corpus.
    for (const seg of route.segments) {
      const note = seg.note;

      // Multi-word title-case phrases (original check)
      const rawMatches = note.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || [];
      const actionVerbs = new Set([
        'Depart', 'Descend', 'Ascend', 'Cross', 'Follow', 'Traverse', 'Continue',
        'Climb', 'Pass', 'Enter', 'Leave', 'Return', 'Navigate', 'Reach', 'Begin',
        'End', 'Circle', 'Circumnavigate', 'Explore', 'Visit', 'Head', 'Hike',
      ]);
      const potentialFeatures = rawMatches.map(m => {
        const words = m.split(/\s+/);
        while (words.length > 1 && actionVerbs.has(words[0])) words.shift();
        return words.join(' ');
      }).filter(pf => pf.split(/\s+/).length >= 2);

      const trailNameWords = new Set(inputTrailNames);

      for (const pf of potentialFeatures) {
        if (inputFeatureNames.has(pf)) continue;
        if (trailNameWords.has(pf)) continue;
        if (inputTrailNames.has(pf + ' Trail')) continue;
        if (inputTrailNames.has(pf)) continue;
        if (allowedNonFeatures.has(pf)) continue;
        let found = false;
        for (const fn of inputFeatureNames) {
          if (fn.includes(pf) || pf.includes(fn)) { found = true; break; }
        }
        if (!found) {
          for (const tn of inputTrailNames) {
            if (tn.includes(pf) || pf.includes(tn)) { found = true; break; }
          }
        }
        if (!found) {
          errors.push({ route: archetype, check: 'feature-hallucination', msg: `${prefix} Potential hallucinated feature "${pf}" in day note: "${note.slice(0, 60)}..."` });
        }
      }

      // Single capitalized words that look like proper nouns (e.g. "Minarets", "Ritter")
      // Common English words and direction words are excluded.
      const commonWords = new Set([
        'The', 'A', 'An', 'This', 'That', 'These', 'Those', 'It', 'Its',
        'Day', 'Trail', 'Lake', 'Peak', 'Pass', 'Creek', 'River', 'Mountain',
        'North', 'South', 'East', 'West', 'Upper', 'Lower', 'Middle', 'High',
        'From', 'To', 'At', 'In', 'On', 'By', 'Via', 'Near', 'Along', 'Through',
        'Start', 'End', 'Camp', 'Base', 'Loop', 'Route', 'Trailhead',
        'Sierra', 'California', 'Wilderness', 'National', 'Forest', 'Park',
        ...actionVerbs,
      ]);
      const singleCapWords = note.match(/\b[A-Z][a-z]{2,}\b/g) || [];
      for (const word of singleCapWords) {
        if (commonWords.has(word)) continue;
        if (allowedNonFeatures.has(word)) continue;
        // Check if this word appears in any known feature or trail name
        let found = false;
        for (const fn of inputFeatureNames) {
          if (fn.includes(word)) { found = true; break; }
        }
        if (!found) {
          for (const tn of inputTrailNames) {
            if (tn.includes(word)) { found = true; break; }
          }
        }
        if (!found) {
          errors.push({ route: archetype, check: 'feature-hallucination-single', msg: `${prefix} Potential hallucinated proper noun "${word}" in day note: "${note.slice(0, 60)}..."` });
        }
      }
    }

    // (d) Per-day miles sum to totalMiles within ±0.3 mi
    // (deterministic — code computes this, so a failure here is a code bug)
    const segMileSum = route.segments.reduce((sum, s) => sum + s.miles, 0);
    if (Math.abs(segMileSum - route.totalMiles) > 0.3) {
      errors.push({ route: archetype, check: 'mile-sum', msg: `${prefix} Day miles sum to ${segMileSum.toFixed(1)}, expected ${route.totalMiles} (±0.3)` });
    }

    // (e) totalMiles matches input totalMiles exactly
    if (route.totalMiles !== cluster.totalMiles) {
      errors.push({ route: archetype, check: 'total-miles', msg: `${prefix} totalMiles ${route.totalMiles} doesn't match input ${cluster.totalMiles}` });
    }

    // (e2) Elevation: day-level gainFt/lossFt sums must match route totals within ±50 ft
    if (route.totalGainFt !== undefined && cluster.totalGainFt !== undefined) {
      const dayGainSum = route.segments.reduce((sum, s) => sum + (s.gainFt || 0), 0);
      if (Math.abs(dayGainSum - cluster.totalGainFt) > 50) {
        errors.push({ route: archetype, check: 'elevation-gain-sum', msg: `${prefix} Day gain sums to ${dayGainSum} ft, expected ${cluster.totalGainFt} ft (±50)` });
      }
      const dayLossSum = route.segments.reduce((sum, s) => sum + (s.lossFt || 0), 0);
      if (Math.abs(dayLossSum - cluster.totalLossFt) > 50) {
        errors.push({ route: archetype, check: 'elevation-loss-sum', msg: `${prefix} Day loss sums to ${dayLossSum} ft, expected ${cluster.totalLossFt} ft (±50)` });
      }
    }

    // (f) Day count matches the input day count
    const maxDay = Math.max(...route.segments.map(s => s.day));
    if (maxDay !== structuredInput.userPreferences.days) {
      errors.push({ route: archetype, check: 'day-count', msg: `${prefix} Max day is ${maxDay}, user requested ${structuredInput.userPreferences.days} days` });
    }

    // (f2) Day balance: no day shorter than 30% of milesPerDay target
    const milesPerDay = parseFloat(String(structuredInput.userPreferences.milesPerDay).replace('~', ''));
    if (milesPerDay > 0) {
      const minDayMiles = milesPerDay * 0.3;
      for (const seg of route.segments) {
        if (seg.miles < minDayMiles) {
          errors.push({ route: archetype, check: 'day-balance', msg: `${prefix} Day ${seg.day} is ${seg.miles} mi, below 30% of ${milesPerDay} mi target (min ${minDayMiles.toFixed(1)} mi). Redistribute segments for better day balance.` });
        }
      }
    }

    // (f3) Day note accuracy: mileage and elevation figures in notes must match that day
    for (const seg of route.segments) {
      const note = seg.note;

      const mileRegex = /\b(\d+(?:\.\d+)?)\s*[-–—]?\s*mi(?:les?)?\b/gi;
      let mileMatch;
      while ((mileMatch = mileRegex.exec(note)) !== null) {
        const claimedMiles = parseFloat(mileMatch[1]);
        if (Math.abs(claimedMiles - seg.miles) > 0.5) {
          errors.push({ route: archetype, check: 'note-mile-accuracy', msg: `${prefix} Day ${seg.day} note claims ${claimedMiles} mi but day is actually ${seg.miles} mi (tolerance ±0.5)` });
        }
      }

      const elevRegex = /\b(\d{1,2},?\d{3})\s*[-–—']?\s*(?:ft|feet|foot)\b/gi;
      let elevMatch;
      while ((elevMatch = elevRegex.exec(note)) !== null) {
        const claimedElev = parseInt(elevMatch[1].replace(',', ''), 10);
        const dayGain = seg.gainFt || 0;
        const dayLoss = seg.lossFt || 0;
        const closestMatch = Math.min(Math.abs(claimedElev - dayGain), Math.abs(claimedElev - dayLoss));
        if (closestMatch > 100) {
          errors.push({ route: archetype, check: 'note-elev-accuracy', msg: `${prefix} Day ${seg.day} note claims ${claimedElev} ft but day gain is ${dayGain} ft, loss is ${dayLoss} ft (tolerance ±100)` });
        }
      }
    }

    // (g) No day note shorter than 20 words or longer than 80 words
    for (const seg of route.segments) {
      const wordCount = seg.note.split(/\s+/).length;
      if (wordCount < 20) {
        errors.push({ route: archetype, check: 'note-length', msg: `${prefix} Day ${seg.day} note too short (${wordCount} words): "${seg.note.slice(0, 50)}..."` });
      }
      if (wordCount > 80) {
        errors.push({ route: archetype, check: 'note-length', msg: `${prefix} Day ${seg.day} note too long (${wordCount} words): "${seg.note.slice(0, 50)}..."` });
      }
    }

    // (h) Pros and cons: 1-2 sentences each, with specific references
    // Requires a 3-word match (not just a bigram) to prevent false positives
    // from common word pairs that happen to appear in feature names.
    const checkProCon = (items, label) => {
      for (const item of items) {
        const sentences = item.split(/(?<!\d)[.!?]+(?!\d)/).filter(s => s.trim().length > 0);
        if (sentences.length > 2) {
          errors.push({ route: archetype, check: `${label}-length`, msg: `${prefix} ${label} has ${sentences.length} sentences (max 2): "${item.slice(0, 60)}..."` });
        }
        const hasFeatureRef = [...inputFeatureNames].some(fn => item.includes(fn));
        const hasTrailRef = [...inputTrailNames].some(tn => item.includes(tn));
        // Require a 3-word match to avoid bigram false positives
        const hasPartialRef = !hasFeatureRef && !hasTrailRef && [...inputFeatureNames, ...inputTrailNames].some(name => {
          const words = name.split(/\s+/);
          if (words.length < 3) return item.includes(name);
          for (let i = 0; i < words.length - 2; i++) {
            if (item.includes(words[i] + ' ' + words[i + 1] + ' ' + words[i + 2])) return true;
          }
          return false;
        });
        const hasNumeric = /\d+/.test(item) || /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred)\b/i.test(item);
        if (!hasFeatureRef && !hasTrailRef && !hasPartialRef && !hasNumeric) {
          errors.push({ route: archetype, check: `${label}-specificity`, msg: `${prefix} ${label} lacks specific feature/trail/numeric reference: "${item.slice(0, 60)}..."` });
        }
      }
    };
    checkProCon(route.pros, 'pro');
    checkProCon(route.cons, 'con');

    // (i) Segment coverage: every segment index must appear in exactly one day.
    // Requires postProcess() to preserve segmentIds on each day entry.
    // This is the most important correctness check — a missing segment means
    // the route is incomplete and the grounding guarantee is broken.
    if (route.segments.some(s => s.segmentIds)) {
      const allAssignedIds = new Set();
      let hasDuplicate = false;
      for (const seg of route.segments) {
        for (const id of (seg.segmentIds || [])) {
          if (allAssignedIds.has(id)) hasDuplicate = true;
          allAssignedIds.add(id);
        }
      }
      const expectedCount = cluster.segments.length;
      if (allAssignedIds.size !== expectedCount) {
        errors.push({ route: archetype, check: 'segment-coverage', msg: `${prefix} ${allAssignedIds.size} of ${expectedCount} segments assigned — route may be incomplete` });
      }
      if (hasDuplicate) {
        errors.push({ route: archetype, check: 'segment-duplicate', msg: `${prefix} Duplicate segment assignment detected — a segment appears in more than one day` });
      }
    }

    // (j) No banned AI-travel-writer words
    const BANNED_WORDS = ['nestled', 'pristine', 'dramatic', 'dramatically', 'breathtaking', 'stunning', 'spectacular', 'magnificent'];
    const allText = [
      route.routeName, route.summary, route.bestFor,
      ...route.segments.map(s => s.note),
      ...route.pros, ...route.cons, ...(route.gearTips || []),
    ].join(' ');
    for (const word of BANNED_WORDS) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(allText)) {
        errors.push({ route: archetype, check: 'banned-word', msg: `${prefix} Banned word "${word}" found in output text` });
      }
    }

    // (k) No en-dash or em-dash in any text field
    if (/[–—]/.test(allText)) {
      const match = allText.match(/[–—]/);
      const context = allText.substring(Math.max(0, allText.indexOf(match[0]) - 20), allText.indexOf(match[0]) + 20);
      errors.push({ route: archetype, check: 'ascii-hyphen', msg: `${prefix} Non-ASCII dash found near: "...${context}..."` });
    }
  }

  if (errors.length === 0) {
    return { ok: true };
  }
  return { ok: false, errors };
}
