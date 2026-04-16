// rank-clusters.js
// Scores every cluster against user preferences, then selects the top N
// with a geographic diversity constraint: no two returned clusters may have
// geographic centers within MIN_DISTANCE_MI of each other.

import fs from 'node:fs/promises';
import { haversineMiles } from './geo-utils.js';
import { scoreCluster } from './score-cluster.js';

// ── Ranking constants ─────────────────────────────────────────────────
const DEFAULT_CLUSTER_PATH = 'cache/clusters.json';
const DEFAULT_COUNT = 3;

// Minimum miles between any two selected cluster centers.
// 5 miles ensures picks are genuinely different parts of the wilderness,
// not slight variations of the same loop from adjacent trailheads.
const DEFAULT_MIN_DISTANCE_MI = 5;

// Max points below the top pick's score that a diversity-promoted cluster
// is allowed to be. Prevents promoting a mediocre cluster just because it's
// geographically distant. Set to 7 based on observed score distributions
// where the top 3 clusters typically span a 5-10 point range.
const DEFAULT_SCORE_FLOOR = 7;

/**
 * Load cluster data from JSON file.
 * @param {string} path
 * @returns {Promise<Array>}
 */
async function loadClusters(path) {
  const raw = await fs.readFile(path, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Score all clusters, sort descending, apply geographic diversity filter,
 * return the top `count` clusters.
 *
 * @param {Object} preferences — user preferences (see user-preferences.example.json)
 * @param {Object} [opts]
 * @param {number} [opts.count=3] — number of clusters to return
 * @param {number} [opts.minDistanceMi=5] — minimum miles between any two selected cluster centers
 * @param {number} [opts.scoreFloor=7] — max points below top pick's score a diversity-promoted
 *                                        cluster is allowed to be
 * @param {string} [opts.clusterPath] — path to clusters.json (default: cache/clusters.json)
 * @param {Array}  [opts.clusters] — pre-loaded cluster array (skips file read)
 * @returns {Promise<{ ranked: Array, allScored: Array, suggestionsComplete: boolean }>}
 */
export async function rankClusters(preferences, opts = {}) {
  const count = opts.count ?? DEFAULT_COUNT;
  const minDist = opts.minDistanceMi ?? DEFAULT_MIN_DISTANCE_MI;
  const scoreFloor = opts.scoreFloor ?? DEFAULT_SCORE_FLOOR;
  const clusters = opts.clusters ?? await loadClusters(opts.clusterPath ?? DEFAULT_CLUSTER_PATH);

  const scored = clusters.map((cluster, idx) => {
    const result = scoreCluster(cluster, preferences);
    return { ...cluster, _score: result.total, _breakdown: result.breakdown, _rankIdx: idx };
  });

  // Sort descending; ties broken by lower index (earlier in file = stable sort)
  scored.sort((a, b) => b._score - a._score || a._rankIdx - b._rankIdx);

  const topScore = scored.length > 0 ? scored[0]._score : 0;
  const minAcceptableScore = topScore - scoreFloor;

  // Walk sorted list: accept if >minDist from all accepted AND within scoreFloor of top.
  const accepted = [];
  for (const cluster of scored) {
    if (accepted.length >= count) break;
    if (cluster._score < minAcceptableScore) break; // sorted desc, all remaining are worse

    const tooClose = accepted.some(acc =>
      haversineMiles(acc.centerLat, acc.centerLon, cluster.centerLat, cluster.centerLon) < minDist
    );

    if (!tooClose) {
      accepted.push(cluster);
    }
  }

  const suggestionsComplete = accepted.length >= count;

  return { ranked: accepted, allScored: scored, suggestionsComplete };
}


// ── CLI runner ────────────────────────────────────────────────────────
if (process.argv[1]?.endsWith('rank-clusters.js')) {
  const prefsPath = process.argv[2] || 'user-preferences.example.json';

  async function main() {
    const preferences = JSON.parse(await fs.readFile(prefsPath, 'utf-8'));
    const { ranked, allScored, suggestionsComplete } = await rankClusters(preferences);

    const topScore = allScored[0]?._score ?? 0;
    const minAcceptable = topScore - DEFAULT_SCORE_FLOOR;

    console.log('════════════════════════════════════════════════════════════════════════════════');
    console.log('  TOP 10 BY RAW SCORE (before diversity filter)');
    console.log(`  Score floor: ${minAcceptable} (top score ${topScore} minus ${DEFAULT_SCORE_FLOOR})`);
    console.log('════════════════════════════════════════════════════════════════════════════════');
    console.log(`${'#'.padStart(3)}  ${'Score'.padStart(5)}  ${'Mi'.padStart(5)}  ${'Gain'.padStart(6)}  ${'Lakes'.padStart(5)}  ${'Peaks'.padStart(5)}  ${'Pass'.padStart(4)}  ${'HT%'.padStart(5)}  ${'TH'.padStart(3)}  ${'Lat'.padStart(7)}  ${'Lon'.padStart(8)}  ${'Mileage'.padStart(7)} ${'Elev'.padStart(5)} ${'Scene'.padStart(5)} ${'Crowd'.padStart(5)} ${'Acces'.padStart(5)} ${'FeatD'.padStart(5)}  Top Trail`);
    console.log('─'.repeat(130));
    for (let i = 0; i < Math.min(10, allScored.length); i++) {
      const c = allScored[i];
      const b = c._breakdown;
      const belowFloor = c._score < minAcceptable ? ' ✗' : '';
      console.log(
        `${String(i + 1).padStart(3)}  ${String(c._score).padStart(5)}  ` +
        `${String(c.miles).padStart(5)}  ${String(c.totalGainFt).padStart(5)}'  ` +
        `${String(c.distinctLakes).padStart(5)}  ${String(c.distinctPeaks).padStart(5)}  ` +
        `${String(c.distinctPasses).padStart(4)}  ${(c.htRatio * 100).toFixed(0).padStart(4)}%  ` +
        `${String(c.trailheadCount).padStart(3)}  ` +
        `${c.centerLat.toFixed(3).padStart(7)}  ${c.centerLon.toFixed(3).padStart(8)}  ` +
        `${String(b.mileageFit).padStart(7)} ${String(b.elevationFit).padStart(5)} ` +
        `${String(b.sceneryMatch).padStart(5)} ${String(b.crowdMatch).padStart(5)} ` +
        `${String(b.accessibility).padStart(5)} ${String(b.featureDensity).padStart(5)}  ` +
        `${c.topTrail}${belowFloor}`
      );
    }

    console.log('\n\n════════════════════════════════════════════════════════════════════════════════');
    console.log(`  SELECTED PICKS (${DEFAULT_MIN_DISTANCE_MI}-mile diversity, ${DEFAULT_SCORE_FLOOR}-point score floor)`);
    console.log(`  suggestionsComplete: ${suggestionsComplete}`);
    console.log('════════════════════════════════════════════════════════════════════════════════');

    if (ranked.length === 0) {
      console.log('\n  No clusters scored above the minimum threshold.');
    }

    for (let i = 0; i < ranked.length; i++) {
      const c = ranked[i];
      const b = c._breakdown;
      const rawRank = allScored.indexOf(c) + 1;

      console.log(`\n  ── Pick ${i + 1} (raw rank #${rawRank}) ──────────────────────────────`);
      console.log(`  Score: ${c._score}/100`);
      console.log(`  Miles: ${c.miles}  |  Gain: +${c.totalGainFt}'  |  Loss: -${c.totalLossFt}'`);
      console.log(`  Net: ${c.totalGainFt - c.totalLossFt >= 0 ? '+' : ''}${c.totalGainFt - c.totalLossFt}'  |  Gain/mi: ${Math.round(c.totalGainFt / c.miles)}'/mi  |  Daily gain: ${Math.round(c.totalGainFt / preferences.daysTarget)}'/day`);
      console.log(`  Lakes: ${c.distinctLakes}  |  Peaks: ${c.distinctPeaks}  |  Passes: ${c.distinctPasses}`);
      console.log(`  HT ratio: ${(c.htRatio * 100).toFixed(0)}%  |  Trailheads: ${c.trailheadCount}  |  Cluster size: ${c.clusterSize}`);
      console.log(`  Center: ${c.centerLat.toFixed(4)}°N, ${Math.abs(c.centerLon).toFixed(4)}°W`);
      console.log(`  Top trail: ${c.topTrail}  |  Trails: ${c.distinctTrailCount}`);
      console.log(`  Route: ${c.trailRoute.join(' → ')}`);
      if (c.passNames.length) console.log(`  Passes: ${c.passNames.join(', ')}`);
      if (c.peakNames.length) console.log(`  Peaks: ${c.peakNames.join(', ')}`);
      console.log(`  Breakdown: mileage=${b.mileageFit} elev=${b.elevationFit} scenery=${b.sceneryMatch} crowd=${b.crowdMatch} access=${b.accessibility} density=${b.featureDensity}`);

      for (let j = 0; j < i; j++) {
        const other = ranked[j];
        const dist = haversineMiles(c.centerLat, c.centerLon, other.centerLat, other.centerLon);
        console.log(`  Distance from Pick ${j + 1}: ${dist.toFixed(1)} mi`);
      }
    }

    if (!suggestionsComplete) {
      console.log(`\n  ⚠ Only ${ranked.length} of 3 picks met the score floor (${minAcceptable}+).`);
      console.log('    Frontend should show: "' + ranked.length + ' strong match' + (ranked.length !== 1 ? 'es' : '') + ' for your preferences — try expanding your region or adjusting your preferences for more options."');
    }

    console.log('\n\n════════════════════════════════════════════════════════════════════════════════');
    console.log('  DIVERSITY FILTER IMPACT');
    console.log('════════════════════════════════════════════════════════════════════════════════');
    const topRawRanks = ranked.map(r => allScored.indexOf(r) + 1);

    const eligible = allScored.filter(c => c._score >= minAcceptable);
    console.log(`  Score-eligible clusters (score >= ${minAcceptable}): ${eligible.length}`);
    console.log(`  Of those, accepted: ${ranked.length}, filtered by geography: ${eligible.length - ranked.length}`);

    const filtered = [];
    for (const c of eligible) {
      if (ranked.includes(c)) continue;
      const tooCloseTo = ranked.find(acc =>
        haversineMiles(acc.centerLat, acc.centerLon, c.centerLat, c.centerLon) < DEFAULT_MIN_DISTANCE_MI
      );
      if (tooCloseTo) {
        const dist = haversineMiles(tooCloseTo.centerLat, tooCloseTo.centerLon, c.centerLat, c.centerLon);
        filtered.push({
          rawRank: allScored.indexOf(c) + 1,
          score: c._score,
          miles: c.miles,
          topTrail: c.topTrail,
          tooCloseToTrail: tooCloseTo.topTrail,
          distance: dist.toFixed(1),
          lat: c.centerLat.toFixed(3),
          lon: c.centerLon.toFixed(3),
        });
      }
    }
    if (filtered.length) {
      console.log('\n  Score-eligible clusters filtered out by geography:');
      for (const s of filtered) {
        console.log(`    Raw #${s.rawRank} (score ${s.score}, ${s.miles}mi, ${s.topTrail}, center ${s.lat}°N/${s.lon}°W) — ${s.distance} mi from "${s.tooCloseToTrail}"`);
      }
    }

    const belowFloor = allScored.filter(c => c._score < minAcceptable && c._score >= minAcceptable - 5);
    const nearMisses = belowFloor.filter(c => {
      return !ranked.some(acc =>
        haversineMiles(acc.centerLat, acc.centerLon, c.centerLat, c.centerLon) < DEFAULT_MIN_DISTANCE_MI
      );
    });
    if (nearMisses.length) {
      console.log(`\n  Near-miss clusters (below floor but geographically valid, score ${minAcceptable - 5}–${minAcceptable - 1}):`);
      for (const c of nearMisses.slice(0, 5)) {
        console.log(`    Raw #${allScored.indexOf(c) + 1} (score ${c._score}, ${c.miles}mi, ${c.topTrail}, center ${c.centerLat.toFixed(3)}°N/${c.centerLon.toFixed(3)}°W)`);
      }
    }

    console.log(`\n  Selected raw ranks: ${topRawRanks.join(', ')}`);
    console.log(`  Total clusters scored: ${allScored.length}`);
    console.log(`  Score range: ${allScored[allScored.length - 1]._score}–${allScored[0]._score}`);
  }

  main().catch(err => { console.error('Failed:', err); process.exit(1); });
}
