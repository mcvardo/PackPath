// score-cluster.js
// Scores a single cluster against user preferences.
// Returns { total: 0-100, breakdown: { mileageFit, elevationFit, sceneryMatch,
//   crowdMatch, accessibility, featureDensity } }
//
// Pure function — same inputs always produce the same output, no side effects.

// ── Elevation tolerance bands (daily gain in feet) ────────────────────
// Calibrated against Sierra trip reports and common backpacking guidance:
//   "easy"     → 0–1500 ft/day  (center: 750)  — gentle valley/lake routes
//   "moderate" → 1500–3000 ft/day (center: 2250) — typical Sierra day
//   "hard"     → 3000+ ft/day   (center: 3750)  — pass-heavy routes
const ELEVATION_BANDS = {
  easy:     { lo: 0,    hi: 1500, center: 750 },
  moderate: { lo: 1500, hi: 3000, center: 2250 },
  hard:     { lo: 3000, hi: 5000, center: 3750 },
};

// ── Scenery type → OSM feature type mapping ───────────────────────────
// Maps user-facing scenery keywords to the feature `type` values in OSM data.
// NOTE: "forest" and "alpine" have no direct OSM feature type — we use proxies:
//   "forest"  → low htRatio (off JMT/PCT = more forested character)
//               LIMITATION: also matches high-desert routes with no trees.
//   "alpine"  → presence of peaks/passes + high daily gain
//               LIMITATION: doesn't distinguish true alpine from high-elevation desert.
const SCENERY_TO_FEATURE_TYPES = {
  lakes:      ['lake', 'water', 'reservoir'],
  peaks:      ['peak'],
  passes:     ['saddle', 'pass'],
  forest:     [],  // proxy-based — see scoring logic below
  alpine:     [],  // proxy-based — see scoring logic below
  waterfalls: ['waterfall'],
};

// ── Component weights ─────────────────────────────────────────────────
// Rationale for each weight:
//   mileageFit (25)     — most important: wrong mileage ruins the trip
//   elevationFit (20)   — second most important: wrong elevation ruins fitness match
//   sceneryMatch (20)   — core reason people choose a route
//   crowdMatch (15)     — strong preference signal but more subjective
//   accessibility (10)  — trailhead count proxy; lower weight due to proxy limitations
//                         (doesn't capture road type, permit requirements, etc.)
//   featureDensity (10) — tiebreaker for otherwise similar routes
//
// Weights sum to 100 so the weighted total is already on a 0-100 scale.
const WEIGHTS = {
  mileageFit:     25,
  elevationFit:   20,
  sceneryMatch:   20,
  crowdMatch:     15,
  accessibility:  10,
  featureDensity: 10,
};

/**
 * Score a cluster against user preferences.
 *
 * @param {Object} cluster — cluster data with at minimum:
 *   { miles, totalGainFt, totalLossFt, features: [{name, type}],
 *     featureCount, htRatio (0-1), distinctPasses, distinctLakes,
 *     distinctPeaks, distinctTrailCount, clusterSize, trailheadCount,
 *     centerLat, centerLon }
 *
 * @param {Object} prefs — user preferences matching user-preferences.example.json schema
 *
 * @returns {{ total: number, breakdown: Object }}
 */
export function scoreCluster(cluster, prefs) {
  const breakdown = {};

  // ── 1. Mileage Fit (0–100) ──────────────────────────────────────────
  // How close is the cluster's miles/day to the user's target?
  // Formula: 100 − (percentDeviation × 200), clamped to [0, 100].
  // A 50% deviation from target → score 0. A 25% deviation → score 50.
  {
    const actualMiPerDay = cluster.miles / prefs.daysTarget;
    const target = prefs.milesPerDayTarget;
    const deviation = Math.abs(actualMiPerDay - target) / target;
    breakdown.mileageFit = Math.round(Math.max(0, Math.min(100, 100 - deviation * 200)));
  }

  // ── 2. Elevation Fit (0–100) ────────────────────────────────────────
  // Inverted parabola centered on the tolerance band's midpoint.
  // Score = 100 × max(0, 1 − (dist / R)²)
  //   where dist = |dailyGain − band.center|
  //   and R = band halfWidth + 1500 (the "zero radius")
  //
  // This eliminates the cliff at the band edge: routes inside the band
  // differentiate smoothly, and routes just outside are penalized gently.
  // R = halfWidth + 1500 was chosen so a route 1500 ft outside the band
  // scores 0 — a meaningful but not catastrophic penalty.
  {
    const dailyGain = cluster.totalGainFt / prefs.daysTarget;
    const band = ELEVATION_BANDS[prefs.elevationTolerance] || ELEVATION_BANDS.moderate;
    const halfWidth = (band.hi - band.lo) / 2;
    const R = halfWidth + 1500;
    const dist = Math.abs(dailyGain - band.center);
    breakdown.elevationFit = Math.round(100 * Math.max(0, 1 - (dist / R) ** 2));
  }

  // ── 3. Scenery Match (0–100) ────────────────────────────────────────
  // For each scenery preference, check if the cluster has matching features.
  // Score = (matched preferences / total preferences) × 80 + density bonus.
  // Density bonus: +5 per extra feature beyond the first, capped at +15.
  // This rewards routes that have many of the requested feature type.
  {
    const requested = prefs.sceneryPreferences || [];
    if (requested.length === 0) {
      breakdown.sceneryMatch = 50; // neutral if no preference stated
    } else {
      let matched = 0;
      let densityBonus = 0;

      for (const pref of requested) {
        const featureTypes = SCENERY_TO_FEATURE_TYPES[pref] || [];

        if (pref === 'forest') {
          // Proxy: low traffic ratio = more off-beaten-path = more forested character.
          // LIMITATION: also matches high-desert routes. No OSM forest polygon data available.
          if (cluster.htRatio < 0.2) matched++;
        } else if (pref === 'alpine') {
          // Proxy: has peaks or passes + high daily gain = above treeline terrain.
          // LIMITATION: doesn't distinguish true alpine from high-elevation desert.
          const dailyGain = cluster.totalGainFt / prefs.daysTarget;
          if ((cluster.distinctPeaks > 0 || cluster.distinctPasses > 0) && dailyGain > 2000) {
            matched++;
          }
        } else {
          const matchingFeatures = cluster.features.filter(f => featureTypes.includes(f.type));
          if (matchingFeatures.length > 0) {
            matched++;
            densityBonus += Math.min(15, (matchingFeatures.length - 1) * 5);
          }
        }
      }

      const baseScore = (matched / requested.length) * 80;
      breakdown.sceneryMatch = Math.round(Math.min(100, baseScore + densityBonus));
    }
  }

  // ── 4. Crowd Match (0–100) ──────────────────────────────────────────
  // Uses htRatio (JMT+PCT miles / total miles) as a crowd proxy.
  // JMT/PCT are the highest-traffic trails in the Sierra — their presence
  // is a reasonable signal for overall route popularity.
  //
  // "popular":  higher htRatio = better. htRatio 0.5+ → 100, 0.0 → 30.
  // "solitude": lower htRatio = better. htRatio 0.0 → 100, 0.5+ → 30.
  // "mixed":    moderate htRatio is ideal. htRatio ~0.25 → 100,
  //             extremes (0.0 or 0.6+) → 60.
  {
    const ht = cluster.htRatio;
    let score;

    if (prefs.crowdPreference === 'popular') {
      score = 30 + Math.min(70, (ht / 0.5) * 70);
    } else if (prefs.crowdPreference === 'solitude') {
      score = 100 - Math.min(70, (ht / 0.5) * 70);
    } else {
      // "mixed" — bell curve centered at 0.25 (some JMT/PCT, mostly off-trail)
      const deviation = Math.abs(ht - 0.25);
      score = Math.max(60, 100 - (deviation / 0.35) * 40);
    }
    breakdown.crowdMatch = Math.round(Math.max(0, Math.min(100, score)));
  }

  // ── 5. Accessibility (0–100) ────────────────────────────────────────
  // Based on trailhead count: more trailheads = more logistical flexibility
  // (car shuttle options, bail-out points, multiple driving directions).
  // Formula: min(100, trailheadCount × 20). 5+ trailheads = 100, 1 = 20.
  //
  // PROXY LIMITATION: This doesn't capture road type (paved vs 4WD),
  // permit requirements, or distance from population centers. A cluster
  // with 5 trailheads all requiring a high-clearance road scores 100.
  // Road accessibility data is not available in the current OSM pipeline.
  {
    const thCount = cluster.trailheadCount || 1;
    breakdown.accessibility = Math.min(100, thCount * 20);
  }

  // ── 6. Feature Density (0–100) ──────────────────────────────────────
  // Named features per mile, normalized to a 0-100 scale.
  // 0 features/mi → 0.  0.3 features/mi → 50.  0.6+ features/mi → 100.
  // Calibrated against the Ansel Adams cluster distribution where the
  // top-quartile clusters average ~0.5 features/mi.
  {
    const density = cluster.featureCount / Math.max(1, cluster.miles);
    const normalized = Math.min(1, density / 0.6);
    breakdown.featureDensity = Math.round(normalized * 100);
  }

  // ── Weighted total ──────────────────────────────────────────────────
  let total = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    total += (breakdown[key] / 100) * weight;
  }
  const maxPossible = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  total = Math.round((total / maxPossible) * 100);

  return { total, breakdown };
}


// ── CLI test runner ───────────────────────────────────────────────────
if (process.argv[1]?.endsWith('score-cluster.js')) {
  const testCluster = {
    miles: 37.5,
    totalGainFt: 14225,
    totalLossFt: 6552,
    featureCount: 25,
    features: [
      { name: 'Altha Lake', type: 'lake' },
      { name: 'Badger Lakes', type: 'lake' },
      { name: 'Billy Lake', type: 'lake' },
      { name: 'Clarice Lake', type: 'lake' },
      { name: 'Clark Lakes', type: 'lake' },
      { name: 'Ediza Lake', type: 'lake' },
      { name: 'Emily Lake', type: 'lake' },
      { name: 'Gem Lake', type: 'lake' },
      { name: 'Gladys Lake', type: 'lake' },
      { name: 'Iceberg Lake', type: 'lake' },
      { name: 'Johnston Lake', type: 'lake' },
      { name: 'Olaine Lake', type: 'lake' },
      { name: 'Rosalie Lake', type: 'lake' },
      { name: 'Shadow Lake', type: 'lake' },
      { name: 'Summit Lake', type: 'lake' },
      { name: 'Clyde Minaret', type: 'peak' },
      { name: 'Leonard Minaret', type: 'peak' },
      { name: 'Red Top Mountain', type: 'peak' },
      { name: 'Riegelhuth Minaret', type: 'peak' },
      { name: 'Minaret Mine', type: 'landmark' },
      { name: 'Middle Fork San Joaquin River', type: 'stream' },
      { name: 'Minaret Creek', type: 'stream' },
      { name: 'Shadow Creek', type: 'stream' },
      { name: 'Rush Creek', type: 'stream' },
    ],
    distinctLakes: 15,
    distinctPeaks: 4,
    distinctPasses: 0,
    htRatio: 0.29,
    distinctTrailCount: 10,
    clusterSize: 1789,
    trailheadCount: 5,
    centerLat: 37.6913,
    centerLon: -119.1458,
  };

  const testPrefs = {
    daysTarget: 4,
    milesPerDayTarget: 10,
    elevationTolerance: 'moderate',
    sceneryPreferences: ['lakes', 'peaks'],
    crowdPreference: 'mixed',
    experienceLevel: 'intermediate',
    groupType: 'couple',
    avoid: '',
    priorities: '',
    notes: '',
  };

  const result = scoreCluster(testCluster, testPrefs);

  console.log('════════════════════════════════════════════════════════');
  console.log('  SCORE-CLUSTER TEST: Minarets Classic');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Cluster: 37.5 mi | +14,225' | 15 lakes | 4 peaks | 0 passes`);
  console.log(`  Daily:   ${(37.5/4).toFixed(1)} mi/day | ${Math.round(14225/4)} ft gain/day`);
  console.log(`  HT ratio: ${(0.29 * 100).toFixed(0)}%`);
  console.log();
  console.log(`  Preferences: 4 days, 10 mi/day, moderate elev, lakes+peaks, mixed crowd`);
  console.log();
  console.log('  BREAKDOWN:');
  console.log('  ─────────────────────────────────────');
  for (const [key, val] of Object.entries(result.breakdown)) {
    const weight = WEIGHTS[key];
    const weighted = ((val / 100) * weight).toFixed(1);
    console.log(`    ${key.padEnd(16)} ${String(val).padStart(3)}/100  (weight ${weight}, contributes ${weighted})`);
  }
  console.log('  ─────────────────────────────────────');
  console.log(`  TOTAL: ${result.total}/100`);
}
