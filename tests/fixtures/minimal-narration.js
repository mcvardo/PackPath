// tests/fixtures/minimal-narration.js
// Minimal valid narration fixture for use in validate-narration tests.
// One route, two days, all validator checks passing.

export const minimalStructuredInput = {
  userPreferences: {
    days: 2,
    milesPerDay: '~10',
    elevationTolerance: 'moderate',
    experienceLevel: 'intermediate',
    groupType: 'couple',
    sceneryPreferences: ['lakes'],
    crowdPreference: 'mixed',
    avoid: '',
    priorities: '',
    notes: '',
  },
  candidateRoutes: {
    classic: {
      totalMiles: 20.0,
      totalGainFt: 3000,
      totalLossFt: 3000,
      allFeatures: [
        { name: 'Shadow Lake', type: 'lake' },
        { name: 'Ediza Lake', type: 'lake' },
        { name: 'Shadow Creek', type: 'stream' },
      ],
      segments: [
        {
          segIdx: 0,
          trailName: 'John Muir Trail',
          lengthMi: 5.0,
          gainFt: 800,
          lossFt: 200,
          peaks: [],
          passes: [],
          lakes: ['Shadow Lake'],
          streams: ['Shadow Creek'],
          springs: [],
          landmarks: [],
        },
        {
          segIdx: 1,
          trailName: 'John Muir Trail',
          lengthMi: 5.0,
          gainFt: 700,
          lossFt: 800,
          peaks: [],
          passes: [],
          lakes: ['Ediza Lake'],
          streams: [],
          springs: [],
          landmarks: [],
        },
        {
          segIdx: 2,
          trailName: 'Shadow Lake Trail',
          lengthMi: 5.0,
          gainFt: 800,
          lossFt: 1000,
          peaks: [],
          passes: [],
          lakes: ['Shadow Lake'],
          streams: ['Shadow Creek'],
          springs: [],
          landmarks: [],
        },
        {
          segIdx: 3,
          trailName: 'Shadow Lake Trail',
          lengthMi: 5.0,
          gainFt: 700,
          lossFt: 1000,
          peaks: [],
          passes: [],
          lakes: [],
          streams: [],
          springs: [],
          landmarks: [],
        },
      ],
    },
  },
};

export const minimalValidNarration = [
  {
    routeName: 'Shadow Lake & Ediza Loop',
    archetype: 'classic',
    totalMiles: 20.0,
    computedMiles: 20.0,
    totalGainFt: 3000,
    totalLossFt: 3000,
    days: 2,
    summary: 'A two-day loop through the Shadow Lake basin, passing Ediza Lake and following Shadow Creek through the Ansel Adams Wilderness.',
    bestFor: 'Intermediate backpackers seeking lake scenery with moderate elevation gain.',
    segments: [
      {
        day: 1,
        segmentIds: [0, 1],
        trailNames: ['John Muir Trail'],
        miles: 10.0,
        gainFt: 1500,
        lossFt: 1000,
        note: 'From the trailhead, follow the John Muir Trail past Shadow Lake and its outlet along Shadow Creek, climbing steadily to reach Ediza Lake by afternoon. Camp at the lake shore with views across the water.',
        features: {
          peaks: [],
          passes: [],
          lakes: ['Shadow Lake', 'Ediza Lake'],
          streams: ['Shadow Creek'],
          springs: [],
          landmarks: [],
        },
      },
      {
        day: 2,
        segmentIds: [2, 3],
        trailNames: ['Shadow Lake Trail'],
        miles: 10.0,
        gainFt: 1500,
        lossFt: 2000,
        note: 'Return via the Shadow Lake Trail, descending past Shadow Lake and following Shadow Creek back to the trailhead. The descent offers views back toward the Ritter Range before the final miles through forest.',
        features: {
          peaks: [],
          passes: [],
          lakes: ['Shadow Lake'],
          streams: ['Shadow Creek'],
          springs: [],
          landmarks: [],
        },
      },
    ],
    pros: [
      'Shadow Lake and Ediza Lake provide two distinct lake camps on a 20-mile loop, giving each night a different character.',
      'The John Muir Trail section is well-maintained with reliable water from Shadow Creek throughout.',
    ],
    cons: [
      'The John Muir Trail section carries high foot traffic, especially on summer weekends near Shadow Lake.',
    ],
    gearTips: [
      'Bear canister required in the Ansel Adams Wilderness.',
    ],
  },
];

export const minimalRegionConfig = {
  name: 'Ansel Adams Wilderness',
  allowedNonFeatures: [
    'Ansel Adams', 'Ritter Range', 'Sierra Nevada', 'High Sierra',
    'Ansel Adams Wilderness',
  ],
};
