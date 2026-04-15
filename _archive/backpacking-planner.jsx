import { useState, useEffect, useMemo, useCallback, useRef } from "react";

/*
 ╔══════════════════════════════════════════════════════════════════════╗
 ║  PACKPATH v2 — Campsite-Driven Backpacking Route Planner           ║
 ║  Appalachian Trail: Georgia → Virginia                             ║
 ║                                                                     ║
 ║  Architecture: Campsites and water sources are first-class objects  ║
 ║  pinned to mile markers. The day planner works BACKWARD from camp  ║
 ║  locations — your daily mileage bends around where you can sleep,  ║
 ║  not the other way around.                                          ║
 ╚══════════════════════════════════════════════════════════════════════╝
*/

// ─────────────────────────────────────────────
// DATA MODEL
// ─────────────────────────────────────────────
// Each trail section contains:
//   - campsites[] at specific mile markers (shelters, designated, dispersed)
//   - waterSources[] at specific mile markers
//   - waypoints[] for notable landmarks
//   - elevation profile as [mile, elevation] pairs
//   - regulations (permit, dispersed camping rules)

const TRAIL_DATA = [
  // ══════════════════════════════════════════
  // GEORGIA
  // ══════════════════════════════════════════
  {
    id: "ga-springer-neelgap",
    name: "Springer Mountain to Neel Gap",
    region: "Georgia",
    startMile: 0.0, endMile: 30.7,
    startElev: 3782, endElev: 3125,
    startCoord: [34.6271, -84.1938], endCoord: [34.7358, -83.9181],
    trailCoords: [[0, 34.6271, -84.1938], [3, 34.6450, -84.1750], [7.5, 34.6650, -84.1450], [10.8, 34.6800, -84.1200], [13.2, 34.6900, -84.0950], [17.8, 34.7050, -84.0600], [20.2, 34.7150, -84.0350], [25.1, 34.7250, -84.0050], [28.2, 34.7300, -83.9650], [30.7, 34.7358, -83.9181]],
    trailheads: [
      { name: "Springer Mountain (USFS 42)", mile: 0.0, parking: true, shuttleAccess: true },
      { name: "Woody Gap (GA 60)", mile: 20.2, parking: true, shuttleAccess: true },
      { name: "Neel Gap (US 19/129)", mile: 30.7, parking: true, shuttleAccess: true, resupply: "Mountain Crossings Outfitter" },
    ],
    dispersedCampingAllowed: true,
    permitRequired: false,
    scenery: ["mountain", "forest"],
    difficulty: 3,
    description: "The iconic start of the AT. Climbs over Springer Mountain, rolls through hardwood forests, and culminates with the strenuous ascent of Blood Mountain — the highest point on the AT in Georgia at 4,461 ft.",
    elevationProfile: [[0,3782],[1.0,3400],[2.7,3100],[5.3,2530],[7.5,3200],[10.8,3480],[13.2,2850],[15.6,3400],[17.8,3060],[20.2,3150],[22.5,3600],[25.1,3960],[28.2,4461],[30.7,3125]],
    campsites: [
      { name: "Springer Mountain Shelter", mile: 0.5, type: "shelter", elev: 3730, capacity: 12, water: "nearby", waterDist: 0.2, features: ["privy","bear cables"], notes: "Southern terminus. Gets crowded Mar-Apr." },
      { name: "Stover Creek Shelter", mile: 2.7, type: "shelter", elev: 3100, capacity: 8, water: "at_site", features: ["bear cables"], notes: "Stover Creek runs right past shelter." },
      { name: "Three Forks", mile: 5.3, type: "designated", elev: 2530, capacity: 20, water: "at_site", features: ["fire ring","multiple tent pads"], notes: "Major camping hub where three creeks converge. Popular first-night camp for NOBOs." },
      { name: "Hawk Mountain Shelter", mile: 7.9, type: "shelter", elev: 3200, capacity: 8, water: "nearby", waterDist: 0.3, features: ["privy"], notes: "Uphill water source — plan accordingly." },
      { name: "Gooch Mountain Shelter", mile: 13.2, type: "shelter", elev: 2850, capacity: 14, water: "at_site", features: ["privy","bear cables","tent pads"], notes: "Reliable spring. Good beginner target from Springer." },
      { name: "Woody Gap (GA 60)", mile: 20.2, type: "dispersed", elev: 3150, capacity: 6, water: "none", waterDist: null, features: ["parking lot","road access"], notes: "Roadside gap. No water at camp — carry from Jarrard Gap spring." },
      { name: "Jarrard Gap", mile: 22.5, type: "dispersed", elev: 3250, capacity: 8, water: "nearby", waterDist: 0.1, features: [], notes: "Flat spots at gap. Spring 0.1mi down blue-blaze." },
      { name: "Woods Hole Shelter", mile: 24.2, type: "shelter", elev: 3580, capacity: 8, water: "at_site", features: ["privy"], notes: "Reliable piped spring." },
      { name: "Blood Mountain Shelter", mile: 28.2, type: "shelter", elev: 4461, capacity: 8, water: "none", waterDist: 0.8, features: ["stone shelter"], notes: "Historic stone shelter at summit. NO water — nearest source 0.8mi north toward Neel Gap. Carry water up." },
      { name: "Neel Gap (Mountain Crossings)", mile: 30.7, type: "designated", elev: 3125, capacity: 12, water: "at_site", features: ["outfitter","hostel","shower","resupply"], notes: "Mountain Crossings outfitter right on trail. Hostel, resupply, shakedown." },
    ],
    waterSources: [
      { name: "Springer Mountain Spring", mile: 0.6, type: "spring", reliability: "reliable", notes: "Just below shelter" },
      { name: "Stover Creek", mile: 2.7, type: "stream", reliability: "reliable" },
      { name: "Chester Creek", mile: 4.2, type: "stream", reliability: "reliable" },
      { name: "Long Creek / Three Forks", mile: 5.3, type: "stream", reliability: "reliable", notes: "Three creeks converge here" },
      { name: "Hawk Mountain Spring", mile: 8.2, type: "spring", reliability: "seasonal", notes: "May dry in late summer" },
      { name: "Justus Creek", mile: 10.8, type: "stream", reliability: "reliable" },
      { name: "Gooch Mountain Spring", mile: 13.2, type: "spring", reliability: "reliable" },
      { name: "Blackwell Creek", mile: 16.0, type: "stream", reliability: "reliable" },
      { name: "Jarrard Gap Spring", mile: 22.6, type: "spring", reliability: "reliable" },
      { name: "Woods Hole Spring", mile: 24.2, type: "spring", reliability: "reliable" },
      { name: "Slaughter Creek", mile: 27.0, type: "stream", reliability: "seasonal" },
      { name: "Neel Gap Piped Spring", mile: 30.7, type: "piped", reliability: "reliable" },
    ],
    waypoints: [
      { name: "Springer Mountain Summit (Southern Terminus)", mile: 0.0, type: "landmark", notes: "Bronze plaque marking the start of the AT" },
      { name: "Blood Mountain Summit", mile: 28.2, type: "summit", elev: 4461, notes: "Highest AT point in Georgia. 360° views." },
      { name: "Mountain Crossings at Neel Gap", mile: 30.7, type: "resupply", notes: "Only building the AT passes through" },
    ],
  },
  {
    id: "ga-neelgap-unicoi",
    name: "Neel Gap to Unicoi Gap",
    region: "Georgia",
    startMile: 30.7, endMile: 51.5,
    startElev: 3125, endElev: 2949,
    startCoord: [34.7358, -83.9181], endCoord: [34.8312, -83.7431],
    trailCoords: [[30.7, 34.7358, -83.9181], [33.0, 34.7500, -83.8900], [36.5, 34.7700, -83.8500], [39.5, 34.7900, -83.8200], [42.2, 34.8050, -83.7950], [44.3, 34.8150, -83.7700], [47.5, 34.8250, -83.7550], [51.5, 34.8312, -83.7431]],
    trailheads: [
      { name: "Neel Gap (US 19/129)", mile: 30.7, parking: true, shuttleAccess: true, resupply: "Mountain Crossings" },
      { name: "Hogpen Gap (GA 348)", mile: 42.2, parking: true, shuttleAccess: true },
      { name: "Unicoi Gap (GA 75)", mile: 51.5, parking: true, shuttleAccess: true },
    ],
    dispersedCampingAllowed: true,
    permitRequired: false,
    scenery: ["mountain", "forest"],
    difficulty: 3,
    description: "Rolling ridge walking over Levelland and Cowrock Mountains, then the strenuous climb over Tray Mountain with dramatic exposed ridges and some of the best views in Georgia.",
    elevationProfile: [[30.7,3125],[33.0,3450],[35.8,3680],[38.4,3050],[40.1,3800],[42.2,3460],[44.3,3300],[46.8,3980],[49.5,4430],[51.5,2949]],
    campsites: [
      { name: "Bull Gap", mile: 33.0, type: "dispersed", elev: 3450, capacity: 6, water: "nearby", waterDist: 0.2, features: [], notes: "Flat spots in gap." },
      { name: "Low Gap Shelter", mile: 35.8, type: "shelter", elev: 3680, capacity: 8, water: "at_site", features: ["privy","bear cables"], notes: "Spring downhill from shelter." },
      { name: "Cheese Factory Site", mile: 38.4, type: "dispersed", elev: 3050, capacity: 10, water: "at_site", features: ["fire ring"], notes: "Old cheese factory location. Flat, good water." },
      { name: "Hogpen Gap", mile: 42.2, type: "dispersed", elev: 3460, capacity: 6, water: "none", features: ["parking lot"], notes: "Roadside. Carry water." },
      { name: "Whitley Gap Shelter", mile: 44.3, type: "shelter", elev: 3300, capacity: 8, water: "at_site", features: ["privy"], notes: "Reliable spring." },
      { name: "Tray Mountain Shelter", mile: 48.5, type: "shelter", elev: 4100, capacity: 8, water: "nearby", waterDist: 0.3, features: ["privy","bear cables"], notes: "High camp with spring 0.3mi downhill." },
      { name: "Unicoi Gap Parking", mile: 51.5, type: "dispersed", elev: 2949, capacity: 6, water: "nearby", waterDist: 0.5, features: ["parking lot","road access"], notes: "Hiker parking lot. Creek 0.5mi south on road." },
    ],
    waterSources: [
      { name: "Neel Gap Spring", mile: 30.7, type: "piped", reliability: "reliable" },
      { name: "Bull Gap Seep", mile: 33.2, type: "spring", reliability: "seasonal" },
      { name: "Low Gap Spring", mile: 35.8, type: "spring", reliability: "reliable" },
      { name: "Cheese Factory Creek", mile: 38.4, type: "stream", reliability: "reliable" },
      { name: "Swallow Creek", mile: 40.1, type: "stream", reliability: "reliable" },
      { name: "Whitley Gap Spring", mile: 44.3, type: "spring", reliability: "reliable" },
      { name: "Tray Mountain Spring", mile: 48.8, type: "spring", reliability: "reliable" },
      { name: "Rocky Knob Creek", mile: 50.5, type: "stream", reliability: "reliable" },
    ],
    waypoints: [
      { name: "Cowrock Mountain", mile: 36.5, type: "summit", elev: 3842 },
      { name: "Tray Mountain Summit", mile: 49.5, type: "summit", elev: 4430, notes: "Exposed summit, dramatic views. Second-highest on AT in GA." },
    ],
  },

  // ══════════════════════════════════════════
  // NC BORDER → NANTAHALA
  // ══════════════════════════════════════════
  {
    id: "nc-unicoi-dickscreek",
    name: "Unicoi Gap to Dicks Creek Gap",
    region: "North Carolina Border",
    startMile: 51.5, endMile: 69.4,
    startElev: 2949, endElev: 2675,
    startCoord: [34.8312, -83.7431], endCoord: [34.9430, -83.6240],
    trailCoords: [[51.5, 34.8312, -83.7431], [54.0, 34.8480, -83.7150], [56.8, 34.8650, -83.6900], [59.5, 34.8820, -83.6650], [62.3, 34.8980, -83.6400], [65.0, 34.9150, -83.6300], [67.8, 34.9290, -83.6270], [69.4, 34.9430, -83.6240]],
    trailheads: [
      { name: "Unicoi Gap (GA 75)", mile: 51.5, parking: true, shuttleAccess: true },
      { name: "Dicks Creek Gap (US 76)", mile: 69.4, parking: true, shuttleAccess: true, resupply: "Hiawassee (11mi hitch)" },
    ],
    dispersedCampingAllowed: true,
    permitRequired: false,
    scenery: ["forest", "mountain"],
    difficulty: 3,
    description: "Cross into North Carolina. Ascend Albert Mountain with its fire tower views, then traverse Standing Indian territory — some of the wildest terrain in the southern AT.",
    elevationProfile: [[51.5,2949],[54.0,3500],[56.8,3100],[59.5,3800],[62.3,4200],[65.0,3600],[67.8,4000],[69.4,2675]],
    campsites: [
      { name: "Blue Mountain Shelter", mile: 54.0, type: "shelter", elev: 3500, capacity: 8, water: "at_site", features: ["privy"], notes: "Spring-fed." },
      { name: "As Knob", mile: 56.8, type: "dispersed", elev: 3100, capacity: 4, water: "nearby", waterDist: 0.2, features: [], notes: "Small cleared area." },
      { name: "Plum Orchard Gap Shelter", mile: 59.5, type: "shelter", elev: 3800, capacity: 12, water: "at_site", features: ["privy","bear cables","tent pads"], notes: "Reliable spring. Popular camp." },
      { name: "Muskrat Creek Shelter", mile: 63.3, type: "shelter", elev: 4100, capacity: 8, water: "at_site", features: ["privy"], notes: "Near NC/GA border." },
      { name: "Deep Gap", mile: 67.0, type: "designated", elev: 4340, capacity: 10, water: "at_site", features: ["bear cables","tent pads"], notes: "Major camping area." },
      { name: "Dicks Creek Gap", mile: 69.4, type: "dispersed", elev: 2675, capacity: 6, water: "at_site", features: ["parking lot"], notes: "Road access. Hitch to Hiawassee for resupply." },
    ],
    waterSources: [
      { name: "Blue Mountain Spring", mile: 54.0, type: "spring", reliability: "reliable" },
      { name: "As Knob Creek", mile: 57.0, type: "stream", reliability: "reliable" },
      { name: "Plum Orchard Spring", mile: 59.5, type: "spring", reliability: "reliable" },
      { name: "Sassafras Branch", mile: 61.5, type: "stream", reliability: "seasonal" },
      { name: "Muskrat Creek", mile: 63.3, type: "stream", reliability: "reliable" },
      { name: "Deep Gap Creek", mile: 67.0, type: "stream", reliability: "reliable" },
      { name: "Dicks Creek", mile: 69.4, type: "stream", reliability: "reliable" },
    ],
    waypoints: [
      { name: "GA/NC State Line", mile: 62.3, type: "landmark" },
    ],
  },
  {
    id: "nc-standing-indian",
    name: "Dicks Creek Gap to Wayah Gap",
    region: "Nantahala",
    startMile: 69.4, endMile: 109.5,
    startElev: 2675, endElev: 4180,
    startCoord: [34.9430, -83.6240], endCoord: [35.1450, -83.5680],
    trailCoords: [[69.4, 34.9430, -83.6240], [72.5, 34.9650, -83.5950], [76.5, 34.9900, -83.5550], [80.5, 35.0150, -83.5350], [85.0, 35.0450, -83.5200], [88.0, 35.0700, -83.5050], [91.5, 35.0950, -83.4900], [95.0, 35.1150, -83.4750], [99.2, 35.1300, -83.4650], [103.0, 35.1380, -83.5050], [106.5, 35.1420, -83.5480], [109.5, 35.1450, -83.5680]],
    trailheads: [
      { name: "Dicks Creek Gap (US 76)", mile: 69.4, parking: true, shuttleAccess: true },
      { name: "Winding Stair Gap (US 64)", mile: 99.2, parking: true, shuttleAccess: true, resupply: "Franklin (10mi)" },
      { name: "Wayah Gap (SR 1310)", mile: 109.5, parking: true, shuttleAccess: false },
    ],
    dispersedCampingAllowed: true,
    permitRequired: false,
    scenery: ["mountain", "meadow", "forest"],
    difficulty: 4,
    description: "The Standing Indian range — the 'Grandstand of the Southern Nantahalas.' Over Standing Indian Mountain at 5,498 ft, then along ridges to Wayah Bald with its historic stone observation tower.",
    elevationProfile: [[69.4,2675],[73.0,3200],[76.5,4100],[79.5,4700],[82.3,5498],[85.0,4200],[88.0,3600],[91.5,4400],[95.0,3800],[99.2,3750],[103.0,4900],[106.5,5342],[109.5,4180]],
    campsites: [
      { name: "Plumorchard Gap Shelter", mile: 73.0, type: "shelter", elev: 3200, capacity: 8, water: "at_site", features: ["privy"], notes: "Spring-fed. Flat tent pads." },
      { name: "Carter Gap Shelter", mile: 76.5, type: "shelter", elev: 4100, capacity: 8, water: "at_site", features: ["privy","bear cables"], notes: "Good water. Long climb to Standing Indian begins here." },
      { name: "Standing Indian Shelter", mile: 80.5, type: "shelter", elev: 4700, capacity: 12, water: "at_site", features: ["privy","bear cables","tent pads"], notes: "High camp. Side trail to summit 0.2mi." },
      { name: "Beech Gap", mile: 85.0, type: "dispersed", elev: 4200, capacity: 6, water: "nearby", waterDist: 0.3, features: [], notes: "Cleared area at gap." },
      { name: "Siler Bald Shelter", mile: 91.5, type: "shelter", elev: 4400, capacity: 8, water: "nearby", waterDist: 0.4, features: ["privy"], notes: "Grassy bald nearby with views. Spring downhill." },
      { name: "Winding Stair Gap (US 64)", mile: 99.2, type: "dispersed", elev: 3750, capacity: 6, water: "none", features: ["parking lot","road access"], notes: "Hitch to Franklin for resupply." },
      { name: "Wayah Shelter", mile: 103.0, type: "shelter", elev: 4900, capacity: 8, water: "at_site", features: ["privy","bear cables"], notes: "Spring 100 yards from shelter." },
      { name: "Wayah Bald (tower)", mile: 106.5, type: "dispersed", elev: 5342, capacity: 4, water: "none", features: [], notes: "Stone tower. Amazing views. No water — carry in." },
      { name: "Wayah Gap", mile: 109.5, type: "dispersed", elev: 4180, capacity: 6, water: "nearby", waterDist: 0.2, features: ["road access"], notes: "Small parking area." },
    ],
    waterSources: [
      { name: "Plumorchard Spring", mile: 73.0, type: "spring", reliability: "reliable" },
      { name: "Timber Ridge Creek", mile: 74.8, type: "stream", reliability: "reliable" },
      { name: "Carter Gap Spring", mile: 76.5, type: "spring", reliability: "reliable" },
      { name: "Standing Indian Spring", mile: 80.5, type: "spring", reliability: "reliable" },
      { name: "Beech Gap Seep", mile: 85.3, type: "spring", reliability: "seasonal" },
      { name: "Long Branch", mile: 88.0, type: "stream", reliability: "reliable" },
      { name: "Siler Bald Spring", mile: 91.9, type: "spring", reliability: "reliable" },
      { name: "Swinging Lick Gap Creek", mile: 95.0, type: "stream", reliability: "reliable" },
      { name: "Panther Gap Spring", mile: 97.5, type: "spring", reliability: "reliable" },
      { name: "Wayah Shelter Spring", mile: 103.0, type: "spring", reliability: "reliable" },
      { name: "Licklog Gap Creek", mile: 108.0, type: "stream", reliability: "seasonal" },
    ],
    waypoints: [
      { name: "Standing Indian Mountain", mile: 82.3, type: "summit", elev: 5498, notes: "Highest peak in the Nantahala range. Side trail 0.2mi from AT." },
      { name: "Siler Bald", mile: 91.5, type: "summit", elev: 5216, notes: "Grassy bald with wildflowers in season." },
      { name: "Wayah Bald Observation Tower", mile: 106.5, type: "landmark", elev: 5342, notes: "CCC-built stone tower with 360° panorama." },
    ],
  },

  // ══════════════════════════════════════════
  // NOC → FONTANA (Pre-Smokies)
  // ══════════════════════════════════════════
  {
    id: "nc-noc-fontana",
    name: "Nantahala Outdoor Center to Fontana Dam",
    region: "Nantahala / Pre-Smokies",
    startMile: 136.3, endMile: 164.7,
    startElev: 1723, endElev: 1800,
    startCoord: [35.3340, -83.5890], endCoord: [35.4510, -83.8120],
    trailCoords: [[136.3, 35.3340, -83.5890], [139.0, 35.3550, -83.6050], [142.5, 35.3800, -83.6350], [146.0, 35.4050, -83.6650], [149.5, 35.4200, -83.7100], [153.0, 35.4300, -83.7400], [156.5, 35.4380, -83.7750], [160.0, 35.4450, -83.8050], [164.7, 35.4510, -83.8120]],
    trailheads: [
      { name: "Nantahala Outdoor Center", mile: 136.3, parking: true, shuttleAccess: true, resupply: "NOC Outfitter + Restaurant" },
      { name: "Stecoah Gap (Sweetwater Creek Rd)", mile: 150.5, parking: true, shuttleAccess: false },
      { name: "Fontana Dam", mile: 164.7, parking: true, shuttleAccess: true, resupply: "Fontana Village Resort" },
    ],
    dispersedCampingAllowed: true,
    permitRequired: false,
    scenery: ["mountain", "forest"],
    difficulty: 5,
    description: "The infamous 'Nantahala Gorge to Fontana' section — one of the toughest stretches on the entire AT. Brutal climb out of NOC over Cheoah Bald, rugged terrain through Stecoah, then the approach to the Smokies.",
    elevationProfile: [[136.3,1723],[139.0,3400],[141.5,5062],[144.0,3200],[147.0,4200],[150.5,3200],[153.0,4050],[156.0,3100],[159.0,3800],[162.0,2500],[164.7,1800]],
    campsites: [
      { name: "Rufus Morgan Shelter", mile: 138.2, type: "shelter", elev: 2700, capacity: 8, water: "at_site", features: ["privy"], notes: "Steep climb from NOC. Waterfall nearby." },
      { name: "Sassafras Gap Shelter", mile: 141.5, type: "shelter", elev: 4300, capacity: 8, water: "nearby", waterDist: 0.4, features: ["privy","bear cables"], notes: "Exposed camp near Cheoah Bald. Spring 0.4mi down." },
      { name: "Cheoah Bald Summit", mile: 142.5, type: "dispersed", elev: 5062, capacity: 4, water: "none", features: [], notes: "Stunning views but no water. Wind-exposed." },
      { name: "Stecoah Gap", mile: 150.5, type: "dispersed", elev: 3200, capacity: 6, water: "none", features: ["road access"], notes: "Road crossing. Sweetwater Creek 0.5mi down road." },
      { name: "Brown Fork Gap Shelter", mile: 153.0, type: "shelter", elev: 4050, capacity: 6, water: "at_site", features: ["privy"], notes: "Small shelter. Reliable spring." },
      { name: "Cable Gap Shelter", mile: 159.5, type: "shelter", elev: 2900, capacity: 8, water: "at_site", features: ["privy","bear cables"], notes: "Last shelter before Fontana." },
      { name: "Fontana Dam Shelter ('The Fontana Hilton')", mile: 164.7, type: "shelter", elev: 1800, capacity: 24, water: "at_site", features: ["privy","shower","power outlet","picnic tables"], notes: "Legendary shelter with hot shower and electricity. Last stop before the Smokies. Register for GSMNP permits here." },
    ],
    waterSources: [
      { name: "Nantahala River", mile: 136.3, type: "stream", reliability: "reliable" },
      { name: "Rufus Morgan Spring", mile: 138.2, type: "spring", reliability: "reliable" },
      { name: "Sassafras Gap Spring", mile: 141.9, type: "spring", reliability: "seasonal" },
      { name: "Locust Cove Gap Creek", mile: 144.0, type: "stream", reliability: "reliable" },
      { name: "Simp Gap Spring", mile: 147.0, type: "spring", reliability: "reliable" },
      { name: "Sweetwater Creek", mile: 151.0, type: "stream", reliability: "reliable" },
      { name: "Brown Fork Spring", mile: 153.0, type: "spring", reliability: "reliable" },
      { name: "Yellow Creek", mile: 156.0, type: "stream", reliability: "reliable" },
      { name: "Cable Gap Spring", mile: 159.5, type: "spring", reliability: "reliable" },
      { name: "Fontana Dam Water", mile: 164.7, type: "piped", reliability: "reliable" },
    ],
    waypoints: [
      { name: "Cheoah Bald", mile: 142.5, type: "summit", elev: 5062, notes: "Dramatic views in all directions. One of the best summits in NC." },
      { name: "Fontana Dam", mile: 164.7, type: "landmark", notes: "Tallest dam in eastern US. Gateway to the Smokies." },
    ],
  },

  // ══════════════════════════════════════════
  // GREAT SMOKY MOUNTAINS
  // ══════════════════════════════════════════
  {
    id: "gsmnp-fontana-newfound",
    name: "Fontana Dam to Newfound Gap (Smokies)",
    region: "Great Smoky Mountains NP",
    startMile: 164.7, endMile: 207.6,
    startElev: 1800, endElev: 5045,
    startCoord: [35.4510, -83.8120], endCoord: [35.6112, -83.4254],
    trailCoords: [[164.7, 35.4510, -83.8120], [168.0, 35.4700, -83.7800], [172.5, 35.4950, -83.7250], [176.0, 35.5150, -83.6800], [180.0, 35.5400, -83.6300], [184.0, 35.5650, -83.5750], [188.0, 35.5850, -83.5200], [192.0, 35.6000, -83.4750], [196.0, 35.6050, -83.4450], [199.7, 35.6100, -83.4200], [203.0, 35.6110, -83.4300], [207.6, 35.6112, -83.4254]],
    trailheads: [
      { name: "Fontana Dam", mile: 164.7, parking: true, shuttleAccess: true },
      { name: "Clingmans Dome Road", mile: 199.7, parking: true, shuttleAccess: false },
      { name: "Newfound Gap (US 441)", mile: 207.6, parking: true, shuttleAccess: true, resupply: "Gatlinburg (15mi)" },
    ],
    dispersedCampingAllowed: false,
    permitRequired: true,
    permitNotes: "GSMNP backcountry permit REQUIRED. Reserve at recreation.gov. Must camp at designated sites/shelters only. $4/person/night.",
    scenery: ["mountain", "forest"],
    difficulty: 5,
    description: "Through the heart of the Great Smokies to the highest point on the entire AT. Designated campsites only — permits required. Spruce-fir forest, massive elevation, and the remotest section in the Southeast.",
    elevationProfile: [[164.7,1800],[168.0,3200],[172.5,5062],[176.0,4800],[180.0,4200],[184.0,5200],[188.0,4900],[192.0,5500],[196.0,6100],[199.7,6643],[203.0,5900],[207.6,5045]],
    campsites: [
      { name: "Birch Spring Gap Shelter", mile: 170.0, type: "shelter", elev: 3830, capacity: 12, water: "at_site", features: ["bear cables"], notes: "Permit required. Spring at shelter." },
      { name: "Mollies Ridge Shelter", mile: 173.8, type: "shelter", elev: 4570, capacity: 12, water: "nearby", waterDist: 0.1, features: ["bear cables"], notes: "Spring 300ft from shelter." },
      { name: "Russell Field Shelter", mile: 176.3, type: "shelter", elev: 4360, capacity: 14, water: "at_site", features: ["bear cables"], notes: "Reliable water." },
      { name: "Spence Field Shelter", mile: 179.3, type: "shelter", elev: 4920, capacity: 12, water: "nearby", waterDist: 0.3, features: ["bear cables"], notes: "Near grassy bald. Spring 0.3mi." },
      { name: "Derrick Knob Shelter", mile: 184.4, type: "shelter", elev: 4880, capacity: 12, water: "at_site", features: ["bear cables"], notes: "Spring at shelter." },
      { name: "Silers Bald Shelter", mile: 189.1, type: "shelter", elev: 5460, capacity: 12, water: "nearby", waterDist: 0.2, features: ["bear cables"], notes: "High camp in spruce-fir." },
      { name: "Double Spring Gap Shelter", mile: 193.5, type: "shelter", elev: 5500, capacity: 12, water: "at_site", features: ["bear cables"], notes: "Two springs at shelter." },
      { name: "Mt Collins Shelter", mile: 198.5, type: "shelter", elev: 5870, capacity: 12, water: "nearby", waterDist: 0.1, features: ["bear cables"], notes: "Near Clingmans Dome." },
      { name: "Icewater Spring Shelter", mile: 203.6, type: "shelter", elev: 5920, capacity: 12, water: "at_site", features: ["bear cables"], notes: "Popular shelter on the Boulevard. Reliable spring." },
    ],
    waterSources: [
      { name: "Birch Spring", mile: 170.0, type: "spring", reliability: "reliable" },
      { name: "Mollies Ridge Spring", mile: 173.9, type: "spring", reliability: "reliable" },
      { name: "Russell Field Spring", mile: 176.3, type: "spring", reliability: "reliable" },
      { name: "Spence Field Spring", mile: 179.6, type: "spring", reliability: "reliable" },
      { name: "Derrick Knob Spring", mile: 184.4, type: "spring", reliability: "reliable" },
      { name: "Silers Bald Spring", mile: 189.3, type: "spring", reliability: "reliable" },
      { name: "Double Spring", mile: 193.5, type: "spring", reliability: "reliable" },
      { name: "Mt Collins Spring", mile: 198.6, type: "spring", reliability: "reliable" },
      { name: "Icewater Spring", mile: 203.6, type: "spring", reliability: "reliable" },
    ],
    waypoints: [
      { name: "Shuckstack Fire Tower", mile: 167.5, type: "landmark", elev: 4020, notes: "Side trail to fire tower with views of Fontana Lake." },
      { name: "Thunderhead Mountain", mile: 178.5, type: "summit", elev: 5527, notes: "Grassy bald summit." },
      { name: "Clingmans Dome", mile: 199.7, type: "summit", elev: 6643, notes: "HIGHEST point on the entire AT. Observation tower. Road access." },
      { name: "Charlies Bunion", mile: 204.5, type: "landmark", elev: 5375, notes: "Dramatic rock outcrop. One of the most popular viewpoints in the Smokies." },
    ],
  },

  // ══════════════════════════════════════════
  // NORTH OF SMOKIES → ROAN
  // ══════════════════════════════════════════
  {
    id: "tn-maxpatch-hotsprings",
    name: "Max Patch to Hot Springs",
    region: "North Carolina Highlands",
    startMile: 249.3, endMile: 273.7,
    startElev: 4629, endElev: 1326,
    startCoord: [35.7970, -82.9600], endCoord: [35.8979, -82.8270],
    trailCoords: [[249.3, 35.7970, -82.9600], [252.5, 35.8080, -82.9350], [256.5, 35.8220, -82.8950], [259.0, 35.8320, -82.8700], [262.0, 35.8450, -82.8500], [265.5, 35.8620, -82.8350], [269.0, 35.8770, -82.8300], [273.7, 35.8979, -82.8270]],
    trailheads: [
      { name: "Max Patch Road", mile: 249.3, parking: true, shuttleAccess: false },
      { name: "Lemon Gap (NC 1182)", mile: 256.5, parking: true, shuttleAccess: false },
      { name: "Hot Springs (US 25/70)", mile: 273.7, parking: true, shuttleAccess: true, resupply: "Hot Springs town — full resupply" },
    ],
    dispersedCampingAllowed: true,
    permitRequired: false,
    scenery: ["meadow", "mountain", "forest"],
    difficulty: 3,
    description: "From the iconic grassy bald of Max Patch — one of the most photographed spots on the AT — descend through rich forest to the beloved trail town of Hot Springs on the French Broad River.",
    elevationProfile: [[249.3,4629],[251.0,4200],[253.5,3400],[256.5,3550],[259.0,4200],[261.5,3800],[264.5,4300],[267.0,3500],[270.0,2800],[273.7,1326]],
    campsites: [
      { name: "Max Patch Summit", mile: 249.3, type: "dispersed", elev: 4629, capacity: 15, water: "none", features: ["scenic"], notes: "Incredible sunset/sunrise camp. NO water — must carry in. Popular with car campers too." },
      { name: "Roaring Fork Shelter", mile: 252.5, type: "shelter", elev: 3600, capacity: 8, water: "at_site", features: ["privy","bear cables"], notes: "Reliable water. Below Max Patch." },
      { name: "Walnut Mountain Shelter", mile: 259.0, type: "shelter", elev: 4200, capacity: 8, water: "nearby", waterDist: 0.3, features: ["privy"], notes: "Spring 0.3mi down blue-blaze." },
      { name: "Deer Park Mountain Shelter", mile: 264.5, type: "shelter", elev: 3100, capacity: 8, water: "at_site", features: ["privy","bear cables"], notes: "Good water." },
      { name: "Garenflo Gap", mile: 268.0, type: "dispersed", elev: 2500, capacity: 6, water: "nearby", waterDist: 0.1, features: [], notes: "Flat spots near creek." },
      { name: "Hot Springs (town)", mile: 273.7, type: "designated", elev: 1326, capacity: 30, water: "at_site", features: ["hostel","restaurant","hot springs","outfitter","resupply","laundry","shower"], notes: "Zero-day paradise. The AT goes right through Main Street." },
    ],
    waterSources: [
      { name: "Roaring Fork Creek", mile: 252.5, type: "stream", reliability: "reliable" },
      { name: "Lemon Gap Creek", mile: 256.5, type: "stream", reliability: "reliable" },
      { name: "Walnut Mountain Spring", mile: 259.3, type: "spring", reliability: "reliable" },
      { name: "Rattlesnake Spring", mile: 261.5, type: "spring", reliability: "seasonal" },
      { name: "Deer Park Spring", mile: 264.5, type: "spring", reliability: "reliable" },
      { name: "Garenflo Gap Creek", mile: 268.1, type: "stream", reliability: "reliable" },
      { name: "French Broad River", mile: 273.7, type: "stream", reliability: "reliable" },
    ],
    waypoints: [
      { name: "Max Patch Summit", mile: 249.3, type: "summit", elev: 4629, notes: "360° grassy bald. One of the most iconic spots on the AT." },
      { name: "Hot Springs, NC", mile: 273.7, type: "town", notes: "Trail town. Hot springs spa. Full services." },
    ],
  },

  // ══════════════════════════════════════════
  // ROAN HIGHLANDS
  // ══════════════════════════════════════════
  {
    id: "tn-roan-highlands",
    name: "Carvers Gap to US-19E (Roan Highlands)",
    region: "Tennessee / NC Border",
    startMile: 370.2, endMile: 392.2,
    startElev: 5512, endElev: 2880,
    startCoord: [36.1063, -82.1098], endCoord: [36.2100, -82.0700],
    trailCoords: [[370.2, 36.1063, -82.1098], [373.0, 36.1200, -82.0950], [376.5, 36.1380, -82.0750], [380.0, 36.1550, -82.0800], [381.5, 36.1620, -82.0850], [385.0, 36.1800, -82.0800], [388.0, 36.1950, -82.0750], [392.2, 36.2100, -82.0700]],
    trailheads: [
      { name: "Carvers Gap (TN 143)", mile: 370.2, parking: true, shuttleAccess: true },
      { name: "Hughes Gap (TN 1330)", mile: 381.5, parking: true, shuttleAccess: false },
      { name: "US-19E", mile: 392.2, parking: true, shuttleAccess: true, resupply: "Roan Mountain (4mi)" },
    ],
    dispersedCampingAllowed: true,
    permitRequired: false,
    scenery: ["meadow", "mountain"],
    difficulty: 4,
    description: "The crown jewel of the Southern Appalachians. Rolling grassy balds above 5,000 feet — Roan High Knob, Jane Bald, Grassy Ridge — with the finest ridgeline walking in the Southeast. Rhododendron gardens in June.",
    elevationProfile: [[370.2,5512],[372.0,6285],[374.0,5800],[376.0,6189],[378.0,5500],[381.5,4040],[384.0,4800],[387.0,4150],[390.0,3600],[392.2,2880]],
    campsites: [
      { name: "Roan High Knob Shelter", mile: 372.0, type: "shelter", elev: 6285, capacity: 15, water: "nearby", waterDist: 0.1, features: ["privy","bear cables"], notes: "HIGHEST shelter on the entire AT. Cold and windy. Spring 500ft." },
      { name: "Stan Murray Shelter", mile: 376.0, type: "shelter", elev: 5050, capacity: 8, water: "at_site", features: ["privy"], notes: "Below Grassy Ridge. Reliable spring." },
      { name: "Overmountain Shelter", mile: 378.5, type: "shelter", elev: 5000, capacity: 20, water: "at_site", features: ["bear cables"], notes: "Famous converted barn. Huge capacity. Spring-fed." },
      { name: "Hughes Gap", mile: 381.5, type: "dispersed", elev: 4040, capacity: 6, water: "nearby", waterDist: 0.3, features: ["road access"], notes: "Gap crossing. Small flat area." },
      { name: "Clyde Smith Shelter", mile: 384.0, type: "shelter", elev: 4480, capacity: 8, water: "at_site", features: ["privy"], notes: "Reliable spring." },
      { name: "Doll Flats", mile: 387.5, type: "designated", elev: 4560, capacity: 15, water: "at_site", features: ["tent pads","bear cables"], notes: "Open meadow campsite. Stunning views. Popular." },
      { name: "Mountaineer Falls Shelter", mile: 390.0, type: "shelter", elev: 3600, capacity: 8, water: "at_site", features: ["privy","bear cables"], notes: "Named for nearby waterfall." },
    ],
    waterSources: [
      { name: "Roan High Knob Spring", mile: 372.1, type: "spring", reliability: "reliable" },
      { name: "Yellow Mountain Spring", mile: 374.5, type: "spring", reliability: "seasonal" },
      { name: "Stan Murray Spring", mile: 376.0, type: "spring", reliability: "reliable" },
      { name: "Overmountain Spring", mile: 378.5, type: "spring", reliability: "reliable" },
      { name: "Elk Hollow Creek", mile: 380.0, type: "stream", reliability: "reliable" },
      { name: "Clyde Smith Spring", mile: 384.0, type: "spring", reliability: "reliable" },
      { name: "Doll Flats Spring", mile: 387.5, type: "spring", reliability: "reliable" },
      { name: "Mountaineer Falls", mile: 390.0, type: "stream", reliability: "reliable" },
      { name: "Buck Creek", mile: 391.5, type: "stream", reliability: "reliable" },
    ],
    waypoints: [
      { name: "Roan High Knob", mile: 372.0, type: "summit", elev: 6285, notes: "Highest shelter on the AT." },
      { name: "Jane Bald", mile: 374.5, type: "summit", elev: 5807, notes: "Grassy bald with rhododendron in June." },
      { name: "Grassy Ridge Bald", mile: 376.0, type: "summit", elev: 6189, notes: "Highest grassy bald in the Appalachians." },
      { name: "Hump Mountain", mile: 378.0, type: "summit", elev: 5587, notes: "Exposed bald with 360° views." },
    ],
  },

  // ══════════════════════════════════════════
  // TENNESSEE — LAUREL FORK / WATAUGA
  // ══════════════════════════════════════════
  {
    id: "tn-laurel-watauga",
    name: "Dennis Cove to Watauga Dam (Laurel Fork & Watauga Lake)",
    region: "Tennessee",
    startMile: 400.5, endMile: 420.5,
    startElev: 2510, endElev: 2070,
    startCoord: [36.2600, -82.1000], endCoord: [36.3200, -82.0500],
    trailCoords: [[400.5, 36.2600, -82.1000], [403.5, 36.2750, -82.0850], [407.5, 36.2900, -82.0700], [411.0, 36.3050, -82.0650], [415.0, 36.3150, -82.0550], [420.5, 36.3200, -82.0500]],
    trailheads: [
      { name: "Dennis Cove Rd", mile: 400.5, parking: true, shuttleAccess: false },
      { name: "US-321 (Hampton)", mile: 407.5, parking: true, shuttleAccess: true, resupply: "Hampton (2mi)" },
      { name: "Watauga Dam Rd", mile: 420.5, parking: true, shuttleAccess: false },
    ],
    dispersedCampingAllowed: true,
    permitRequired: false,
    scenery: ["waterfall", "lake", "forest"],
    difficulty: 3,
    description: "Through Laurel Fork Gorge with its stunning 40-foot waterfall right on the trail, then along the shores of beautiful Watauga Lake — the only lakeside camping on the entire AT.",
    elevationProfile: [[400.5,2510],[403.0,2200],[405.0,1800],[407.5,2000],[410.0,2500],[413.0,3200],[416.0,2300],[418.5,2100],[420.5,2070]],
    campsites: [
      { name: "Laurel Fork Shelter", mile: 402.5, type: "shelter", elev: 2200, capacity: 8, water: "at_site", features: ["privy","swimming hole"], notes: "In the gorge. Laurel Fork creek at shelter. Swimming!" },
      { name: "Pond Flats", mile: 405.0, type: "designated", elev: 1800, capacity: 10, water: "at_site", features: ["tent pads"], notes: "Near Laurel Falls." },
      { name: "US-321 / Hampton", mile: 407.5, type: "dispersed", elev: 2000, capacity: 4, water: "at_site", features: ["road access"], notes: "Town access for resupply." },
      { name: "Shook Branch", mile: 410.0, type: "dispersed", elev: 2400, capacity: 6, water: "at_site", features: [], notes: "Creek campsite." },
      { name: "Watauga Lake Shelter", mile: 416.0, type: "shelter", elev: 2300, capacity: 8, water: "at_site", features: ["privy","bear cables","lake access"], notes: "Lakeside camping! Swim in Watauga Lake. One of the most unique camps on the AT." },
      { name: "Watauga Dam", mile: 420.5, type: "dispersed", elev: 2070, capacity: 6, water: "at_site", features: ["road access"], notes: "Dam crossing area." },
    ],
    waterSources: [
      { name: "Laurel Fork Creek", mile: 402.5, type: "stream", reliability: "reliable" },
      { name: "Laurel Falls", mile: 404.0, type: "stream", reliability: "reliable", notes: "40-foot waterfall" },
      { name: "Pond Flats Creek", mile: 405.0, type: "stream", reliability: "reliable" },
      { name: "Hampton Creek", mile: 407.5, type: "stream", reliability: "reliable" },
      { name: "Shook Branch", mile: 410.0, type: "stream", reliability: "reliable" },
      { name: "Watauga Lake", mile: 416.0, type: "lake", reliability: "reliable", notes: "Filter before drinking" },
    ],
    waypoints: [
      { name: "Laurel Falls", mile: 404.0, type: "waterfall", notes: "40-foot waterfall right on the AT. One of the best water features on the trail." },
      { name: "Watauga Lake", mile: 416.0, type: "landmark", notes: "Only lakeside camping on the AT." },
    ],
  },

  // ══════════════════════════════════════════
  // VIRGINIA — DAMASCUS → GRAYSON HIGHLANDS
  // ══════════════════════════════════════════
  {
    id: "va-damascus-grayson",
    name: "Damascus to Grayson Highlands",
    region: "Virginia (Southwest)",
    startMile: 469.1, endMile: 510.5,
    startElev: 1928, endElev: 4600,
    startCoord: [36.6345, -81.7837], endCoord: [36.6300, -81.5100],
    trailCoords: [[469.1, 36.6345, -81.7837], [475.0, 36.6300, -81.7200], [480.0, 36.6250, -81.6500], [485.0, 36.6280, -81.5900], [490.0, 36.6290, -81.5500], [495.0, 36.6295, -81.5200], [500.0, 36.6300, -81.5300], [510.5, 36.6300, -81.5100]],
    trailheads: [
      { name: "Damascus, VA", mile: 469.1, parking: true, shuttleAccess: true, resupply: "Damascus — full services" },
      { name: "Elk Garden (VA 600)", mile: 494.5, parking: true, shuttleAccess: false },
      { name: "Grayson Highlands SP (Massie Gap)", mile: 503.5, parking: true, shuttleAccess: true },
      { name: "VA 603", mile: 510.5, parking: true, shuttleAccess: false },
    ],
    dispersedCampingAllowed: true,
    permitRequired: false,
    scenery: ["meadow", "mountain", "forest"],
    difficulty: 3,
    description: "From the legendary Trail Days town of Damascus, climb through hardwood forests to the stunning Grayson Highlands — wild ponies, alpine meadows, and Virginia's highest point (Mt. Rogers at 5,729 ft).",
    elevationProfile: [[469.1,1928],[473.0,3400],[477.0,3800],[481.0,4200],[485.0,3600],[489.0,4600],[494.5,5400],[498.0,5729],[501.0,5200],[503.5,5100],[507.0,4800],[510.5,4600]],
    campsites: [
      { name: "Saunders Shelter", mile: 473.5, type: "shelter", elev: 3300, capacity: 8, water: "at_site", features: ["privy"], notes: "Reliable spring." },
      { name: "Lost Mountain Shelter", mile: 478.0, type: "shelter", elev: 3600, capacity: 8, water: "at_site", features: ["privy","bear cables"], notes: "Spring at shelter." },
      { name: "Hurricane Mountain Shelter", mile: 483.0, type: "shelter", elev: 3800, capacity: 8, water: "at_site", features: ["privy"], notes: "Well-maintained." },
      { name: "Trimpi Shelter", mile: 487.5, type: "shelter", elev: 3400, capacity: 8, water: "at_site", features: ["privy"], notes: "Spring-fed." },
      { name: "Thomas Knob Shelter", mile: 497.0, type: "shelter", elev: 5400, capacity: 16, water: "at_site", features: ["privy","bear cables"], notes: "Highest shelter in Virginia. Near Mt. Rogers summit. Ponies may visit camp!" },
      { name: "Wise Shelter", mile: 500.5, type: "shelter", elev: 4920, capacity: 8, water: "at_site", features: ["privy"], notes: "In the highlands. Spring-fed." },
      { name: "Old Orchard Shelter", mile: 504.5, type: "shelter", elev: 4050, capacity: 8, water: "at_site", features: ["privy","bear cables"], notes: "Below Grayson Highlands." },
      { name: "The Scales", mile: 507.0, type: "designated", elev: 4800, capacity: 15, water: "nearby", waterDist: 0.3, features: ["corral"], notes: "Historic livestock corral. Wild ponies everywhere. Open meadow camp." },
      { name: "Pine Mountain", mile: 510.0, type: "dispersed", elev: 4600, capacity: 8, water: "nearby", waterDist: 0.2, features: [], notes: "Ridgeline dispersed camping." },
    ],
    waterSources: [
      { name: "Saunders Spring", mile: 473.5, type: "spring", reliability: "reliable" },
      { name: "Beech Grove Creek", mile: 476.0, type: "stream", reliability: "reliable" },
      { name: "Lost Mountain Spring", mile: 478.0, type: "spring", reliability: "reliable" },
      { name: "Hurricane Creek", mile: 483.0, type: "stream", reliability: "reliable" },
      { name: "Trimpi Spring", mile: 487.5, type: "spring", reliability: "reliable" },
      { name: "Whitetop Branch", mile: 492.0, type: "stream", reliability: "reliable" },
      { name: "Thomas Knob Spring", mile: 497.0, type: "spring", reliability: "reliable" },
      { name: "Wise Spring", mile: 500.5, type: "spring", reliability: "reliable" },
      { name: "Old Orchard Spring", mile: 504.5, type: "spring", reliability: "reliable" },
      { name: "Scales Creek", mile: 507.3, type: "stream", reliability: "seasonal" },
    ],
    waypoints: [
      { name: "Damascus, VA", mile: 469.1, type: "town", notes: "Trail Days festival in May. Iconic trail town." },
      { name: "Mt. Rogers Summit", mile: 498.0, type: "summit", elev: 5729, notes: "Virginia's highest peak. 0.5mi side trail through spruce-fir forest. No views from summit." },
      { name: "Grayson Highlands — Wild Ponies", mile: 503.5, type: "landmark", notes: "Wild ponies roam freely. Alpine meadows. One of the most unique landscapes on the AT." },
    ],
  },

  // ══════════════════════════════════════════
  // VIRGINIA — TRIPLE CROWN
  // ══════════════════════════════════════════
  {
    id: "va-triple-crown",
    name: "VA 624 to Daleville (Triple Crown)",
    region: "Virginia (Central)",
    startMile: 693.5, endMile: 726.3,
    startElev: 2300, endElev: 1220,
    startCoord: [37.3200, -80.1800], endCoord: [37.4100, -79.9100],
    trailCoords: [[693.5, 37.3200, -80.1800], [697.0, 37.3350, -80.1500], [700.5, 37.3550, -80.1200], [704.0, 37.3750, -80.0800], [707.5, 37.3930, -80.0320], [711.0, 37.3950, -79.9950], [715.5, 37.4020, -79.9450], [726.3, 37.4100, -79.9100]],
    trailheads: [
      { name: "VA 624 (North Mountain Trail)", mile: 693.5, parking: true, shuttleAccess: false },
      { name: "VA 311 (Catawba)", mile: 707.5, parking: true, shuttleAccess: true },
      { name: "VA 220 (Daleville)", mile: 726.3, parking: true, shuttleAccess: true, resupply: "Daleville — grocery, restaurants" },
    ],
    dispersedCampingAllowed: true,
    permitRequired: false,
    scenery: ["mountain"],
    difficulty: 4,
    description: "Virginia's legendary 'Triple Crown' — Dragons Tooth, McAfee Knob, and Tinker Cliffs. Three of the most iconic viewpoints on the entire AT, all in one rugged stretch. McAfee Knob is the single most photographed spot on the trail.",
    elevationProfile: [[693.5,2300],[697.0,3050],[700.5,3020],[704.0,3200],[707.5,2000],[711.0,3197],[714.5,3000],[718.0,3000],[721.5,2400],[724.0,2800],[726.3,1220]],
    campsites: [
      { name: "Audie Murphy Monument", mile: 695.5, type: "dispersed", elev: 2800, capacity: 6, water: "nearby", waterDist: 0.4, features: [], notes: "Monument to Medal of Honor recipient. Flat spots nearby." },
      { name: "Pickle Branch Shelter", mile: 698.5, type: "shelter", elev: 2600, capacity: 8, water: "at_site", features: ["privy"], notes: "Spring-fed." },
      { name: "Dragons Tooth Campsite", mile: 701.0, type: "designated", elev: 2800, capacity: 10, water: "nearby", waterDist: 0.5, features: ["bear cables"], notes: "Base camp for Dragons Tooth. Water 0.5mi downhill." },
      { name: "Catawba Mountain Shelter", mile: 707.0, type: "shelter", elev: 2400, capacity: 8, water: "at_site", features: ["privy"], notes: "Near VA 311. Home Depot bucket privy." },
      { name: "Campbell Shelter", mile: 709.5, type: "shelter", elev: 2800, capacity: 8, water: "at_site", features: ["privy","bear cables"], notes: "Below McAfee Knob. Popular staging camp." },
      { name: "McAfee Knob", mile: 711.0, type: "dispersed", elev: 3197, capacity: 6, water: "none", features: [], notes: "THE most photographed spot on the AT. No water. No camping within 0.25mi of knob itself — camp below at Campbell." },
      { name: "Lamberts Meadow Shelter", mile: 714.5, type: "shelter", elev: 2900, capacity: 8, water: "at_site", features: ["privy","bear cables"], notes: "Between McAfee and Tinker Cliffs. Reliable pond." },
      { name: "Tinker Cliffs", mile: 718.0, type: "dispersed", elev: 3000, capacity: 4, water: "none", features: [], notes: "Half-mile long cliff face. Spectacular views. No water." },
      { name: "Scorched Earth Gap Shelter", mile: 721.5, type: "shelter", elev: 2400, capacity: 8, water: "at_site", features: ["privy"], notes: "Spring at shelter." },
      { name: "Daleville (VA 220)", mile: 726.3, type: "designated", elev: 1220, capacity: 10, water: "at_site", features: ["restaurant","grocery","hotel","road access"], notes: "Trail town. Full services. Howard Johnson, Kroger." },
    ],
    waterSources: [
      { name: "Audie Murphy Creek", mile: 695.9, type: "stream", reliability: "seasonal" },
      { name: "Pickle Branch", mile: 698.5, type: "spring", reliability: "reliable" },
      { name: "Catawba Creek", mile: 704.0, type: "stream", reliability: "reliable" },
      { name: "Catawba Mountain Spring", mile: 707.0, type: "spring", reliability: "reliable" },
      { name: "Campbell Spring", mile: 709.5, type: "spring", reliability: "reliable" },
      { name: "Lamberts Meadow Pond", mile: 714.5, type: "pond", reliability: "reliable", notes: "Cow pond — filter well" },
      { name: "Scorched Earth Spring", mile: 721.5, type: "spring", reliability: "reliable" },
      { name: "Tinker Creek", mile: 724.0, type: "stream", reliability: "reliable" },
    ],
    waypoints: [
      { name: "Dragons Tooth", mile: 700.5, type: "landmark", elev: 3020, notes: "Dramatic rock spire. Scramble to top. First of the Triple Crown." },
      { name: "McAfee Knob", mile: 711.0, type: "landmark", elev: 3197, notes: "THE most photographed spot on the entire AT. Iconic rock ledge." },
      { name: "Tinker Cliffs", mile: 718.0, type: "landmark", elev: 3000, notes: "Half-mile cliff walk. Third of the Triple Crown." },
    ],
  },

  // ══════════════════════════════════════════
  // VIRGINIA — SHENANDOAH
  // ══════════════════════════════════════════
  {
    id: "va-shenandoah-south",
    name: "Rockfish Gap to Big Meadows (Shenandoah South)",
    region: "Shenandoah National Park",
    startMile: 857.7, endMile: 895.5,
    startElev: 1902, endElev: 3510,
    startCoord: [37.9679, -78.8560], endCoord: [38.5200, -78.4400],
    trailCoords: [[857.7, 37.9679, -78.8560], [863.0, 38.0150, -78.7950], [868.0, 38.0650, -78.7300], [873.0, 38.1150, -78.6600], [878.0, 38.1700, -78.5900], [883.0, 38.2250, -78.5200], [888.0, 38.2800, -78.4600], [895.5, 38.5200, -78.4400]],
    trailheads: [
      { name: "Rockfish Gap (I-64 / US 250)", mile: 857.7, parking: true, shuttleAccess: true, resupply: "Waynesboro (5mi)" },
      { name: "Loft Mountain Wayside", mile: 874.0, parking: true, shuttleAccess: false, resupply: "Camp store (seasonal)" },
      { name: "Big Meadows", mile: 895.5, parking: true, shuttleAccess: false, resupply: "Lodge, camp store" },
    ],
    dispersedCampingAllowed: false,
    permitRequired: true,
    permitNotes: "Free self-registration backcountry permit at any SNP entrance station or visitor center. Must camp at designated sites or >250ft from trails/roads/streams and out of sight.",
    scenery: ["mountain", "meadow", "forest"],
    difficulty: 2,
    description: "Southern Shenandoah — the 'easy miles' of Virginia. Well-graded trail along Skyline Drive with lodge access, camp stores, and gentle terrain. Great for beginners or recovery hiking. Blackrock summit and Big Meadows are highlights.",
    elevationProfile: [[857.7,1902],[862.0,3000],[866.0,3200],[870.0,3400],[874.0,3350],[878.0,3050],[882.0,3400],[886.0,2800],[890.0,3200],[895.5,3510]],
    campsites: [
      { name: "Paul Wolfe Shelter (Calf Mountain)", mile: 860.5, type: "shelter", elev: 2700, capacity: 8, water: "nearby", waterDist: 0.3, features: ["privy"], notes: "Just inside SNP." },
      { name: "Blackrock Hut", mile: 866.5, type: "shelter", elev: 3060, capacity: 8, water: "nearby", waterDist: 0.2, features: ["privy"], notes: "Near Blackrock summit." },
      { name: "Pinefield Hut", mile: 870.5, type: "shelter", elev: 2800, capacity: 8, water: "at_site", features: ["privy"], notes: "Reliable spring." },
      { name: "Loft Mountain Camp Store", mile: 874.0, type: "designated", elev: 3350, capacity: 15, water: "at_site", features: ["camp store","shower","laundry"], notes: "Seasonal camp store. Shower $." },
      { name: "Ivy Creek Hut", mile: 878.5, type: "shelter", elev: 2900, capacity: 8, water: "at_site", features: ["privy"], notes: "Piped spring." },
      { name: "Bearfence Mountain Hut", mile: 883.5, type: "shelter", elev: 3200, capacity: 8, water: "nearby", waterDist: 0.2, features: ["privy"], notes: "Near rock scramble viewpoint." },
      { name: "Lewis Mountain Campground", mile: 886.0, type: "designated", elev: 3000, capacity: 20, water: "at_site", features: ["camp store","shower"], notes: "NPS campground." },
      { name: "Pocosin Cabin", mile: 890.0, type: "shelter", elev: 2950, capacity: 8, water: "nearby", waterDist: 0.1, features: ["privy"], notes: "Locked cabin (outside camping OK). Spring nearby." },
      { name: "Big Meadows Lodge Area", mile: 895.5, type: "designated", elev: 3510, capacity: 20, water: "at_site", features: ["lodge","restaurant","camp store","shower","laundry"], notes: "Full-service NPS lodge. Taproom. Campground." },
    ],
    waterSources: [
      { name: "Calf Mountain Spring", mile: 860.8, type: "spring", reliability: "reliable" },
      { name: "Blackrock Spring", mile: 866.7, type: "spring", reliability: "reliable" },
      { name: "Pinefield Spring", mile: 870.5, type: "spring", reliability: "reliable" },
      { name: "Loft Mountain Water", mile: 874.0, type: "piped", reliability: "reliable" },
      { name: "Ivy Creek Spring", mile: 878.5, type: "spring", reliability: "reliable" },
      { name: "Bearfence Spring", mile: 883.7, type: "spring", reliability: "reliable" },
      { name: "Lewis Mountain Water", mile: 886.0, type: "piped", reliability: "reliable" },
      { name: "South River Falls", mile: 889.0, type: "stream", reliability: "reliable" },
      { name: "Big Meadows Water", mile: 895.5, type: "piped", reliability: "reliable" },
    ],
    waypoints: [
      { name: "Blackrock Summit", mile: 866.5, type: "summit", elev: 3092, notes: "Easy rock scramble with 360° views." },
      { name: "Bearfence Rock Scramble", mile: 883.5, type: "landmark", notes: "Fun Class 3 scramble to 360° views." },
      { name: "Big Meadows", mile: 895.5, type: "landmark", notes: "Open meadow. Deer. Milky Way views. NPS lodge." },
    ],
  },
];

// ─────────────────────────────────────────────
// LOOP & CONNECTOR TRAILS
// Side trails that branch off the AT and return to it (or return to the same trailhead)
// Used for loop and lollipop route generation
// ─────────────────────────────────────────────
const LOOP_TRAILS = [
  {
    id: "loop-blood-mtn",
    name: "Blood Mountain via Byron Reece & AT",
    region: "Georgia",
    sectionId: "ga-springer-neelgap",
    trailhead: { name: "Byron Reece Trailhead (Neel Gap)", mile: 30.7, lat: 34.7358, lng: -83.9181, parking: true },
    totalMiles: 6.2,
    type: "loop",
    elevGain: 1800, elevLoss: 1800, maxElev: 4461,
    difficulty: 4,
    scenery: ["mountain"],
    description: "Classic loop: ascend via Byron Reece Trail, summit Blood Mountain (highest AT point in GA), descend AT to Neel Gap. Rock scrambles, 360° views.",
    legs: [
      { name: "Byron Reece Trail to Blood Mtn", miles: 2.8, elevGain: 1500, trail: "Byron Reece / AT", coords: [[34.7358,-83.9181],[34.7200,-83.9350],[34.7150,-83.9400]] },
      { name: "Blood Mtn to Neel Gap (AT)", miles: 3.4, elevGain: 300, trail: "AT southbound", coords: [[34.7150,-83.9400],[34.7250,-83.9300],[34.7358,-83.9181]] },
    ],
    campsites: [
      { name: "Blood Mountain Shelter", mile: 2.8, type: "shelter", elev: 4461, water: "none", waterDist: 0.8, capacity: 8, notes: "Historic stone shelter at summit. No water." },
    ],
    waterSources: [
      { name: "Neel Gap Piped Spring", mile: 0.0, type: "piped", reliability: "reliable" },
      { name: "Slaughter Creek", mile: 5.5, type: "stream", reliability: "seasonal" },
    ],
    waypoints: [
      { name: "Blood Mountain Summit", mile: 2.8, type: "summit", elev: 4461, notes: "Highest AT in Georgia. 360° views." },
    ],
  },
  {
    id: "loop-standing-indian",
    name: "Standing Indian Loop (Kimsey Creek / AT)",
    region: "Nantahala",
    sectionId: "nc-standing-indian",
    trailhead: { name: "Standing Indian Campground", mile: 73.0, lat: 35.0500, lng: -83.5500, parking: true },
    totalMiles: 23.4,
    type: "loop",
    elevGain: 4800, elevLoss: 4800, maxElev: 5498,
    difficulty: 4,
    scenery: ["mountain", "forest"],
    description: "Classic multi-day loop: Kimsey Creek Trail up to AT, traverse Standing Indian summit, return via Long Branch Trail. One of the best backpacking loops in the Southeast.",
    legs: [
      { name: "Kimsey Creek Trail to AT", miles: 5.8, elevGain: 2200, trail: "Kimsey Creek Trail", coords: [[35.0500,-83.5500],[35.0600,-83.5400],[35.0650,-83.5200]] },
      { name: "AT over Standing Indian", miles: 11.8, elevGain: 1800, trail: "AT", coords: [[35.0650,-83.5200],[35.0800,-83.5000],[35.0900,-83.4800],[35.0750,-83.4700]] },
      { name: "Long Branch Trail to campground", miles: 5.8, elevGain: 800, trail: "Long Branch Trail", coords: [[35.0750,-83.4700],[35.0650,-83.5100],[35.0500,-83.5500]] },
    ],
    campsites: [
      { name: "Kimsey Creek Campsite", mile: 3.5, type: "designated", elev: 3400, water: "at_site", capacity: 8, notes: "Creekside. Flat tent pads." },
      { name: "Standing Indian Shelter", mile: 9.5, type: "shelter", elev: 4700, water: "at_site", capacity: 12, notes: "AT shelter. Side trail to summit 0.2mi." },
      { name: "Carter Gap Shelter", mile: 14.5, type: "shelter", elev: 4100, water: "at_site", capacity: 8, notes: "AT shelter. Good water." },
      { name: "Long Branch Campsite", mile: 19.0, type: "designated", elev: 3200, water: "at_site", capacity: 6, notes: "Creekside camp on return leg." },
    ],
    waterSources: [
      { name: "Kimsey Creek", mile: 3.5, type: "stream", reliability: "reliable" },
      { name: "Standing Indian Spring", mile: 9.5, type: "spring", reliability: "reliable" },
      { name: "Carter Gap Spring", mile: 14.5, type: "spring", reliability: "reliable" },
      { name: "Long Branch", mile: 19.0, type: "stream", reliability: "reliable" },
    ],
    waypoints: [
      { name: "Standing Indian Summit", mile: 10.5, type: "summit", elev: 5498, notes: "Highest in the Nantahala range. 0.2mi side trail." },
    ],
  },
  {
    id: "loop-roan-carvers",
    name: "Roan Highlands Out-and-Back (Carvers Gap)",
    region: "Tennessee / NC Border",
    sectionId: "tn-roan-highlands",
    trailhead: { name: "Carvers Gap (TN 143)", mile: 370.2, lat: 36.1063, lng: -82.1098, parking: true },
    totalMiles: 12.8,
    type: "lollipop",
    elevGain: 2800, elevLoss: 2800, maxElev: 6285,
    difficulty: 3,
    scenery: ["meadow", "mountain"],
    description: "The finest ridge walk in the Southeast. AT north from Carvers Gap over Roan High Knob, Jane Bald, and Grassy Ridge Bald, return via same trail. Pure alpine meadow above 5,000 ft.",
    legs: [
      { name: "Carvers Gap to Grassy Ridge (AT North)", miles: 6.4, elevGain: 1800, trail: "AT", coords: [[36.1063,-82.1098],[36.1200,-82.1000],[36.1350,-82.0900],[36.1400,-82.0800]] },
      { name: "Grassy Ridge to Carvers Gap (AT South)", miles: 6.4, elevGain: 1000, trail: "AT return", coords: [[36.1400,-82.0800],[36.1350,-82.0900],[36.1200,-82.1000],[36.1063,-82.1098]] },
    ],
    campsites: [
      { name: "Roan High Knob Shelter", mile: 1.8, type: "shelter", elev: 6285, water: "nearby", waterDist: 0.1, capacity: 15, notes: "HIGHEST shelter on entire AT." },
      { name: "Stan Murray Shelter", mile: 5.8, type: "shelter", elev: 5050, water: "at_site", capacity: 8, notes: "Below Grassy Ridge." },
    ],
    waterSources: [
      { name: "Roan High Knob Spring", mile: 1.9, type: "spring", reliability: "reliable" },
      { name: "Stan Murray Spring", mile: 5.8, type: "spring", reliability: "reliable" },
    ],
    waypoints: [
      { name: "Roan High Knob", mile: 1.8, type: "summit", elev: 6285, notes: "Highest shelter on the AT." },
      { name: "Jane Bald", mile: 4.3, type: "summit", elev: 5807, notes: "Grassy bald with rhododendron in June." },
      { name: "Grassy Ridge Bald", mile: 5.8, type: "summit", elev: 6189, notes: "Highest grassy bald in the Appalachians." },
    ],
  },
  {
    id: "loop-grayson",
    name: "Grayson Highlands / Mt. Rogers Loop",
    region: "Virginia (Southwest)",
    sectionId: "va-damascus-grayson",
    trailhead: { name: "Grayson Highlands SP (Massie Gap)", mile: 503.5, lat: 36.6300, lng: -81.5100, parking: true },
    totalMiles: 15.2,
    type: "loop",
    elevGain: 3200, elevLoss: 3200, maxElev: 5729,
    difficulty: 3,
    scenery: ["meadow", "mountain"],
    description: "Wild ponies, alpine meadows, Virginia's highest peak. Loop via AT and Virginia Highlands Horse Trail through the most iconic landscape in Virginia.",
    legs: [
      { name: "Massie Gap to Thomas Knob (AT)", miles: 5.2, elevGain: 1800, trail: "AT north", coords: [[36.6300,-81.5100],[36.6350,-81.5200],[36.6500,-81.5350],[36.6600,-81.5500]] },
      { name: "Thomas Knob to Mt Rogers summit spur", miles: 1.0, elevGain: 400, trail: "Mt Rogers spur", coords: [[36.6600,-81.5500],[36.6580,-81.5550]] },
      { name: "Return via Virginia Highlands Horse Trail", miles: 9.0, elevGain: 1000, trail: "VA Highlands Horse Trail", coords: [[36.6580,-81.5550],[36.6450,-81.5400],[36.6350,-81.5250],[36.6300,-81.5100]] },
    ],
    campsites: [
      { name: "Thomas Knob Shelter", mile: 5.2, type: "shelter", elev: 5400, water: "at_site", capacity: 16, notes: "Highest shelter in VA. Ponies visit!" },
      { name: "Wise Shelter", mile: 8.0, type: "shelter", elev: 4920, water: "at_site", capacity: 8, notes: "In the highlands." },
      { name: "Scales Campsite", mile: 11.5, type: "designated", elev: 4800, water: "nearby", waterDist: 0.3, capacity: 15, notes: "Historic livestock corral. Wild ponies." },
    ],
    waterSources: [
      { name: "Thomas Knob Spring", mile: 5.2, type: "spring", reliability: "reliable" },
      { name: "Wise Spring", mile: 8.0, type: "spring", reliability: "reliable" },
      { name: "Scales Creek", mile: 11.8, type: "stream", reliability: "seasonal" },
    ],
    waypoints: [
      { name: "Wild Ponies Area", mile: 1.5, type: "landmark", notes: "Wild ponies roam freely. Approach carefully." },
      { name: "Mt. Rogers Summit", mile: 6.2, type: "summit", elev: 5729, notes: "Virginia's highest peak. 0.5mi side trail. Spruce-fir forest." },
    ],
  },
  {
    id: "loop-triple-crown-lollipop",
    name: "McAfee Knob & Tinker Cliffs Lollipop",
    region: "Virginia (Central)",
    sectionId: "va-triple-crown",
    trailhead: { name: "McAfee Knob Trailhead (VA 311)", mile: 707.5, lat: 37.3930, lng: -80.0320, parking: true },
    totalMiles: 19.8,
    type: "lollipop",
    elevGain: 4200, elevLoss: 4200, maxElev: 3197,
    difficulty: 4,
    scenery: ["mountain"],
    description: "Lollipop loop hitting the two most famous viewpoints: McAfee Knob (most photographed AT spot) and Tinker Cliffs (half-mile cliff walk). AT out, Andy Layne Trail back.",
    legs: [
      { name: "VA 311 to McAfee Knob (AT)", miles: 3.8, elevGain: 1700, trail: "AT", coords: [[37.3930,-80.0320],[37.3900,-80.0350],[37.3850,-80.0400]] },
      { name: "McAfee Knob to Tinker Cliffs (AT)", miles: 7.5, elevGain: 1200, trail: "AT", coords: [[37.3850,-80.0400],[37.4000,-80.0300],[37.4150,-80.0200]] },
      { name: "Tinker Cliffs to Catawba via Andy Layne Trail", miles: 4.8, elevGain: 800, trail: "Andy Layne Trail", coords: [[37.4150,-80.0200],[37.4050,-80.0250],[37.3930,-80.0320]] },
      { name: "Catawba back to VA 311", miles: 3.7, elevGain: 500, trail: "Road / connector", coords: [[37.3930,-80.0320],[37.3930,-80.0320]] },
    ],
    campsites: [
      { name: "Campbell Shelter", mile: 3.0, type: "shelter", elev: 2800, water: "at_site", capacity: 8, notes: "Staging camp for McAfee Knob." },
      { name: "Lamberts Meadow Shelter", mile: 8.5, type: "shelter", elev: 2900, water: "at_site", capacity: 8, notes: "Between McAfee and Tinker. Pond water." },
      { name: "Scorched Earth Gap Shelter", mile: 14.5, type: "shelter", elev: 2400, water: "at_site", capacity: 8, notes: "Spring at shelter." },
    ],
    waterSources: [
      { name: "Campbell Spring", mile: 3.0, type: "spring", reliability: "reliable" },
      { name: "Lamberts Meadow Pond", mile: 8.5, type: "pond", reliability: "reliable" },
      { name: "Scorched Earth Spring", mile: 14.5, type: "spring", reliability: "reliable" },
    ],
    waypoints: [
      { name: "McAfee Knob", mile: 3.8, type: "landmark", elev: 3197, notes: "THE most photographed spot on the AT." },
      { name: "Tinker Cliffs", mile: 11.0, type: "landmark", elev: 3000, notes: "Half-mile cliff walk. Third of the Triple Crown." },
    ],
  },
  {
    id: "loop-max-patch",
    name: "Max Patch Loop",
    region: "North Carolina Highlands",
    sectionId: "tn-maxpatch-hotsprings",
    trailhead: { name: "Max Patch Trailhead", mile: 249.3, lat: 35.7970, lng: -82.9600, parking: true },
    totalMiles: 4.8,
    type: "loop",
    elevGain: 800, elevLoss: 800, maxElev: 4629,
    difficulty: 2,
    scenery: ["meadow", "mountain"],
    description: "Short loop over the iconic grassy bald of Max Patch via AT and Max Patch Loop Trail. 360° views. Perfect sunrise/sunset camp.",
    legs: [
      { name: "Max Patch Loop Trail to summit", miles: 1.4, elevGain: 500, trail: "Max Patch Loop Trail", coords: [[35.7970,-82.9600],[35.7980,-82.9560],[35.8000,-82.9550]] },
      { name: "Summit traverse (AT)", miles: 1.2, elevGain: 200, trail: "AT", coords: [[35.8000,-82.9550],[35.8010,-82.9580],[35.7990,-82.9620]] },
      { name: "Descend to trailhead", miles: 2.2, elevGain: 100, trail: "Max Patch Loop Trail", coords: [[35.7990,-82.9620],[35.7980,-82.9610],[35.7970,-82.9600]] },
    ],
    campsites: [
      { name: "Max Patch Summit", mile: 1.8, type: "dispersed", elev: 4629, water: "none", capacity: 15, notes: "360° views. No water — carry in. Incredible sunset camp." },
    ],
    waterSources: [],
    waypoints: [
      { name: "Max Patch Summit", mile: 1.8, type: "summit", elev: 4629, notes: "360° grassy bald. One of the most iconic spots on the AT." },
    ],
  },
  {
    id: "loop-laurel-falls",
    name: "Laurel Fork Gorge Loop",
    region: "Tennessee",
    sectionId: "tn-laurel-watauga",
    trailhead: { name: "Dennis Cove Rd", mile: 400.5, lat: 36.2600, lng: -82.1000, parking: true },
    totalMiles: 9.2,
    type: "loop",
    elevGain: 1800, elevLoss: 1800, maxElev: 2800,
    difficulty: 3,
    scenery: ["waterfall", "forest"],
    description: "Loop through Laurel Fork Gorge with the stunning 40-ft Laurel Falls right on trail. AT and Laurel Fork Trail. Swimming holes.",
    legs: [
      { name: "Dennis Cove to Laurel Falls (AT)", miles: 3.5, elevGain: 800, trail: "AT", coords: [[36.2600,-82.1000],[36.2550,-82.0950],[36.2500,-82.0900]] },
      { name: "Laurel Falls to Pond Flats", miles: 2.0, elevGain: 400, trail: "AT", coords: [[36.2500,-82.0900],[36.2450,-82.0850],[36.2430,-82.0800]] },
      { name: "Pond Flats to Dennis Cove (Laurel Fork Trail)", miles: 3.7, elevGain: 600, trail: "Laurel Fork Trail", coords: [[36.2430,-82.0800],[36.2500,-82.0900],[36.2600,-82.1000]] },
    ],
    campsites: [
      { name: "Laurel Fork Shelter", mile: 2.5, type: "shelter", elev: 2200, water: "at_site", capacity: 8, notes: "In the gorge. Swimming hole!" },
      { name: "Pond Flats", mile: 5.5, type: "designated", elev: 1800, water: "at_site", capacity: 10, notes: "Creekside. Near Laurel Falls." },
    ],
    waterSources: [
      { name: "Laurel Fork Creek", mile: 2.5, type: "stream", reliability: "reliable" },
      { name: "Laurel Falls", mile: 4.0, type: "stream", reliability: "reliable" },
      { name: "Pond Flats Creek", mile: 5.5, type: "stream", reliability: "reliable" },
    ],
    waypoints: [
      { name: "Laurel Falls", mile: 4.0, type: "waterfall", notes: "40-foot waterfall right on the AT." },
    ],
  },
];


// ─────────────────────────────────────────────
// UTILITY: Flatten all campsites/water/trailheads across trail data
// ─────────────────────────────────────────────
function flattenAll() {
  const allCamps = [];
  const allWater = [];
  const allTrailheads = [];
  const allWaypoints = [];
  TRAIL_DATA.forEach(sec => {
    sec.campsites.forEach(c => allCamps.push({ ...c, sectionId: sec.id, region: sec.region }));
    sec.waterSources.forEach(w => allWater.push({ ...w, sectionId: sec.id }));
    sec.trailheads.forEach(t => allTrailheads.push({ ...t, sectionId: sec.id, region: sec.region }));
    (sec.waypoints || []).forEach(wp => allWaypoints.push({ ...wp, sectionId: sec.id }));
  });
  allCamps.sort((a, b) => a.mile - b.mile);
  allWater.sort((a, b) => a.mile - b.mile);
  allTrailheads.sort((a, b) => a.mile - b.mile);
  allWaypoints.sort((a, b) => a.mile - b.mile);
  return { allCamps, allWater, allTrailheads, allWaypoints };
}

const { allCamps, allWater, allTrailheads, allWaypoints } = flattenAll();

// ─────────────────────────────────────────────
// PACE ENGINE — Naismith's Rule with Tranter's correction
// ─────────────────────────────────────────────
function estimateHikingTime(miles, elevGain, paceFlat) {
  // Naismith: baseTime + 1 hr per 2000ft gain
  // paceFlat is mph on flat terrain
  const baseHrs = miles / paceFlat;
  const elevHrs = elevGain / 2000;
  return baseHrs + elevHrs;
}

function getPaceForProfile(experience, packWeight) {
  // Base flat pace in mph
  let pace = 2.0;
  if (experience === "beginner") pace = 1.5;
  if (experience === "intermediate") pace = 2.0;
  if (experience === "experienced") pace = 2.5;
  if (experience === "fast") pace = 3.0;
  // Pack weight adjustment
  if (packWeight === "heavy") pace *= 0.85;
  if (packWeight === "ultralight") pace *= 1.1;
  return pace;
}

// ─────────────────────────────────────────────
// ITINERARY PLANNER
// Build day-by-day plan based on campsite reachability
// ─────────────────────────────────────────────
function planItinerary(prefs) {
  const { startMile, endMile, direction, days, experience, packWeight,
    maxDailyMiles, minDailyMiles, maxDailyElevGain, waterComfort,
    campingStyle, sceneryPref } = prefs;

  const pace = getPaceForProfile(experience, packWeight);
  const goingNorth = direction === "NOBO";
  const sortedCamps = allCamps
    .filter(c => {
      const inRange = goingNorth
        ? c.mile >= startMile && c.mile <= endMile
        : c.mile <= startMile && c.mile >= endMile;
      if (!inRange) return false;
      if (campingStyle === "shelter" && c.type !== "shelter") return false;
      if (campingStyle === "established" && c.type === "dispersed") return false;
      return true;
    })
    .sort((a, b) => goingNorth ? a.mile - b.mile : b.mile - a.mile);

  if (sortedCamps.length === 0) return { itinerary: [], warnings: ["No campsites found in range matching your camping style."] };

  // Get elevation profile for the range
  function getElevAtMile(mile) {
    for (const sec of TRAIL_DATA) {
      if (mile >= sec.startMile && mile <= sec.endMile && sec.elevationProfile) {
        const profile = sec.elevationProfile;
        for (let i = 0; i < profile.length - 1; i++) {
          if (mile >= profile[i][0] && mile <= profile[i + 1][0]) {
            const frac = (mile - profile[i][0]) / (profile[i + 1][0] - profile[i][0]);
            return profile[i][1] + frac * (profile[i + 1][1] - profile[i][1]);
          }
        }
        return profile[profile.length - 1][1];
      }
    }
    return 3000; // fallback
  }

  function calcElevGain(fromMile, toMile) {
    const step = 0.5;
    let gain = 0;
    const start = Math.min(fromMile, toMile);
    const end = Math.max(fromMile, toMile);
    let prevElev = getElevAtMile(start);
    for (let m = start + step; m <= end; m += step) {
      const elev = getElevAtMile(m);
      if (elev > prevElev) gain += elev - prevElev;
      prevElev = elev;
    }
    return Math.round(gain);
  }

  function calcElevLoss(fromMile, toMile) {
    const step = 0.5;
    let loss = 0;
    const start = Math.min(fromMile, toMile);
    const end = Math.max(fromMile, toMile);
    let prevElev = getElevAtMile(start);
    for (let m = start + step; m <= end; m += step) {
      const elev = getElevAtMile(m);
      if (elev < prevElev) loss += prevElev - elev;
      prevElev = elev;
    }
    return Math.round(loss);
  }

  // Greedy day planner: for each day, find the best campsite within reachable range
  const itinerary = [];
  let currentMile = goingNorth ? startMile : startMile;
  const targetEnd = goingNorth ? endMile : endMile;
  const warnings = [];
  let usedCamps = new Set();

  for (let day = 0; day < days; day++) {
    const isLastDay = day === days - 1;
    const remainingMiles = Math.abs(targetEnd - currentMile);
    const remainingDays = days - day;
    const idealDailyMiles = remainingMiles / remainingDays;

    // Find camps reachable today
    const reachableCamps = sortedCamps.filter(c => {
      if (usedCamps.has(c.mile)) return false;
      const dist = Math.abs(c.mile - currentMile);
      if (dist < (day === 0 ? 2 : minDailyMiles * 0.5) && dist > 0.5) {} // OK if short on day 1
      else if (dist < minDailyMiles * 0.5) return false;
      if (dist > maxDailyMiles * 1.2) return false;
      if (goingNorth && c.mile <= currentMile) return false;
      if (!goingNorth && c.mile >= currentMile) return false;
      return true;
    });

    if (reachableCamps.length === 0) {
      // If last day, just go to end
      if (isLastDay || remainingMiles < maxDailyMiles * 1.5) {
        const elevGain = calcElevGain(currentMile, targetEnd);
        const elevLoss = calcElevLoss(currentMile, targetEnd);
        const dist = Math.abs(targetEnd - currentMile);
        const time = estimateHikingTime(dist, elevGain, pace);
        const waterOnRoute = allWater.filter(w => {
          const wMile = w.mile;
          return goingNorth ? (wMile > currentMile && wMile <= targetEnd) : (wMile < currentMile && wMile >= targetEnd);
        });
        itinerary.push({
          day: day + 1, startMile: currentMile, endMile: targetEnd,
          camp: { name: "End of route", mile: targetEnd, type: "trailhead" },
          miles: Math.round(dist * 10) / 10, elevGain, elevLoss,
          estimatedHours: Math.round(time * 10) / 10,
          water: waterOnRoute,
          waypoints: allWaypoints.filter(wp => goingNorth ? (wp.mile > currentMile && wp.mile <= targetEnd) : (wp.mile < currentMile && wp.mile >= targetEnd)),
        });
        break;
      }
      warnings.push(`Day ${day + 1}: No campsite reachable from mile ${currentMile.toFixed(1)} within your daily range. Consider adjusting.`);
      continue;
    }

    // Score reachable camps
    const scoredCamps = reachableCamps.map(c => {
      const dist = Math.abs(c.mile - currentMile);
      const elevGain = calcElevGain(currentMile, c.mile);
      let score = 50;

      // Prefer camps near ideal daily mileage
      const mileDeviation = Math.abs(dist - idealDailyMiles);
      score += Math.max(0, 20 - mileDeviation * 2);

      // Prefer camps with water
      if (c.water === "at_site") score += 15;
      else if (c.water === "nearby" && (c.waterDist || 0) < 0.3) score += 10;
      else if (c.water === "none") score -= 20;

      // Penalize if elevation gain exceeds preference
      if (maxDailyElevGain && elevGain > maxDailyElevGain) score -= (elevGain - maxDailyElevGain) / 100;

      // Prefer shelters if that's the style
      if (campingStyle === "shelter" && c.type === "shelter") score += 10;
      if (campingStyle === "established" && c.type === "shelter") score += 5;

      // Bonus for features
      if (c.features && c.features.includes("privy")) score += 3;
      if (c.features && c.features.includes("bear cables")) score += 3;

      // Last day should get close to end
      if (isLastDay) {
        const remainAfter = Math.abs(targetEnd - c.mile);
        if (remainAfter < 5) score += 20;
      }

      return { ...c, score, dist, elevGain, elevLoss: calcElevLoss(currentMile, c.mile) };
    });

    scoredCamps.sort((a, b) => b.score - a.score);
    const bestCamp = scoredCamps[0];
    const altCamps = scoredCamps.slice(1, 3);

    const waterOnRoute = allWater.filter(w => {
      return goingNorth
        ? (w.mile > currentMile && w.mile <= bestCamp.mile)
        : (w.mile < currentMile && w.mile >= bestCamp.mile);
    });

    const waypointsOnRoute = allWaypoints.filter(wp => {
      return goingNorth
        ? (wp.mile > currentMile && wp.mile <= bestCamp.mile)
        : (wp.mile < currentMile && wp.mile >= bestCamp.mile);
    });

    const time = estimateHikingTime(bestCamp.dist, bestCamp.elevGain, pace);

    // Water carry analysis
    let maxWaterGap = 0;
    let prevWaterMile = currentMile;
    const routeWater = [...waterOnRoute];
    if (bestCamp.water === "at_site" || bestCamp.water === "nearby") {
      routeWater.push({ mile: bestCamp.mile });
    }
    routeWater.sort((a, b) => a.mile - b.mile);
    for (const w of routeWater) {
      const gap = Math.abs(w.mile - prevWaterMile);
      if (gap > maxWaterGap) maxWaterGap = gap;
      prevWaterMile = w.mile;
    }

    itinerary.push({
      day: day + 1,
      startMile: Math.round(currentMile * 10) / 10,
      endMile: Math.round(bestCamp.mile * 10) / 10,
      camp: bestCamp,
      altCamps,
      miles: Math.round(bestCamp.dist * 10) / 10,
      elevGain: bestCamp.elevGain,
      elevLoss: bestCamp.elevLoss,
      estimatedHours: Math.round(time * 10) / 10,
      water: waterOnRoute,
      maxWaterGap: Math.round(maxWaterGap * 10) / 10,
      waypoints: waypointsOnRoute,
    });

    usedCamps.add(bestCamp.mile);
    currentMile = bestCamp.mile;
  }

  // Check if we reached the end
  const lastDay = itinerary[itinerary.length - 1];
  if (lastDay && Math.abs(lastDay.endMile - targetEnd) > 2) {
    const remaining = Math.abs(targetEnd - lastDay.endMile);
    warnings.push(`Route ends ${remaining.toFixed(1)} mi short of your target. Consider adding a day or increasing daily mileage.`);
  }

  // Permit check
  const sectionsUsed = new Set();
  for (const sec of TRAIL_DATA) {
    const secStart = Math.min(sec.startMile, sec.endMile);
    const secEnd = Math.max(sec.startMile, sec.endMile);
    const routeStart = Math.min(startMile, endMile);
    const routeEnd = Math.max(startMile, endMile);
    if (secStart < routeEnd && secEnd > routeStart) {
      if (sec.permitRequired) warnings.push(`⚠ ${sec.name}: ${sec.permitNotes}`);
      if (!sec.dispersedCampingAllowed) warnings.push(`${sec.name}: Dispersed camping NOT allowed — designated sites/shelters only.`);
    }
  }

  // Score the overall route
  let routeScore = 70;
  const totalMiles = itinerary.reduce((s, d) => s + d.miles, 0);
  const totalElev = itinerary.reduce((s, d) => s + d.elevGain, 0);
  if (itinerary.some(d => d.camp.water === "none")) routeScore -= 10;
  if (warnings.length > 2) routeScore -= 10;
  const routeScenery = new Set();
  for (const sec of TRAIL_DATA) {
    const secStart = Math.min(sec.startMile, sec.endMile);
    const secEnd = Math.max(sec.startMile, sec.endMile);
    if (secStart < Math.max(startMile, endMile) && secEnd > Math.min(startMile, endMile)) {
      (sec.scenery || []).forEach(s => routeScenery.add(s));
    }
  }
  if (sceneryPref.some(p => routeScenery.has(p))) routeScore += 10;

  return {
    itinerary,
    warnings,
    totalMiles: Math.round(totalMiles * 10) / 10,
    totalElevGain: totalElev,
    routeScore: Math.min(100, Math.max(0, routeScore)),
    sceneryTypes: [...routeScenery],
  };
}

// ─────────────────────────────────────────────
// LOOP / LOLLIPOP ITINERARY PLANNER
// ─────────────────────────────────────────────
function planLoopItinerary(loop, prefs) {
  const { days, experience, packWeight, maxDailyMiles, minDailyMiles, maxDailyElevGain, campingStyle } = prefs;
  const pace = getPaceForProfile(experience, packWeight);

  const camps = (loop.campsites || [])
    .filter(c => {
      if (campingStyle === "shelter" && c.type !== "shelter") return false;
      if (campingStyle === "established" && c.type === "dispersed") return false;
      return true;
    })
    .sort((a, b) => a.mile - b.mile);

  // For single-day loops, no overnight needed
  const totalTime = estimateHikingTime(loop.totalMiles, loop.elevGain, pace);
  if (days === 1 || loop.totalMiles <= maxDailyMiles) {
    return {
      itinerary: [{
        day: 1,
        startMile: 0,
        endMile: loop.totalMiles,
        camp: { name: loop.trailhead.name + " (return)", mile: loop.totalMiles, type: "trailhead", elev: loop.trailhead.lat ? null : null, water: "none" },
        altCamps: [],
        miles: loop.totalMiles,
        elevGain: loop.elevGain,
        elevLoss: loop.elevLoss,
        estimatedHours: Math.round(totalTime * 10) / 10,
        water: loop.waterSources || [],
        maxWaterGap: 0,
        waypoints: loop.waypoints || [],
        isLoop: true,
      }],
      warnings: totalTime > 10 ? ["Long day: ~" + Math.round(totalTime) + " hours of hiking. Consider adding a day."] : [],
      totalMiles: loop.totalMiles,
      totalElevGain: loop.elevGain,
      routeScore: 75,
      sceneryTypes: loop.scenery || [],
      routeType: loop.type,
    };
  }

  // Multi-day loop: distribute camps across days
  const itinerary = [];
  let currentMile = 0;
  const milesPerDay = loop.totalMiles / days;

  for (let d = 0; d < days; d++) {
    const isLastDay = d === days - 1;
    const targetMile = isLastDay ? loop.totalMiles : currentMile + milesPerDay;

    // Find best camp near target
    let bestCamp = null;
    if (isLastDay) {
      bestCamp = { name: loop.trailhead.name + " (return)", mile: loop.totalMiles, type: "trailhead", water: "none" };
    } else {
      const reachable = camps.filter(c => c.mile > currentMile && c.mile <= currentMile + maxDailyMiles * 1.2 && c.mile > currentMile + minDailyMiles * 0.5);
      if (reachable.length > 0) {
        // Pick the one closest to target
        reachable.sort((a, b) => Math.abs(a.mile - targetMile) - Math.abs(b.mile - targetMile));
        bestCamp = reachable[0];
      } else {
        // No camp found, use a synthetic camp at the target
        bestCamp = { name: "Dispersed camp", mile: Math.round(targetMile * 10) / 10, type: "dispersed", water: "none" };
      }
    }

    const dist = Math.round((bestCamp.mile - currentMile) * 10) / 10;
    const dayFrac = dist / loop.totalMiles;
    const dayGain = Math.round(loop.elevGain * dayFrac);
    const dayLoss = Math.round(loop.elevLoss * dayFrac);
    const time = estimateHikingTime(dist, dayGain, pace);

    const waterOnRoute = (loop.waterSources || []).filter(w => w.mile > currentMile && w.mile <= bestCamp.mile);
    const waypointsOnRoute = (loop.waypoints || []).filter(wp => wp.mile > currentMile && wp.mile <= bestCamp.mile);
    const altCamps = camps.filter(c => c.mile !== bestCamp.mile && c.mile > currentMile && c.mile <= currentMile + maxDailyMiles).slice(0, 2);

    itinerary.push({
      day: d + 1,
      startMile: Math.round(currentMile * 10) / 10,
      endMile: Math.round(bestCamp.mile * 10) / 10,
      camp: bestCamp,
      altCamps: altCamps.map(c => ({ ...c, dist: Math.round((c.mile - currentMile) * 10) / 10 })),
      miles: dist,
      elevGain: dayGain,
      elevLoss: dayLoss,
      estimatedHours: Math.round(time * 10) / 10,
      water: waterOnRoute,
      maxWaterGap: 0,
      waypoints: waypointsOnRoute,
      isLoop: true,
    });

    currentMile = bestCamp.mile;
  }

  const warnings = [];
  if (loop.type === "lollipop") warnings.push("Lollipop route: you'll hike the 'stem' section twice (out and back).");

  return {
    itinerary,
    warnings,
    totalMiles: loop.totalMiles,
    totalElevGain: loop.elevGain,
    routeScore: 80,
    sceneryTypes: loop.scenery || [],
    routeType: loop.type,
  };
}

// ─────────────────────────────────────────────
// SUGGEST MULTIPLE ROUTES
// ─────────────────────────────────────────────
function suggestRoutes(prefs) {
  const { startRegion, days, experience, packWeight, maxDailyMiles, campingStyle, sceneryPref, routeType } = prefs;
  const pace = getPaceForProfile(experience, packWeight);
  const roughMiles = days * (maxDailyMiles * 0.7);

  const matchSections = startRegion === "any"
    ? TRAIL_DATA
    : TRAIL_DATA.filter(s => s.region.toLowerCase().includes(startRegion.toLowerCase()));

  const candidates = [];

  // ── LOOP & LOLLIPOP ROUTES ──
  if (routeType !== "p2p") {
    const matchLoops = startRegion === "any"
      ? LOOP_TRAILS
      : LOOP_TRAILS.filter(l => l.region.toLowerCase().includes(startRegion.toLowerCase()));

    for (const loop of matchLoops) {
      // Filter by type if specified
      if (routeType === "loop" && loop.type !== "loop") continue;
      if (routeType === "lollipop" && loop.type !== "lollipop") continue;

      // Check if loop fits in the trip days
      const minDays = Math.ceil(loop.totalMiles / maxDailyMiles);
      if (minDays > days + 1) continue; // too long
      if (loop.totalMiles > roughMiles * 2.5) continue; // way too long

      const plan = planLoopItinerary(loop, prefs);

      // Score the loop
      let score = plan.routeScore;
      if (Math.abs(loop.totalMiles - roughMiles) < roughMiles * 0.3) score += 10;
      if (sceneryPref.some(p => (loop.scenery || []).includes(p))) score += 10;
      if (loop.difficulty <= 2 && prefs.maxDailyElevGain < 2000) score += 5;
      if (loop.difficulty >= 4 && prefs.maxDailyElevGain > 3000) score += 5;
      plan.routeScore = Math.min(100, score);

      candidates.push({
        startTrailhead: loop.trailhead,
        endMile: loop.trailhead.mile,
        direction: loop.type,
        plan,
        sectionName: loop.name,
        isLoop: true,
        loopId: loop.id,
      });
    }
  }

  // ── POINT-TO-POINT ROUTES ──
  if (routeType !== "loop" && routeType !== "lollipop") {
    for (const sec of matchSections) {
      for (const th of sec.trailheads) {
        const endMile = th.mile + roughMiles;
        const plan = planItinerary({
          ...prefs,
          startMile: th.mile,
          endMile: Math.min(endMile, allCamps[allCamps.length - 1].mile),
          direction: "NOBO",
        });
        if (plan.itinerary.length > 0) {
          plan.routeType = "p2p";
          candidates.push({
            startTrailhead: th,
            endMile: plan.itinerary[plan.itinerary.length - 1].endMile,
            direction: "NOBO",
            plan,
            sectionName: sec.name,
          });
        }
      }
    }
  }

  // Score and sort
  candidates.sort((a, b) => b.plan.routeScore - a.plan.routeScore);

  // Deduplicate
  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = c.loopId || `${Math.round(c.startTrailhead.mile / 5) * 5}-${Math.round(c.endMile / 5) * 5}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }

  return unique.slice(0, 6);
}

// ─────────────────────────────────────────────
// COORDINATE RESOLVER — shared by Map + GPX
// ─────────────────────────────────────────────
function getCoordForMile(mile) {
  for (const sec of TRAIL_DATA) {
    if (mile >= sec.startMile && mile <= sec.endMile) {
      // Use trailCoords if available for accurate path
      if (sec.trailCoords && sec.trailCoords.length >= 2) {
        const tc = sec.trailCoords;
        // Find the two bracketing points
        for (let i = 0; i < tc.length - 1; i++) {
          if (mile >= tc[i][0] && mile <= tc[i + 1][0]) {
            const frac = (mile - tc[i][0]) / (tc[i + 1][0] - tc[i][0]);
            return [
              tc[i][1] + frac * (tc[i + 1][1] - tc[i][1]),
              tc[i][2] + frac * (tc[i + 1][2] - tc[i][2]),
            ];
          }
        }
        // Past last coord, use last point
        const last = tc[tc.length - 1];
        return [last[1], last[2]];
      }
      // Fallback: linear between start/end
      const frac = (mile - sec.startMile) / (sec.endMile - sec.startMile);
      return [
        sec.startCoord[0] + frac * (sec.endCoord[0] - sec.startCoord[0]),
        sec.startCoord[1] + frac * (sec.endCoord[1] - sec.startCoord[1]),
      ];
    }
  }
  // Fallback: linear interpolation across entire trail
  const firstSec = TRAIL_DATA[0];
  const lastSec = TRAIL_DATA[TRAIL_DATA.length - 1];
  const totalMiles = lastSec.endMile - firstSec.startMile;
  const frac = (mile - firstSec.startMile) / totalMiles;
  return [
    firstSec.startCoord[0] + frac * (lastSec.endCoord[0] - firstSec.startCoord[0]),
    firstSec.startCoord[1] + frac * (lastSec.endCoord[1] - firstSec.startCoord[1]),
  ];
}

function getElevForMile(mile) {
  for (const sec of TRAIL_DATA) {
    if (mile >= sec.startMile && mile <= sec.endMile && sec.elevationProfile) {
      const profile = sec.elevationProfile;
      for (let i = 0; i < profile.length - 1; i++) {
        if (mile >= profile[i][0] && mile <= profile[i + 1][0]) {
          const frac = (mile - profile[i][0]) / (profile[i + 1][0] - profile[i][0]);
          return Math.round(profile[i][1] + frac * (profile[i + 1][1] - profile[i][1]));
        }
      }
      return profile[profile.length - 1][1];
    }
  }
  return 2000;
}

// ─────────────────────────────────────────────
// DAY DESCRIPTION & DIFFICULTY HELPERS
// ─────────────────────────────────────────────
function getDayDescription(day) {
  const parts = [];

  if (day.elevGain > 3000) {
    parts.push("strenuous climbing");
  } else if (day.elevGain < 1000) {
    parts.push("easy, gentle terrain");
  }

  if (day.miles > 15) {
    parts.push(`long day at ${day.miles} miles`);
  } else if (day.miles < 6) {
    parts.push("short, recovery-pace day");
  }

  if (day.maxWaterGap > 5) {
    parts.push(`water carry — longest gap ${day.maxWaterGap}mi`);
  }

  if (day.camp.water === "none") {
    parts.push("dry camp tonight");
  }

  if (day.waypoints && day.waypoints.length > 0) {
    const highlights = day.waypoints.slice(0, 2).map(wp => wp.name).join(", ");
    parts.push(`highlights: ${highlights}`);
  }

  if (day.estimatedHours > 8) {
    parts.push("full day of hiking");
  }

  return parts.join(" · ");
}

function getDayDifficulty(miles, elevGain) {
  const score = (miles * 2) + (elevGain / 500);
  if (score > 40) return "strenuous";
  if (score > 28) return "hard";
  if (score > 16) return "moderate";
  return "easy";
}

function getDifficultyColor(miles, elevGain) {
  const difficulty = getDayDifficulty(miles, elevGain);
  if (difficulty === "strenuous") return "bg-red-500";
  if (difficulty === "hard") return "bg-orange-500";
  if (difficulty === "moderate") return "bg-yellow-500";
  return "bg-green-500";
}

// ─────────────────────────────────────────────
// ROUTE MAP COMPONENT (Leaflet)
// ─────────────────────────────────────────────
function RouteMap({ plan, expandedDay, onSelectDay }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const layersRef = useRef(null);

  // Build map data from plan
  const mapData = useMemo(() => {
    if (!plan || !plan.itinerary.length) return null;

    const isLoopRoute = plan.itinerary[0]?.isLoop;

    // For loop routes, get coords from LOOP_TRAILS legs
    let loopCoords = null;
    if (isLoopRoute) {
      // Find the matching loop trail to get leg coordinates
      const matchLoop = LOOP_TRAILS.find(l => l.name === plan.itinerary[0]?.camp?.name?.replace(" (return)", "") || plan.totalMiles === l.totalMiles);
      if (matchLoop && matchLoop.legs) {
        loopCoords = matchLoop.legs.flatMap(leg => leg.coords);
      }
    }

    // Coord resolver: for loops use interpolation along loopCoords, for P2P use AT miles
    function getCoord(mile, totalMiles) {
      if (loopCoords && loopCoords.length > 1 && totalMiles > 0) {
        const frac = Math.min(1, Math.max(0, mile / totalMiles));
        const idx = frac * (loopCoords.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.min(lo + 1, loopCoords.length - 1);
        const t = idx - lo;
        return [
          loopCoords[lo][0] + t * (loopCoords[hi][0] - loopCoords[lo][0]),
          loopCoords[lo][1] + t * (loopCoords[hi][1] - loopCoords[lo][1]),
        ];
      }
      return getCoordForMile(mile);
    }

    const totalLoopMiles = plan.totalMiles;

    // Route polyline
    const routePoints = [];
    for (const day of plan.itinerary) {
      const startMi = Math.min(day.startMile, day.endMile);
      const endMi = Math.max(day.startMile, day.endMile);
      for (let m = startMi; m <= endMi; m += 0.5) {
        routePoints.push(isLoopRoute ? getCoord(m, totalLoopMiles) : getCoordForMile(m));
      }
      routePoints.push(isLoopRoute ? getCoord(endMi, totalLoopMiles) : getCoordForMile(endMi));
    }

    // Day segments for coloring
    const daySegments = plan.itinerary.map(day => {
      const pts = [];
      const startMi = Math.min(day.startMile, day.endMile);
      const endMi = Math.max(day.startMile, day.endMile);
      for (let m = startMi; m <= endMi; m += 0.3) {
        pts.push(isLoopRoute ? getCoord(m, totalLoopMiles) : getCoordForMile(m));
      }
      pts.push(isLoopRoute ? getCoord(endMi, totalLoopMiles) : getCoordForMile(endMi));
      return { day: day.day, points: pts };
    });

    // Camp markers
    const camps = plan.itinerary.map(day => ({
      coord: isLoopRoute ? getCoord(day.endMile, totalLoopMiles) : getCoordForMile(day.endMile),
      name: day.camp.name,
      day: day.day,
      miles: day.miles,
      elev: day.camp.elev,
      type: day.camp.type,
      water: day.camp.water,
    }));

    // Water source markers (from all days)
    const waters = [];
    const seenWater = new Set();
    for (const day of plan.itinerary) {
      for (const w of (day.water || [])) {
        if (!seenWater.has(w.mile)) {
          seenWater.add(w.mile);
          waters.push({ coord: isLoopRoute ? getCoord(w.mile, totalLoopMiles) : getCoordForMile(w.mile), name: w.name, type: w.type, reliability: w.reliability });
        }
      }
    }

    // Waypoint markers
    const waypoints = [];
    const seenWp = new Set();
    for (const day of plan.itinerary) {
      for (const wp of (day.waypoints || [])) {
        if (!seenWp.has(wp.mile)) {
          seenWp.add(wp.mile);
          waypoints.push({ coord: isLoopRoute ? getCoord(wp.mile, totalLoopMiles) : getCoordForMile(wp.mile), name: wp.name, type: wp.type, notes: wp.notes, elev: wp.elev });
        }
      }
    }

    // Start marker
    const startCoord = isLoopRoute ? getCoord(0, totalLoopMiles) : getCoordForMile(plan.itinerary[0].startMile);

    return { routePoints, daySegments, camps, waters, waypoints, startCoord };
  }, [plan]);

  // Initialize / update Leaflet map
  const initAttempted = useRef(false);

  const buildMap = useCallback(() => {
    if (!mapRef.current || !mapData || !window.L) return;

    // Create map if needed
    if (!mapInstance.current) {
      const map = window.L.map(mapRef.current, {
        scrollWheelZoom: true,
        zoomControl: true,
      });
      window.L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map: OpenTopoMap (CC-BY-SA)',
      }).addTo(map);
      mapInstance.current = map;
    }

    const map = mapInstance.current;

    // Clear old layers
    if (layersRef.current) {
      layersRef.current.forEach(l => map.removeLayer(l));
    }
    layersRef.current = [];

    const L = window.L;

    // Day colors
    const dayColors = ['#059669','#2563eb','#d97706','#dc2626','#7c3aed','#0891b2','#be185d','#65a30d','#ea580c','#4f46e5','#b91c1c','#0d9488','#c026d3','#ca8a04'];

    // Draw day segments
    mapData.daySegments.forEach((seg, i) => {
      const color = dayColors[i % dayColors.length];
      const line = L.polyline(seg.points, {
        color: expandedDay === i ? color : color,
        weight: expandedDay === i ? 5 : 3,
        opacity: expandedDay === i ? 1 : 0.6,
      }).addTo(map);
      line.bindTooltip(`Day ${seg.day}`, { sticky: true, className: 'leaflet-tooltip-day' });
      line.on('click', () => onSelectDay(i));
      layersRef.current.push(line);
    });

    // Camp markers
    mapData.camps.forEach((c, i) => {
      const isActive = expandedDay === i;
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:${isActive ? 28 : 22}px; height:${isActive ? 28 : 22}px;
          background:${c.type === 'shelter' ? '#059669' : c.type === 'designated' ? '#2563eb' : '#d97706'};
          border:2px solid white; border-radius:50%; box-shadow:0 2px 6px rgba(0,0,0,0.3);
          display:flex; align-items:center; justify-content:center;
          color:white; font-size:${isActive ? 12 : 10}px; font-weight:bold;
          ${isActive ? 'z-index:1000;' : ''}
        ">${c.day}</div>`,
        iconSize: [isActive ? 28 : 22, isActive ? 28 : 22],
        iconAnchor: [isActive ? 14 : 11, isActive ? 14 : 11],
      });
      const marker = L.marker(c.coord, { icon }).addTo(map);
      const waterStatus = c.water === 'at_site' ? 'Water at site' : c.water === 'nearby' ? 'Water nearby' : 'No water';
      marker.bindPopup(`
        <div style="font-family:system-ui;min-width:160px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px;">Day ${c.day}: ${c.name}</div>
          <div style="font-size:11px;color:#666;">
            ${c.type} &middot; ${c.miles} mi &middot; ${c.elev ? c.elev.toLocaleString() + ' ft' : ''}<br/>
            ${waterStatus}
          </div>
        </div>
      `);
      marker.on('click', () => onSelectDay(i));
      layersRef.current.push(marker);
    });

    // Start marker
    const startIcon = L.divIcon({
      className: '',
      html: `<div style="width:24px;height:24px;background:#111;border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;">S</div>`,
      iconSize: [24, 24], iconAnchor: [12, 12],
    });
    const startMarker = L.marker(mapData.startCoord, { icon: startIcon }).addTo(map);
    startMarker.bindPopup('<b>Start</b>');
    layersRef.current.push(startMarker);

    // Water sources (small blue dots)
    mapData.waters.forEach(w => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:10px;height:10px;background:#3b82f6;border:1.5px solid white;border-radius:50;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>`,
        iconSize: [10, 10], iconAnchor: [5, 5],
      });
      const m = L.marker(w.coord, { icon, zIndexOffset: -100 }).addTo(map);
      m.bindTooltip(`💧 ${w.name} (${w.reliability})`, { direction: 'top', offset: [0, -6] });
      layersRef.current.push(m);
    });

    // Waypoint markers (stars)
    mapData.waypoints.forEach(wp => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;background:#fbbf24;border:1.5px solid white;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:10px;">★</div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      });
      const m = L.marker(wp.coord, { icon }).addTo(map);
      m.bindPopup(`
        <div style="font-family:system-ui;min-width:140px;">
          <div style="font-weight:700;font-size:12px;">★ ${wp.name}</div>
          ${wp.elev ? `<div style="font-size:11px;color:#666;">${wp.elev.toLocaleString()} ft</div>` : ''}
          ${wp.notes ? `<div style="font-size:11px;color:#666;margin-top:2px;">${wp.notes}</div>` : ''}
        </div>
      `);
      layersRef.current.push(m);
    });

    // Fit bounds
    if (mapData.routePoints.length > 1) {
      map.fitBounds(L.latLngBounds(mapData.routePoints), { padding: [30, 30] });
    }

    // Invalidate size (handles container resize)
    setTimeout(() => map.invalidateSize(), 100);
  }, [mapData, expandedDay, onSelectDay]);

  // Effect: wait for Leaflet to load, then build
  const checkInterval = useRef(null);
  useEffect(() => {
    // Inject Leaflet CSS + JS if not present
    if (!document.querySelector('link[href*="leaflet"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(css);
    }
    if (!document.querySelector('script[src*="leaflet"]')) {
      const js = document.createElement('script');
      js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      document.head.appendChild(js);
    }
  }, []);

  // Poll for Leaflet readiness, then build
  useEffect(() => {
    checkInterval.current = setInterval(() => {
      if (window.L && mapRef.current && mapData) {
        clearInterval(checkInterval.current);
        buildMap();
      }
    }, 200);
    return () => clearInterval(checkInterval.current);
  }, [mapData]);

  // Rebuild when expandedDay or mapData changes (after Leaflet is loaded)
  const prevExpanded = useRef(expandedDay);
  const prevMapData = useRef(mapData);
  if ((expandedDay !== prevExpanded.current || mapData !== prevMapData.current) && window.L && mapRef.current) {
    prevExpanded.current = expandedDay;
    prevMapData.current = mapData;
    // Defer to avoid render-phase side effects
    setTimeout(() => buildMap(), 0);
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-4">
      <div ref={mapRef} style={{ height: 380, width: '100%', background: '#e8e4df' }} />
      <div className="px-4 py-2 flex flex-wrap gap-3 text-xs text-stone-500 border-t border-stone-100 bg-stone-50">
        <span className="flex items-center gap-1"><span style={{width:10,height:10,borderRadius:'50%',background:'#059669',display:'inline-block'}}></span> Shelter</span>
        <span className="flex items-center gap-1"><span style={{width:10,height:10,borderRadius:'50%',background:'#2563eb',display:'inline-block'}}></span> Designated</span>
        <span className="flex items-center gap-1"><span style={{width:10,height:10,borderRadius:'50%',background:'#d97706',display:'inline-block'}}></span> Dispersed</span>
        <span className="flex items-center gap-1"><span style={{width:10,height:10,borderRadius:'50%',background:'#3b82f6',display:'inline-block'}}></span> Water</span>
        <span className="flex items-center gap-1"><span style={{width:14,height:14,borderRadius:2,background:'#fbbf24',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:8}}>★</span> Highlight</span>
        <span className="flex items-center gap-1"><span style={{width:10,height:10,borderRadius:'50%',background:'#111',display:'inline-block'}}></span> Start</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// GPX EXPORT
// ─────────────────────────────────────────────
function generateGPX(plan) {
  const wpts = plan.itinerary.map((day, i) => {
    const camp = day.camp;
    // Approximate coords from section data
    let lat = 34.6 + day.endMile * 0.003;
    let lng = -84.2 + day.endMile * 0.003;
    for (const sec of TRAIL_DATA) {
      if (day.endMile >= sec.startMile && day.endMile <= sec.endMile) {
        const frac = (day.endMile - sec.startMile) / (sec.endMile - sec.startMile);
        lat = sec.startCoord[0] + frac * (sec.endCoord[0] - sec.startCoord[0]);
        lng = sec.startCoord[1] + frac * (sec.endCoord[1] - sec.startCoord[1]);
        break;
      }
    }
    return `  <wpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">
    <name>Day ${day.day} Camp: ${camp.name}</name>
    <desc>${camp.type} | ${day.miles}mi | ${day.elevGain}ft gain | ~${day.estimatedHours}hrs</desc>
    <sym>Campground</sym>
  </wpt>`;
  }).join("\n");

  // Track points
  const trkpts = [];
  for (const day of plan.itinerary) {
    const steps = Math.max(3, Math.ceil(day.miles));
    for (let i = 0; i <= steps; i++) {
      const mile = day.startMile + (day.endMile - day.startMile) * (i / steps);
      let lat = 34.6 + mile * 0.003;
      let lng = -84.2 + mile * 0.003;
      let ele = 3000;
      for (const sec of TRAIL_DATA) {
        if (mile >= sec.startMile && mile <= sec.endMile) {
          const frac = (mile - sec.startMile) / (sec.endMile - sec.startMile);
          lat = sec.startCoord[0] + frac * (sec.endCoord[0] - sec.startCoord[0]);
          lng = sec.startCoord[1] + frac * (sec.endCoord[1] - sec.startCoord[1]);
          // Get elevation from profile
          const prof = sec.elevationProfile;
          for (let j = 0; j < prof.length - 1; j++) {
            if (mile >= prof[j][0] && mile <= prof[j + 1][0]) {
              const f2 = (mile - prof[j][0]) / (prof[j + 1][0] - prof[j][0]);
              ele = prof[j][1] + f2 * (prof[j + 1][1] - prof[j][1]);
              break;
            }
          }
          break;
        }
      }
      // Add slight randomization for realistic GPS track
      lat += (Math.random() - 0.5) * 0.001;
      lng += (Math.random() - 0.5) * 0.001;
      trkpts.push(`      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"><ele>${Math.round(ele * 0.3048)}</ele></trkpt>`);
    }
  }

  const firstName = plan.itinerary[0]?.camp.name || "Start";
  const lastName = plan.itinerary[plan.itinerary.length - 1]?.camp.name || "End";

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PackPath v2 - Campsite-Driven Backpacking Planner"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>PackPath: ${firstName} to ${lastName}</name>
    <desc>${plan.totalMiles} miles over ${plan.itinerary.length} days. Generated by PackPath.</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
${wpts}
  <trk>
    <name>PackPath Route</name>
    <trkseg>
${trkpts.join("\n")}
    </trkseg>
  </trk>
</gpx>`;
}

// ─────────────────────────────────────────────
// UI — MAIN APP
// ─────────────────────────────────────────────
const REGIONS = [
  { value: "any", label: "Anywhere (GA → VA)" },
  { value: "Georgia", label: "Georgia" },
  { value: "North Carolina", label: "North Carolina" },
  { value: "Nantahala", label: "Nantahala / NOC" },
  { value: "Smoky", label: "Great Smoky Mountains" },
  { value: "Highlands", label: "NC Highlands / Max Patch" },
  { value: "Tennessee", label: "Tennessee / Roan" },
  { value: "Southwest", label: "Virginia (Southwest / Grayson)" },
  { value: "Central", label: "Virginia (Central / Triple Crown)" },
  { value: "Shenandoah", label: "Shenandoah National Park" },
];

const SCENERY_OPTS = [
  { value: "mountain", label: "Mountain Views", icon: "⛰️" },
  { value: "forest", label: "Deep Forest", icon: "🌲" },
  { value: "meadow", label: "Open Meadows / Balds", icon: "🌾" },
  { value: "waterfall", label: "Waterfalls", icon: "💧" },
  { value: "lake", label: "Lakes", icon: "🏞️" },
];

export default function PackPathApp() {
  const [view, setView] = useState("form"); // form | results
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [expandedDay, setExpandedDay] = useState(0);
  const [exportToast, setExportToast] = useState(false);
  const [gpxData, setGpxData] = useState(null);

  // Form state
  const [startRegion, setStartRegion] = useState("any");
  const [days, setDays] = useState(3);
  const [experience, setExperience] = useState("intermediate");
  const [packWeight, setPackWeight] = useState("standard");
  const [minDailyMiles, setMinDailyMiles] = useState(5);
  const [maxDailyMiles, setMaxDailyMiles] = useState(14);
  const [maxDailyElevGain, setMaxDailyElevGain] = useState(3000);
  const [waterComfort, setWaterComfort] = useState("moderate");
  const [campingStyle, setCampingStyle] = useState("any");
  const [sceneryPref, setSceneryPref] = useState([]);
  const [routeType, setRouteType] = useState("either");

  const toggleScenery = (v) => setSceneryPref(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  // Auto-adjust daily miles with experience
  const handleExperience = (val) => {
    setExperience(val);
    if (val === "beginner") { setMinDailyMiles(4); setMaxDailyMiles(10); setMaxDailyElevGain(1500); }
    if (val === "intermediate") { setMinDailyMiles(5); setMaxDailyMiles(14); setMaxDailyElevGain(3000); }
    if (val === "experienced") { setMinDailyMiles(8); setMaxDailyMiles(18); setMaxDailyElevGain(4000); }
    if (val === "fast") { setMinDailyMiles(10); setMaxDailyMiles(25); setMaxDailyElevGain(5000); }
  };

  const handlePlan = () => {
    const prefs = {
      startRegion, days, experience, packWeight,
      minDailyMiles, maxDailyMiles, maxDailyElevGain,
      waterComfort, campingStyle, sceneryPref, routeType,
    };
    const results = suggestRoutes(prefs);
    setRoutes(results);
    setSelectedRoute(0);
    setExpandedDay(0);
    setView("results");
  };

  const handleExport = (plan) => {
    try {
      const gpx = generateGPX(plan);
      const filename = `packpath-${plan.itinerary.length}day-${plan.totalMiles}mi.gpx`;
      // Use data URI approach — works in sandboxed iframes
      const dataUri = "data:application/gpx+xml;charset=utf-8," + encodeURIComponent(gpx);
      setGpxData({ uri: dataUri, filename, content: gpx });
      setExportToast(true);
      setTimeout(() => setExportToast(false), 8000);
    } catch (e) {
      console.error("GPX export error:", e);
    }
  };

  const pace = getPaceForProfile(experience, packWeight);

  // ── FORM ──
  if (view === "form") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-stone-100 to-emerald-50">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <div className="text-4xl mb-2">🥾</div>
            <h1 className="text-3xl font-black text-stone-900 tracking-tight">PackPath</h1>
            <p className="text-stone-500 mt-1">Campsite-Driven Backpacking Route Planner</p>
            <p className="text-xs text-stone-400 mt-0.5">Appalachian Trail · Georgia → Virginia · {allCamps.length} campsites · {allWater.length} water sources</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 divide-y divide-stone-100">

            {/* Section 1: Where & When */}
            <div className="p-5">
              <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">Where & How Long</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1">Starting Region</label>
                  <select value={startRegion} onChange={e => setStartRegion(e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-700 bg-white">
                    {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1">Trip Length</label>
                  <input type="range" min="1" max="14" value={days} onChange={e => setDays(Number(e.target.value))}
                    className="w-full accent-emerald-600" />
                  <div className="text-center text-lg font-bold text-emerald-700">{days} day{days > 1 ? "s" : ""} / {days - 1} night{days > 2 ? "s" : ""}</div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-2">Route Shape</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: "any", l: "Any Shape", d: "Show all options", icon: "◇" },
                      { v: "loop", l: "Loop", d: "End where you started", icon: "○" },
                      { v: "lollipop", l: "Lollipop", d: "Stem out, loop, stem back", icon: "◎" },
                      { v: "p2p", l: "Point-to-Point", d: "A to B (need shuttle)", icon: "→" },
                    ].map(o => (
                      <button key={o.v} onClick={() => setRouteType(o.v)}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border text-left transition-all ${
                          routeType === o.v ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-stone-600 border-stone-300 hover:border-emerald-400"}`}>
                        <div className="flex items-center gap-1.5"><span className="text-base">{o.icon}</span> {o.l}</div>
                        <div className={`mt-0.5 ${routeType === o.v ? "text-emerald-100" : "text-stone-400"}`}>{o.d}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Hiker Profile */}
            <div className="p-5">
              <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">Hiker Profile</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-2">Experience</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { v: "beginner", l: "Beginner", d: "4–10 mi/day" },
                      { v: "intermediate", l: "Moderate", d: "5–14 mi/day" },
                      { v: "experienced", l: "Strong", d: "8–18 mi/day" },
                      { v: "fast", l: "Fast", d: "10–25 mi/day" },
                    ].map(o => (
                      <button key={o.v} onClick={() => handleExperience(o.v)}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-all ${
                          experience === o.v ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-stone-600 border-stone-300 hover:border-emerald-400"}`}>
                        <div>{o.l}</div>
                        <div className={`mt-0.5 ${experience === o.v ? "text-emerald-100" : "text-stone-400"}`}>{o.d}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-2">Pack Weight</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: "ultralight", l: "Ultralight", d: "< 15 lbs" },
                      { v: "standard", l: "Standard", d: "15–30 lbs" },
                      { v: "heavy", l: "Heavy", d: "30+ lbs" },
                    ].map(o => (
                      <button key={o.v} onClick={() => setPackWeight(o.v)}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-all ${
                          packWeight === o.v ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-stone-600 border-stone-300 hover:border-emerald-400"}`}>
                        <div>{o.l}</div>
                        <div className={`mt-0.5 ${packWeight === o.v ? "text-emerald-100" : "text-stone-400"}`}>{o.d}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-stone-50 rounded-lg p-3 text-xs text-stone-500">
                  Your estimated flat pace: <span className="font-bold text-stone-700">{pace.toFixed(1)} mph</span> · With 2,000 ft gain, an 8-mile day ≈ <span className="font-bold text-stone-700">{estimateHikingTime(8, 2000, pace).toFixed(1)} hours</span>
                </div>
              </div>
            </div>

            {/* Section 3: Daily Limits (fine-tuning) */}
            <div className="p-5">
              <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">Daily Limits <span className="font-normal text-stone-400">(fine-tune)</span></h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Min mi/day</label>
                  <input type="number" min="2" max="20" value={minDailyMiles} onChange={e => setMinDailyMiles(Number(e.target.value))}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-center" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Max mi/day</label>
                  <input type="number" min="5" max="30" value={maxDailyMiles} onChange={e => setMaxDailyMiles(Number(e.target.value))}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-center" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Max ft gain/day</label>
                  <input type="number" min="500" max="6000" step="500" value={maxDailyElevGain} onChange={e => setMaxDailyElevGain(Number(e.target.value))}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-center" />
                </div>
              </div>
            </div>

            {/* Section 4: Camping & Water */}
            <div className="p-5">
              <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">Camp & Water</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-2">Where I'll Sleep</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: "any", l: "Anywhere", d: "Shelters, sites, or dispersed" },
                      { v: "established", l: "Established Only", d: "Shelters + designated sites" },
                      { v: "shelter", l: "Shelters Only", d: "Three-sided shelters" },
                      { v: "dispersed", l: "Dispersed OK", d: "I'll find a flat spot" },
                    ].map(o => (
                      <button key={o.v} onClick={() => setCampingStyle(o.v)}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border text-left transition-all ${
                          campingStyle === o.v ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-stone-600 border-stone-300 hover:border-emerald-400"}`}>
                        <div>{o.l}</div>
                        <div className={`mt-0.5 ${campingStyle === o.v ? "text-emerald-100" : "text-stone-400"}`}>{o.d}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-2">Water Comfort</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: "easy", l: "Water at Camp", d: "Won't camp dry" },
                      { v: "moderate", l: "Short Carries OK", d: "< 0.5 mi to water" },
                      { v: "any", l: "I Can Carry", d: "Comfortable with gaps" },
                    ].map(o => (
                      <button key={o.v} onClick={() => setWaterComfort(o.v)}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-all ${
                          waterComfort === o.v ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-stone-600 border-stone-300 hover:border-emerald-400"}`}>
                        <div>{o.l}</div>
                        <div className={`mt-0.5 ${waterComfort === o.v ? "text-emerald-100" : "text-stone-400"}`}>{o.d}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 5: Scenery */}
            <div className="p-5">
              <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">What I Want to See <span className="font-normal">(optional)</span></h2>
              <div className="flex flex-wrap gap-2">
                {SCENERY_OPTS.map(s => (
                  <button key={s.value} onClick={() => toggleScenery(s.value)}
                    className={`py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${
                      sceneryPref.includes(s.value) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-stone-600 border-stone-300 hover:border-emerald-400"}`}>
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="p-5">
              <button onClick={handlePlan}
                className="w-full py-3.5 bg-emerald-600 text-white rounded-xl text-lg font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200">
                Plan My Trip →
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-stone-400 mt-4">
            PackPath v2 · {allCamps.length} campsites · {allWater.length} water sources · {TRAIL_DATA.length} trail sections
          </p>
        </div>
      </div>
    );
  }

  // ── RESULTS ──
  const currentRoute = routes[selectedRoute];
  const plan = currentRoute?.plan;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-100 to-emerald-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => setView("form")} className="text-emerald-600 text-sm font-semibold hover:underline mb-1">← Adjust Trip</button>
            <h1 className="text-2xl font-black text-stone-900">Your Trip Plan</h1>
          </div>
          <div className="text-3xl">🥾</div>
        </div>

        {routes.length === 0 ? (
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🤔</div>
              <div>
                <h3 className="text-lg font-bold text-stone-800 mb-1">No routes found</h3>
                <p className="text-sm text-stone-600 mb-3">The combination of region, camping style, and daily limits didn't produce any viable itineraries. Here's what to try:</p>
                <div className="space-y-1 text-sm text-stone-600">
                  <p>• Expand your region to "Anywhere"</p>
                  <p>• Switch camping style to "Anywhere" to include dispersed sites</p>
                  <p>• Increase your max daily miles</p>
                  <p>• Add a day to your trip</p>
                </div>
                <button onClick={() => setView("form")} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700">
                  Adjust Preferences
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Route Tabs */}
            {routes.length > 1 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {routes.map((r, i) => (
                  <button key={i} onClick={() => { setSelectedRoute(i); setExpandedDay(0); }}
                    className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                      selectedRoute === i ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-stone-600 border-stone-300 hover:border-emerald-400"}`}>
                    <div>Option {i + 1}</div>
                    <div className={`text-xs ${selectedRoute === i ? "text-emerald-100" : "text-stone-400"}`}>
                      {r.plan.routeType === "loop" ? "○ " : r.plan.routeType === "lollipop" ? "◎ " : ""}{r.plan.totalMiles}mi · {r.plan.itinerary.length}d
                    </div>
                  </button>
                ))}
              </div>
            )}

            {plan && (
              <>
                {/* Route Overview Card */}
                <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-stone-900">{currentRoute.sectionName}</h2>
                      <p className="text-sm text-stone-500">From {currentRoute.startTrailhead.name}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-emerald-600">{plan.routeScore}<span className="text-sm text-stone-400">/100</span></div>
                      <div className="text-xs text-stone-400">fit score</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3 text-sm">
                    <span className={`rounded-full px-3 py-1 font-medium ${
                      plan.routeType === "loop" ? "bg-violet-100 text-violet-700" :
                      plan.routeType === "lollipop" ? "bg-pink-100 text-pink-700" :
                      "bg-stone-100 text-stone-600"
                    }`}>
                      {plan.routeType === "loop" ? "○ Loop" : plan.routeType === "lollipop" ? "◎ Lollipop" : "→ Point-to-Point"}
                    </span>
                    <span className="bg-stone-100 rounded-full px-3 py-1 text-stone-600 font-medium">{plan.totalMiles} miles</span>
                    <span className="bg-stone-100 rounded-full px-3 py-1 text-stone-600 font-medium">{plan.itinerary.length} days</span>
                    <span className="bg-stone-100 rounded-full px-3 py-1 text-stone-600 font-medium">{plan.totalElevGain.toLocaleString()} ft gain</span>
                    {plan.sceneryTypes.map(s => (
                      <span key={s} className="bg-emerald-50 text-emerald-700 rounded-full px-3 py-1 font-medium capitalize">{s}</span>
                    ))}
                  </div>

                  {/* Warnings */}
                  {plan.warnings.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {plan.warnings.map((w, i) => (
                        <div key={i} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                          {w}
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={() => handleExport(plan)}
                    className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-2">
                    <span>↓</span> Export GPX
                  </button>
                </div>


                {/* Trip Summary Card */}
                {plan && plan.itinerary.length > 0 && (() => {
                  const avgMilesPerDay = (plan.totalMiles / plan.itinerary.length).toFixed(1);
                  const hardestDay = plan.itinerary.reduce((a, b) => 
                    getDayDifficulty(b.miles, b.elevGain) === "strenuous" || getDayDifficulty(a.miles, a.elevGain) === "strenuous" ? (getDayDifficulty(b.miles, b.elevGain) === "strenuous" ? b : a) :
                    (b.miles + (b.elevGain / 500)) > (a.miles + (a.elevGain / 500)) ? b : a
                  );
                  const easiestDay = plan.itinerary.reduce((a, b) => 
                    getDayDifficulty(b.miles, b.elevGain) === "easy" || getDayDifficulty(a.miles, a.elevGain) === "easy" ? (getDayDifficulty(b.miles, b.elevGain) === "easy" ? b : a) :
                    (b.miles + (b.elevGain / 500)) < (a.miles + (a.elevGain / 500)) ? b : a
                  );
                  const maxWaterGap = Math.max(...plan.itinerary.map(d => d.maxWaterGap || 0), 0);
                  const totalHours = plan.itinerary.reduce((sum, d) => sum + d.estimatedHours, 0);

                  return (
                    <div className="bg-gradient-to-r from-stone-50 to-emerald-50 rounded-xl border border-stone-200 p-4 mb-4">
                      <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-3">Trip Summary</h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-emerald-600">{avgMilesPerDay}</div>
                          <div className="text-xs text-stone-500 mt-1">mi/day avg</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <div className={`w-2 h-2 rounded-full ${getDifficultyColor(hardestDay.miles, hardestDay.elevGain)}`}></div>
                            <div className="text-sm font-bold text-stone-700">Day {hardestDay.day}</div>
                          </div>
                          <div className="text-xs text-stone-500">hardest day</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <div className={`w-2 h-2 rounded-full ${getDifficultyColor(easiestDay.miles, easiestDay.elevGain)}`}></div>
                            <div className="text-sm font-bold text-stone-700">Day {easiestDay.day}</div>
                          </div>
                          <div className="text-xs text-stone-500">easiest day</div>
                        </div>
                        {maxWaterGap > 4 && (
                          <div className="text-center">
                            <div className="text-2xl font-bold text-amber-600">{maxWaterGap}</div>
                            <div className="text-xs text-stone-500 mt-1">mi water carry</div>
                          </div>
                        )}
                        <div className="text-center">
                          <div className="text-2xl font-bold text-stone-700">{totalHours.toFixed(0)}</div>
                          <div className="text-xs text-stone-500 mt-1">hrs total</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Route Map */}
                <RouteMap plan={plan} expandedDay={expandedDay} onSelectDay={setExpandedDay} />

                {/* Day-by-Day Itinerary */}
                <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-3">Day-by-Day Itinerary</h3>
                <div className="space-y-2">
                  {plan.itinerary.map((day, i) => {
                    const isExpanded = expandedDay === i;
                    return (
                      <div key={i} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                        <button onClick={() => setExpandedDay(isExpanded ? -1 : i)} className="w-full text-left p-4 hover:bg-stone-50 transition-colors">
                          {/* Day card collapsed header - redesigned */}
                          <div className="space-y-2">
                            {/* Top row: Day # and Camp Name */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-2.5 h-2.5 rounded-full ${getDifficultyColor(day.miles, day.elevGain)}`}></div>
                                <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Day {day.day}</span>
                              </div>
                              <span className="text-stone-400 text-sm">{isExpanded ? "▾" : "▸"}</span>
                            </div>

                            {/* Camp name */}
                            <div className="font-bold text-stone-800 text-sm">→ {day.camp.name}</div>

                            {/* Stats row: Miles, Elevation, Hours in a structured layout */}
                            <div className="flex flex-wrap items-center gap-6 text-xs text-stone-600">
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-stone-700">{day.miles}</span>
                                <span className="text-stone-500">mi</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-stone-500">↑</span>
                                <span className="font-semibold text-stone-700">{day.elevGain.toLocaleString()}</span>
                                <span className="text-stone-500">ft</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-stone-500">~</span>
                                <span className="font-semibold text-stone-700">{day.estimatedHours}</span>
                                <span className="text-stone-500">hrs</span>
                              </div>
                            </div>

                            {/* Water status and camp type badges */}
                            <div className="flex flex-wrap items-center gap-2">
                              {day.camp.water === "at_site" && <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">💧 Water</span>}
                              {day.camp.water === "nearby" && <span className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-full">💧 Water nearby</span>}
                              {day.camp.water === "none" && <span className="bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded-full">⚠ No water</span>}
                              {day.camp.type === "shelter" && <span className="bg-stone-100 text-stone-600 text-xs px-2 py-0.5 rounded-full">🏠 Shelter</span>}
                              {day.camp.type === "designated" && <span className="bg-stone-100 text-stone-600 text-xs px-2 py-0.5 rounded-full">⛺ Designated</span>}
                              {day.camp.type === "dispersed" && <span className="bg-stone-100 text-stone-600 text-xs px-2 py-0.5 rounded-full">🏕️ Dispersed</span>}
                            </div>

                            {/* What to expect summary - one line */}
                            <div className="text-xs text-stone-600 italic pt-1 border-t border-stone-100">
                              {getDayDescription(day)}
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-stone-100 p-4 bg-stone-50 space-y-4">
                            {/* Day Summary */}
                            <div className="bg-white rounded-lg border border-stone-200 p-3">
                              <div className="text-xs text-stone-700 leading-relaxed">
                                <strong>This is a {getDayDifficulty(day.miles, day.elevGain)} day</strong> with {day.miles} miles and {day.elevGain.toLocaleString()} feet of climbing. Expect about {day.estimatedHours} hours of hiking. {getDayDescription(day).split(' · ').pop()}
                              </div>
                            </div>

                            {/* Camp Details */}
                            <div>
                              <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">Tonight's Camp</h4>
                              <div className="bg-white rounded-lg border border-stone-200 p-3">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <div className="font-bold text-stone-800">{day.camp.name}</div>
                                    <div className="text-xs text-stone-500 mt-0.5">
                                      Mile {day.endMile} · {day.camp.type === "shelter" ? "Shelter" : day.camp.type === "designated" ? "Designated Site" : "Dispersed"} · Elev {day.camp.elev?.toLocaleString() || "~"} ft
                                      {day.camp.capacity && ` · Capacity ~${day.camp.capacity}`}
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    {day.camp.water === "at_site" && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">Water at site</span>}
                                    {day.camp.water === "nearby" && <span className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-full font-medium">Water {day.camp.waterDist}mi</span>}
                                    {day.camp.water === "none" && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">No water</span>}
                                  </div>
                                </div>
                                {day.camp.notes && <p className="text-xs text-stone-600 mt-2">{day.camp.notes}</p>}
                                {day.camp.features && day.camp.features.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {day.camp.features.map(f => (
                                      <span key={f} className="bg-stone-100 text-stone-600 text-xs px-2 py-0.5 rounded-full">{f}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Alternate Camps */}
                            {day.altCamps && day.altCamps.length > 0 && (
                              <div>
                                <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">Alternate Camps (if you need to adjust)</h4>
                                <div className="space-y-1">
                                  {day.altCamps.map(ac => (
                                    <div key={ac.mile} className="bg-white rounded-lg border border-stone-200 p-2 flex items-center justify-between">
                                      <div>
                                        <span className="text-xs font-semibold text-stone-700">{ac.name}</span>
                                        <span className="text-xs text-stone-400 ml-2">mi {ac.mile} · {ac.dist} mi from start · {ac.type}</span>
                                      </div>
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${ac.water === "at_site" ? "bg-blue-100 text-blue-700" : ac.water === "none" ? "bg-red-100 text-red-600" : "bg-blue-50 text-blue-600"}`}>
                                        {ac.water === "at_site" ? "💧" : ac.water === "none" ? "🚫💧" : "💧 nearby"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Water Sources */}
                            {day.water && day.water.length > 0 && (
                              <div>
                                <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">Water Sources En Route</h4>
                                <div className="flex flex-wrap gap-1.5">
                                  {day.water.map((w, wi) => (
                                    <span key={wi} className={`text-xs px-2 py-1 rounded-full border ${
                                      w.reliability === "reliable" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-amber-50 border-amber-200 text-amber-700"
                                    }`}>
                                      💧 {w.name} <span className="opacity-60">mi {w.mile}</span> {w.reliability === "seasonal" && "(seasonal)"}
                                    </span>
                                  ))}
                                </div>
                                {day.maxWaterGap > 4 && (
                                  <p className="text-xs text-amber-600 mt-1">⚠ Longest gap between water: {day.maxWaterGap} mi — carry extra</p>
                                )}
                              </div>
                            )}

                            {/* Waypoints */}
                            {day.waypoints && day.waypoints.length > 0 && (
                              <div>
                                <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">Highlights</h4>
                                <div className="space-y-1">
                                  {day.waypoints.map((wp, wi) => (
                                    <div key={wi} className="flex items-start gap-2 text-xs">
                                      <span className="text-emerald-600 font-medium">mi {wp.mile}</span>
                                      <span className="font-semibold text-stone-800">{wp.name}</span>
                                      {wp.notes && <span className="text-stone-500">— {wp.notes}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* GPX Export Panel */}
        {exportToast && gpxData && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-80 bg-white border border-stone-200 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="bg-emerald-600 px-4 py-2 flex items-center justify-between">
              <span className="text-white text-sm font-bold">GPX Ready</span>
              <button onClick={() => { setExportToast(false); setGpxData(null); }} className="text-emerald-200 hover:text-white text-lg leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-3">
              <a href={gpxData.uri} download={gpxData.filename}
                className="block w-full text-center py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors">
                Download {gpxData.filename}
              </a>
              <details className="text-xs">
                <summary className="text-stone-500 cursor-pointer hover:text-stone-700">Or copy GPX text</summary>
                <textarea readOnly value={gpxData.content} rows={6}
                  className="w-full mt-2 text-xs font-mono bg-stone-50 border border-stone-200 rounded p-2 text-stone-600"
                  onFocus={e => e.target.select()} />
              </details>
              <p className="text-xs text-stone-400">Open in Gaia GPS, AllTrails, CalTopo, or any GPX-compatible app.</p>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-stone-400 mt-6">
          PackPath v2 · Campsite-driven itinerary planning · {allCamps.length} camps · {allWater.length} water sources
        </p>
      </div>
    </div>
  );
}
