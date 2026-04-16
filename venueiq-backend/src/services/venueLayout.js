/**
 * venueLayout.js
 *
 * Defines the physical layout of the stadium — which sections belong to
 * which quadrant, and where every zone sits relative to those quadrants.
 *
 * The scoring function combines two factors:
 *   - Walk penalty: how far the zone is from the user's section (in minutes)
 *   - Queue penalty: the live wait time at the zone
 *
 * This gives us a single "effective cost" per zone so we can recommend
 * the genuinely best option for *this* fan, not just the globally shortest queue.
 *
 * Stadium layout (bird's eye, 4 quadrants):
 *
 *           NORTH (sections A, B, C)
 *              Gate N
 *         ┌────────────┐
 *  WEST   │            │  EAST
 * Gate W  │   PITCH    │  Gate E
 * (G,H,I) │            │ (D,E,F)
 *         └────────────┘
 *              Gate S
 *           SOUTH (sections J, K, L)
 */

// ── Section → quadrant mapping ──────────────────────────────────────────────
// Each section letter maps to a compass quadrant.
// Extend this as needed for your specific venue.
const SECTION_QUADRANT = {
  // North stand
  A: 'north', B: 'north', C: 'north',
  // East stand
  D: 'east',  E: 'east',  F: 'east',
  // West stand
  G: 'west',  H: 'west',  I: 'west',
  // South stand
  J: 'south', K: 'south', L: 'south',
};

// ── Zone → quadrant mapping ──────────────────────────────────────────────────
// Where each zone physically sits in the stadium.
const ZONE_QUADRANT = {
  'north-gate':  'north',
  'north-rest':  'north',
  'south-gate':  'south',
  'south-rest':  'south',
  'east-food':   'east',
  'vip-entry':   'east',
  'west-food':   'west',
  'main-bar':    'west',
};

// ── Walk time matrix (minutes) ───────────────────────────────────────────────
// WALK_TIMES[userQuadrant][zoneQuadrant] = estimated walk minutes
const WALK_TIMES = {
  // North stand: A is near West, C is near East
  A: { north: 1, west: 2, east: 6, south: 8 },
  B: { north: 1, west: 4, east: 4, south: 8 },
  C: { north: 1, west: 6, east: 2, south: 8 },
  // East stand: D is near North, F is near South
  D: { east: 1, north: 2, south: 6, west: 8 },
  E: { east: 1, north: 4, south: 4, west: 8 },
  F: { east: 1, north: 6, south: 2, west: 8 },
  // West stand: G is near North, I is near South
  G: { west: 1, north: 2, south: 6, east: 8 },
  H: { west: 1, north: 4, south: 4, east: 8 },
  I: { west: 1, north: 6, south: 2, east: 8 },
  // South stand: J is near West, L is near East
  J: { south: 1, west: 2, east: 6, north: 8 },
  K: { south: 1, west: 4, east: 4, north: 8 },
  L: { south: 1, west: 6, east: 2, north: 8 },
  // Generic quadrant fallbacks
  north: { north: 1, east: 4, west: 4, south: 8 },
  east:  { east: 1, north: 4, south: 4, west: 8 },
  west:  { west: 1, north: 4, south: 4, east: 8 },
  south: { south: 1, east: 4, west: 4, north: 8 },
};

// Weight multiplier for walk minutes (vs wait minutes).
// 1.5 means 1 min of walking is considered as annoying as 1.5 mins of standing in queue.
const WALK_WEIGHT = 1.5;

/**
 * Parse a section string like "B12", "E4", "H" into a quadrant.
 * Returns null if unrecognised.
 */
function parseSection(sectionInput) {
  if (!sectionInput) return null;
  const s = sectionInput.toString().trim().toUpperCase();

  // Direct quadrant words
  if (/^NORTH/i.test(s)) return 'north';
  if (/^SOUTH/i.test(s)) return 'south';
  if (/^EAST/i.test(s))  return 'east';
  if (/^WEST/i.test(s))  return 'west';

  // Extract the leading letter(s) from a section code like "B12" or "EE4"
  const match = s.match(/^([A-Z]+)/);
  if (!match) return null;

  const letter = match[1][0];
  // If we have high-fidelity section data for this exact letter, use it
  if (WALK_TIMES[letter]) return letter;
  
  return SECTION_QUADRANT[letter] || null;
}

/**
 * Score every zone for a given user quadrant.
 */
function scoreZones(zones, userQuadrant) {
  const walkRow = WALK_TIMES[userQuadrant] || WALK_TIMES.north;

  return zones
    .map(zone => {
      const zoneQuadrant = ZONE_QUADRANT[zone.id] || 'north';
      const walkMinutes  = walkRow[zoneQuadrant] ?? 6;
      const effectiveCost = zone.wait + (walkMinutes * WALK_WEIGHT);
      return { ...zone, walkMinutes, effectiveCost };
    })
    .sort((a, b) => a.effectiveCost - b.effectiveCost);
}

/**
 * Get the best zone of a specific type for a user location.
 */
function getBestZoneForUser(zones, type, userSection) {
  const userQuadrant = parseSection(userSection);
  const ofType = zones.filter(z => z.type === type);

  if (!userQuadrant) {
    const sorted = ofType.slice().sort((a, b) => a.wait - b.wait);
    return { best: sorted[0], runner: sorted[1] || null, userQuadrant: null, locationKnown: false };
  }

  const scored = scoreZones(ofType, userQuadrant);
  return {
    best: scored[0],
    runner: scored[1] || null,
    userQuadrant,
    locationKnown: true,
  };
}

/**
 * Build the location-aware context string to inject into Gemini's prompt.
 * Now accepts optional forecasts parameter to include 15-min trend arrows.
 */
function buildLocationContext(zones, userSection, forecasts = {}) {
  const userQuadrant = parseSection(userSection);

  const formatForecast = (zoneId) => {
    const f = forecasts[zoneId];
    if (!f || !f.predictedWait || f.confidence === 'low') return '';
    const arrow = f.trend === 'rising' ? '↑' : f.trend === 'falling' ? '↓' : '→';
    return ` [forecast in 15min: ${f.predictedWait}min ${arrow}]`;
  };

  if (!userQuadrant) {
    const lines = zones
      .slice().sort((a, b) => a.wait - b.wait)
      .map(z => `- ${z.name} (${z.type}): ${z.wait} min wait, ${Math.round(z.capacity * 100)}% full${formatForecast(z.id)}`)
      .join('\n');
    return `Live zone data (sorted by queue — user location unknown):\n${lines}\n\nIMPORTANT: If the user asks for the "nearest" or "closest" option, you MUST ask which section they are sitting in before recommending.`;
  }

  const scored = scoreZones(zones, userQuadrant);
  const lines = scored
    .map(z => `- ${z.name} (${z.type}): ${z.wait}min queue + ~${z.walkMinutes}min walk = ${Math.round(z.effectiveCost)}min total from ${userSection}${formatForecast(z.id)}`)
    .join('\n');

  return `User is in section **${userSection}** (${userQuadrant} stand).\n\nZone data pre-scored for this user (lower total = better):\n${lines}\n\nWhen recommending, use the total time. Mention the 15-min forecast if it changes the recommendation (e.g. a rising queue means go now).`;
}

module.exports = {
  parseSection,
  scoreZones,
  getBestZoneForUser,
  buildLocationContext,
  SECTION_QUADRANT,
  ZONE_QUADRANT,
  WALK_TIMES,
};
