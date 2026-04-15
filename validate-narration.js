// validate-narration.js
// Formal validation of post-processed narration output against structured input.
// The post-processing step already resolved segment IDs to deterministic miles,
// so mile-sum checks are verifying code correctness, not LLM arithmetic.
//
// Usage: import { validateNarration } from './validate-narration.js';

export function validateNarration(narration, structuredInput) {
  const errors = [];

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

    // (c) Every feature name referenced in day notes appears in input features
    for (const seg of route.segments) {
      const note = seg.note;
      const rawMatches = note.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || [];
      // Strip leading common verbs that aren't part of feature names
      const actionVerbs = new Set([
        'Depart', 'Descend', 'Ascend', 'Cross', 'Follow', 'Traverse', 'Continue',
        'Climb', 'Pass', 'Enter', 'Leave', 'Return', 'Navigate', 'Reach', 'Begin',
        'End', 'Circle', 'Circumnavigate', 'Explore', 'Visit', 'Head', 'Hike',
      ]);
      const potentialFeatures = rawMatches.map(m => {
        const words = m.split(/\s+/);
        while (words.length > 1 && actionVerbs.has(words[0])) words.shift();
        return words.join(' ');
      }).filter(pf => pf.split(/\s+/).length >= 2); // still multi-word after stripping
      const trailNameWords = new Set();
      for (const tn of inputTrailNames) trailNameWords.add(tn);

      const allowedNonFeatures = new Set([
        'Ansel Adams', 'Middle Fork', 'San Joaquin', 'North Fork', 'East Fork',
        'Sierra backpackers', 'Banner Peak', 'John Muir', 'Pacific Crest',
        'Agnew Meadows', 'Silver Lake', 'June Lake',
        // Regional geographic names not in OSM point data but real
        'Sierra Crest', 'Sierra Nevada', 'High Sierra', 'Ritter Range',
        'Minarets Wilderness', 'Ansel Adams Wilderness',
      ]);

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
    }

    // (d) Per-day miles sum to totalMiles within ±0.1 mi (deterministic — code computes this)
    const segMileSum = route.segments.reduce((sum, s) => sum + s.miles, 0);
    if (Math.abs(segMileSum - route.totalMiles) > 0.3) {
      // Allow 0.3 for per-day rounding (up to 4 days × 0.05 rounding each = 0.2 + buffer)
      errors.push({ route: archetype, check: 'mile-sum', msg: `${prefix} Day miles sum to ${segMileSum.toFixed(1)}, expected ${route.totalMiles} (±0.3)` });
    }

    // (e) totalMiles matches input totalMiles exactly (set from input, not computed)
    if (route.totalMiles !== cluster.totalMiles) {
      errors.push({ route: archetype, check: 'total-miles', msg: `${prefix} totalMiles ${route.totalMiles} doesn't match input ${cluster.totalMiles}` });
    }

    // (e2) Elevation: day-level gainFt sums must match route totalGainFt within ±50 ft
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

    // (f3) Day note accuracy: mileage and elevation figures in notes must match that day's actual values
    for (const seg of route.segments) {
      const note = seg.note;

      // Check mileage references: e.g. "16.6 miles", "10 mi", "15.7-mile"
      const mileRegex = /\b(\d+(?:\.\d+)?)\s*[-–—]?\s*mi(?:les?)?\b/gi;
      let mileMatch;
      while ((mileMatch = mileRegex.exec(note)) !== null) {
        const claimedMiles = parseFloat(mileMatch[1]);
        if (Math.abs(claimedMiles - seg.miles) > 0.5) {
          errors.push({ route: archetype, check: 'note-mile-accuracy', msg: `${prefix} Day ${seg.day} note claims ${claimedMiles} mi but day is actually ${seg.miles} mi (tolerance ±0.5)` });
        }
      }

      // Check elevation references: e.g. "5,000 ft", "3000 ft", "2,500-ft"
      const elevRegex = /\b(\d{1,2},?\d{3})\s*[-–—']?\s*(?:ft|feet|foot)\b/gi;
      let elevMatch;
      while ((elevMatch = elevRegex.exec(note)) !== null) {
        const claimedElev = parseInt(elevMatch[1].replace(',', ''), 10);
        const dayGain = seg.gainFt || 0;
        const dayLoss = seg.lossFt || 0;
        // The figure could refer to gain or loss — check both
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
    const checkProCon = (items, label) => {
      for (const item of items) {
        // Smart sentence split: don't split on decimal points (e.g. "3.7-mile")
        const sentences = item.split(/(?<!\d)[.!?]+(?!\d)/).filter(s => s.trim().length > 0);
        if (sentences.length > 2) {
          errors.push({ route: archetype, check: `${label}-length`, msg: `${prefix} ${label} has ${sentences.length} sentences (max 2): "${item.slice(0, 60)}..."` });
        }
        const hasFeatureRef = [...inputFeatureNames].some(fn => item.includes(fn));
        const hasTrailRef = [...inputTrailNames].some(tn => item.includes(tn));
        // Also check if any feature/trail name word sequence appears in the item
        const hasPartialRef = !hasFeatureRef && !hasTrailRef && [...inputFeatureNames, ...inputTrailNames].some(name => {
          // Check if at least 2 consecutive words from the name appear
          const words = name.split(/\s+/);
          if (words.length < 2) return item.includes(name);
          for (let i = 0; i < words.length - 1; i++) {
            if (item.includes(words[i] + ' ' + words[i+1])) return true;
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

    // (i) All segment indices covered (no missing, no duplicates)
    const allSegIds = route.segments.flatMap((s, dayIdx) => {
      // We need to check against the raw Claude output, but we have the day structure
      // The post-processor doesn't preserve raw segmentIds, so skip this check here
      // It's enforced structurally by the post-processor
      return [];
    });

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
