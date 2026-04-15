# PackPath Narration Prompt — sent to Claude Sonnet

## System prompt

(See system message)

## User preferences

```json
{
  "days": 4,
  "milesPerDay": "~10",
  "elevationTolerance": "moderate",
  "experienceLevel": "intermediate",
  "groupType": "couple",
  "sceneryPreferences": [
    "lakes",
    "peaks"
  ],
  "crowdPreference": "mixed",
  "avoid": "long stretches without water",
  "priorities": "alpine lakes and named peaks, variety of terrain each day",
  "notes": "July trip, willing to drive from Bishop, no permits if possible"
}
```

## Candidate routes

### Route A — "classic" archetype
- Total miles: 37.5
- Total elevation gain: 11,707 ft
- Total elevation loss: 11,705 ft
- Distinct trails: 10 (River Trail, Shadow Creek Trail, John Muir Trail, Minaret Creek Trail, Minaret Mine Trail, Cecile Lake Trail, Garnet Lake Cutoff, Pacific Crest Trail, Spooky Meadow Trail, Clark Lakes Trail)
- Distinct features: 25 (6 lakes: Altha Lake, Gem Lake, Gladys Lake, Iceberg Lake, Rosalie Lake, Shadow Lake; 9 waters: Badger Lakes, Billy Lake, Clarice Lake, Clark Lakes, Ediza Lake, Emily Lake, Johnston Lake, Olaine Lake, Summit Lake; 4 peaks: Clyde Minaret, Leonard Minaret, Red Top Mountain, Riegelhuth Minaret; 1 rivers: Middle Fork San Joaquin River; 3 streams: Minaret Creek, Rush Creek, Shadow Creek; 2 features: Minaret Mine, Minaret Mine)
- High-traffic ratio: 29% (JMT+PCT miles / total)
- Cluster size: 1789 variants
- Geo center: 37.69°N, 119.15°W
- Passes: none

Ordered segments (segIdx : trail : miles : elevation : features):
- 0: River Trail 2.4mi +872'/-1633' — lakes: Olaine Lake | streams: Middle Fork San Joaquin River
- 1-4: Shadow Creek Trail 3.7mi +1287'/-634' (4 sub-segments) — lakes: Olaine Lake, Shadow Lake | streams: Middle Fork San Joaquin River, Shadow Creek
- 5-9: John Muir Trail 6.9mi +1756'/-2392' (5 sub-segments) — lakes: Shadow Lake, Rosalie Lake, Gladys Lake, Emily Lake, Johnston Lake | streams: Shadow Creek
- 10: Minaret Creek Trail 2.7mi +1258'/-297' — peaks: Red Top Mountain | lakes: Johnston Lake | streams: Minaret Creek
- 11-12: Minaret Mine Trail 3.5mi +692'/-692' (2 sub-segments) — landmarks: Minaret Mine
- 13: Minaret Creek Trail 2.2mi +909'/-203' — peaks: Riegelhuth Minaret | streams: Minaret Creek
- 14-16: Cecile Lake Trail 0.8mi +530'/-117' (3 sub-segments) — peaks: Riegelhuth Minaret, Clyde Minaret | lakes: Iceberg Lake | streams: Minaret Creek, Shadow Creek
- 17-25: Shadow Creek Trail 3.3mi +798'/-2067' (9 sub-segments) — peaks: Clyde Minaret, Leonard Minaret | lakes: Iceberg Lake, Ediza Lake | streams: Shadow Creek
- 26-27: John Muir Trail 3.0mi +1573'/-897' (2 sub-segments) — lakes: Clarice Lake | streams: Shadow Creek
- 28-29: Garnet Lake Cutoff 0.6mi +19'/-527' (2 sub-segments) — lakes: Altha Lake | streams: Middle Fork San Joaquin River
- 30: River Trail 1.1mi +702'/-223' — lakes: Badger Lakes | streams: Middle Fork San Joaquin River
- 31: Pacific Crest Trail 0.3mi +0'/-0'
- 32: Spooky Meadow Trail 0.9mi +259'/-118' — lakes: Clark Lakes, Summit Lake
- 33-34: Clark Lakes Trail 3.7mi +878'/-878' (2 sub-segments) — lakes: Gem Lake, Clark Lakes, Billy Lake | streams: Rush Creek
- 35: Spooky Meadow Trail 0.9mi +118'/-259' — lakes: Clark Lakes, Summit Lake
- 36-37: Pacific Crest Trail 0.6mi +56'/-69' (2 sub-segments) — lakes: Badger Lakes, Summit Lake
- 38: Clark Lakes Trail 0.9mi +0'/-699' — lakes: Summit Lake, Badger Lakes

### Route B — "scenic" archetype
- Total miles: 39.4
- Total elevation gain: 10,860 ft
- Total elevation loss: 10,902 ft
- Distinct trails: 9 (Summit Meadow - Holcomb Cutoff, Holcomb Lake Trail, Ashley Lake Trail, Superior Lake Trail, John Muir Trail, Pacific Crest Trail, King Creek Trail, Summit Meadow Trail, Mammoth Trail)
- Distinct features: 12 (3 waters: Ashley Lake, Holcomb Lake, Noname Lake; 4 streams: Cargyle Creek, East Fork Cargyle Creek, King Creek, Minaret Creek; 1 lakes: Fern Lake; 2 peaks: Iron Mountain, Red Top Mountain; 2 rivers: Middle Fork San Joaquin River, North Fork San Joaquin River)
- High-traffic ratio: 19% (JMT+PCT miles / total)
- Cluster size: 232 variants
- Geo center: 37.61°N, 119.14°W
- Passes: none

Ordered segments (segIdx : trail : miles : elevation : features):
- 0: Summit Meadow - Holcomb Cutoff 1.4mi +635'/-388' — lakes: Fern Lake | streams: King Creek
- 1: Holcomb Lake Trail 0.3mi +141'/-0' — streams: King Creek
- 2-3: Ashley Lake Trail 2.3mi +367'/-367' (2 sub-segments) — peaks: Iron Mountain | lakes: Holcomb Lake, Noname Lake, Ashley Lake
- 4-7: Holcomb Lake Trail 2.3mi +451'/-592' (4 sub-segments) — peaks: Red Top Mountain | lakes: Holcomb Lake, Noname Lake | streams: King Creek
- 8: Superior Lake Trail 4.2mi +932'/-1890' — peaks: Red Top Mountain
- 9: John Muir Trail 0.8mi +0'/-407' — streams: Minaret Creek
- 10-13: (unnamed) 1.0mi +164'/-164' (4 sub-segments) — streams: Middle Fork San Joaquin River
- 14-15: Pacific Crest Trail 3.9mi +948'/-948' (2 sub-segments) — streams: Middle Fork San Joaquin River
- 16-18: John Muir Trail 2.7mi +1318'/-1187' (3 sub-segments) — streams: Middle Fork San Joaquin River
- 19: King Creek Trail 1.2mi +157'/-308'
- 20-22: Summit Meadow Trail 2.7mi +1570'/-236' (3 sub-segments) — streams: King Creek
- 23-36: Mammoth Trail 15.7mi +4007'/-4007' (14 sub-segments) — streams: East Fork Cargyle Creek, Cargyle Creek, North Fork San Joaquin River
- 37: Summit Meadow Trail 0.4mi +49'/-386'
- 38: Summit Meadow - Holcomb Cutoff 0.5mi +121'/-22' — lakes: Fern Lake

### Route C — "explorer" archetype
- Total miles: 38.4
- Total elevation gain: 12,824 ft
- Total elevation loss: 12,824 ft
- Distinct trails: 6 (Coldwater Campground to Lake George Trail, Emerald Lake Trail, Duck Pass Trail, John Muir Trail, Duck Pass Trail Alternate Route, Barrett Lake to Lake Mary Trail)
- Distinct features: 22 (8 lakes: Arrowhead Lake, Barney Lake, Duck Lake, Emerald Lake, Lake George, Lake Mary, Skelton Lake, Way Lake; 4 streams: Cold Water Creek, Crater Creek, Deer Creek, Mammoth Creek; 2 peaks: Crystal Crag, Herlihy Peak; 1 saddles: Duck Pass; 7 waters: Heart Lake, Lake Barrett, Lake Mamie, Red Lake, T J Lake, Woods Lakes, Woods Lakes)
- High-traffic ratio: 50% (JMT+PCT miles / total)
- Cluster size: 3180 variants
- Geo center: 37.57°N, 118.99°W
- Passes: Duck Pass

Ordered segments (segIdx : trail : miles : elevation : features):
- 0-1: Coldwater Campground to Lake George Trail 1.6mi +337'/-249' (2 sub-segments) — peaks: Crystal Crag | lakes: Lake Barrett, T J Lake, Way Lake, Emerald Lake | streams: Cold Water Creek
- 2-5: Emerald Lake Trail 1.8mi +689'/-200' (4 sub-segments) — lakes: Emerald Lake, Skelton Lake, Arrowhead Lake | streams: Cold Water Creek
- 6-11: Duck Pass Trail 4.3mi +1901'/-1677' (6 sub-segments) — peaks: Herlihy Peak | passes: Duck Pass | lakes: Skelton Lake, Arrowhead Lake, Barney Lake, Woods Lakes, Red Lake, Duck Lake
- 12-17: John Muir Trail 19.1mi +6608'/-6608' (6 sub-segments) — streams: Deer Creek, Crater Creek
- 18-20: Duck Pass Trail 2.4mi +1372'/-874' (3 sub-segments) — passes: Duck Pass | lakes: Duck Lake, Barney Lake
- 21: Duck Pass Trail Alternate Route 0.0mi +0'/-187' — lakes: Barney Lake
- 22-27: Duck Pass Trail 4.3mi +1102'/-1637' (6 sub-segments) — peaks: Herlihy Peak | lakes: Skelton Lake, Barney Lake, Woods Lakes, Red Lake, Arrowhead Lake, Heart Lake | streams: Mammoth Creek
- 28-29: Emerald Lake Trail 0.9mi +0'/-489' (2 sub-segments) — lakes: Skelton Lake, Emerald Lake, Arrowhead Lake | streams: Cold Water Creek
- 30: Coldwater Campground to Lake George Trail 1.5mi +249'/-337' — peaks: Crystal Crag | lakes: Lake Barrett, T J Lake, Way Lake, Emerald Lake | streams: Cold Water Creek
- 31-32: Barrett Lake to Lake Mary Trail 2.2mi +566'/-566' (2 sub-segments) — peaks: Crystal Crag | lakes: Lake George, Lake Barrett, T J Lake, Lake Mary, Lake Mamie | streams: Mammoth Creek
- 33: Coldwater Campground to Lake George Trail 0.1mi +0'/-0' — peaks: Crystal Crag | lakes: Lake Barrett, T J Lake

## Output schema

Produce a JSON array of exactly 3 route objects. Each object:

```json
{
  "routeName": "Evocative route name referencing real geography",
  "archetype": "classic | scenic | explorer",
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
```

**CRITICAL:** The `segmentIds` array for each day must list the exact `segIdx` values from the input segments. Every segment index for a route must appear in exactly one day. The code will compute miles, trail names, and features per day from these IDs — you never type a number. Just assign segments to days and write prose.

Assign all segments for each route across exactly 4 days, aiming for roughly equal daily mileage (~10mi/day). The segment order within each day must match the route order (ascending segIdx).

## Voice rules

**Banned words and what to do instead:**

- "nestled" / "tucked" / "set" → just use "beneath," "below," or "at the base of." ("Iceberg Lake sits beneath the Riegelhuth Minaret" not "Iceberg Lake is nestled beneath…")
- "dramatic" / "dramatically" → name the specific thing that makes it striking. ("The Minarets rise 2,000 ft above the lake" not "dramatic Minarets scenery.")
- "pristine" → delete it. Nothing in a day note is improved by being called pristine.
- "stunning" / "breathtaking" → delete. Show, don't tell. Describe what the hiker sees; let them decide if it's stunning.
- "spectacular" / "magnificent" → same as above. Name the physical detail instead of asserting grandeur. ("Iceberg Lake sits 800 ft below the Clyde Minaret" not "spectacular lake settings.")

These are AI-travel-writer tells that immediately mark prose as machine-generated to a real Sierra backpacker. Do not simply swap in synonyms — the fix is always to either delete the filler word or replace it with a concrete physical description.

**Long-day acknowledgments (150% rule):** When a day exceeds 150% of the target daily mileage or elevation, acknowledge it as a practical planning note for the user — e.g., "Day 4 is your long day — 16 miles, 5,000 ft gain. Start before dawn." Do NOT frame it as a justification for the route ("The extended mileage is necessary to complete the loop…"). The acknowledgment is for the hiker's planning, not the pipeline defending itself.

**Day balance (30% rule):** No day should be shorter than 30% of the daily mileage target (3 miles for this trip). If the route's final day would be very short based on natural segment breaks, redistribute segments across earlier days to balance. The goal is a reasonable day-by-day cadence, not perfect equality — days should roughly fall in the 3-15 mile range. A 1-mile finishing day looks broken to a backpacker reading the itinerary. If the route geometry genuinely forces an unbalanced day (e.g., the only campsite is 2 miles from the trailhead and the next is 14 miles further), acknowledge it honestly in the day note rather than hiding it — but that's a rare edge case, not a default.

**Day note accuracy:** When a day note references a mileage figure, elevation figure, or makes a long-day acknowledgment, those numbers must match the day they appear in. If Day 4 is the 16.6-mile day, the long-day acknowledgment goes in Day 4's note, not Day 3's. Each day's note describes that day's actual mileage and elevation - never another day's. The code computes exact per-day miles and elevation from your segment assignments; your prose must not contradict those numbers.
