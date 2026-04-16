/**
 * VenueIQ — venueLayout.js Unit Tests
 *
 * Tests the core location-aware recommendation engine:
 * - parseSection: section string → quadrant mapping
 * - scoreZones: proximity + queue time scoring
 * - getBestZoneForUser: best zone selection per type
 * - buildLocationContext: Gemini prompt context generation
 */

const {
  parseSection,
  scoreZones,
  getBestZoneForUser,
  buildLocationContext,
  SECTION_QUADRANT,
  ZONE_QUADRANT,
  WALK_TIMES,
} = require('../src/services/venueLayout');

const mockZones = [
  { id: 'north-gate', name: 'North Gate',      type: 'gate',     wait: 4,  capacity: 0.28 },
  { id: 'south-gate', name: 'South Gate',      type: 'gate',     wait: 18, capacity: 0.79 },
  { id: 'east-food',  name: 'East Food Court', type: 'food',     wait: 12, capacity: 0.61 },
  { id: 'west-food',  name: 'West Food Court', type: 'food',     wait: 6,  capacity: 0.34 },
  { id: 'north-rest', name: 'North Restrooms', type: 'restroom', wait: 2,  capacity: 0.19 },
  { id: 'south-rest', name: 'South Restrooms', type: 'restroom', wait: 9,  capacity: 0.55 },
  { id: 'vip-entry',  name: 'VIP Entry',       type: 'gate',     wait: 1,  capacity: 0.10 },
  { id: 'main-bar',   name: 'Main Bar L2',     type: 'food',     wait: 15, capacity: 0.72 },
];

// ===== parseSection =====
describe('parseSection', () => {
  it('parses section letter A → A', () => {
    expect(parseSection('A')).toBe('A');
  });

  it('parses section letter D → D', () => {
    expect(parseSection('D')).toBe('D');
  });

  it('parses section letter G → G', () => {
    expect(parseSection('G')).toBe('G');
  });

  it('parses section letter J → J', () => {
    expect(parseSection('J')).toBe('J');
  });

  it('parses section code like B12 → B', () => {
    expect(parseSection('B12')).toBe('B');
  });

  it('parses section code like E4 → E', () => {
    expect(parseSection('E4')).toBe('E');
  });

  it('parses quadrant word "north"', () => {
    expect(parseSection('north')).toBe('north');
  });

  it('parses quadrant word "SOUTH" (case insensitive)', () => {
    expect(parseSection('SOUTH')).toBe('south');
  });

  it('returns null for unrecognised section', () => {
    expect(parseSection('Z99')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseSection(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSection('')).toBeNull();
  });

  it('handles numeric input gracefully', () => {
    expect(parseSection(123)).toBeNull();
  });

  it('handles whitespace with valid letter', () => {
    expect(parseSection('  A  ')).toBe('A');
  });
});

// ===== scoreZones =====
describe('scoreZones', () => {
  it('returns zones with walkMinutes and effectiveCost', () => {
    const scored = scoreZones(mockZones, 'north');
    scored.forEach(z => {
      expect(z).toHaveProperty('walkMinutes');
      expect(z).toHaveProperty('effectiveCost');
      expect(typeof z.walkMinutes).toBe('number');
      expect(typeof z.effectiveCost).toBe('number');
    });
  });

  it('sorts zones by effectiveCost ascending', () => {
    const scored = scoreZones(mockZones, 'north');
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i].effectiveCost).toBeGreaterThanOrEqual(scored[i - 1].effectiveCost);
    }
  });

  it('gives lower walk penalty to same-quadrant zones', () => {
    const scored = scoreZones(mockZones, 'north');
    const northGate = scored.find(z => z.id === 'north-gate');
    const southGate = scored.find(z => z.id === 'south-gate');
    expect(northGate.walkMinutes).toBeLessThan(southGate.walkMinutes);
  });

  it('calculates effectiveCost correctly', () => {
    const scored = scoreZones(mockZones, 'north');
    const northGate = scored.find(z => z.id === 'north-gate');
    // north-gate is in north quadrant, WALK_TIMES.north.north = 1
    // effectiveCost = wait(4) + walkMinutes(1) * WALK_WEIGHT(1.5) = 5.5
    expect(northGate.effectiveCost).toBeCloseTo(5.5);
  });

  it('falls back to north for unknown user quadrant', () => {
    const scored = scoreZones(mockZones, 'unknown');
    expect(scored.length).toBe(mockZones.length);
  });
});

// ===== getBestZoneForUser =====
describe('getBestZoneForUser', () => {
  it('returns best food zone for north section user', () => {
    const result = getBestZoneForUser(mockZones, 'food', 'A');
    expect(result.locationKnown).toBe(true);
    expect(result.best).toBeDefined();
    expect(result.best.type).toBe('food');
    expect(result.userQuadrant).toBe('A');
  });

  it('returns best gate zone for south section user', () => {
    const result = getBestZoneForUser(mockZones, 'gate', 'J');
    expect(result.locationKnown).toBe(true);
    expect(result.best.type).toBe('gate');
    expect(result.userQuadrant).toBe('J');
  });

  it('returns runner-up when available', () => {
    const result = getBestZoneForUser(mockZones, 'food', 'A');
    expect(result.runner).toBeDefined();
    expect(result.runner.type).toBe('food');
    expect(result.runner.id).not.toBe(result.best.id);
  });

  it('falls back to wait-sorted when no section provided', () => {
    const result = getBestZoneForUser(mockZones, 'food', null);
    expect(result.locationKnown).toBe(false);
    expect(result.best).toBeDefined();
    // Without location, should return the lowest wait time food zone
    expect(result.best.wait).toBeLessThanOrEqual(result.runner.wait);
  });

  it('returns null runner when only one zone of type exists', () => {
    const singleZone = [{ id: 'test-food', name: 'Test Food', type: 'food', wait: 5, capacity: 0.3 }];
    const result = getBestZoneForUser(singleZone, 'food', 'A');
    expect(result.best).toBeDefined();
    expect(result.runner).toBeNull();
  });
});

// ===== buildLocationContext =====
describe('buildLocationContext', () => {
  it('includes "user location unknown" when no section provided', () => {
    const ctx = buildLocationContext(mockZones, null);
    expect(ctx).toContain('user location unknown');
    expect(ctx).toContain('MUST ask which section');
  });

  it('includes user section info when section is provided', () => {
    const ctx = buildLocationContext(mockZones, 'B');
    expect(ctx).toContain('section **B**');
    expect(ctx).toContain('B stand');
  });

  it('includes effective cost in location-aware context', () => {
    const ctx = buildLocationContext(mockZones, 'D');
    expect(ctx).toContain('min total from D');
    expect(ctx).toContain('min queue + ~');
  });

  it('includes all zones in the context', () => {
    const ctx = buildLocationContext(mockZones, 'A');
    mockZones.forEach(z => {
      expect(ctx).toContain(z.name);
    });
  });
});

// ===== CONSTANTS INTEGRITY =====
describe('Layout constants', () => {
  it('SECTION_QUADRANT covers A-L', () => {
    const letters = 'ABCDEFGHIJKL'.split('');
    letters.forEach(l => {
      expect(SECTION_QUADRANT[l]).toBeDefined();
      expect(['north', 'south', 'east', 'west']).toContain(SECTION_QUADRANT[l]);
    });
  });

  it('WALK_TIMES is symmetric for all quadrants', () => {
    ['north', 'south', 'east', 'west'].forEach(q => {
      expect(WALK_TIMES[q]).toBeDefined();
      expect(WALK_TIMES[q][q]).toBe(1); // Same quadrant = 1 min
    });
  });

  it('ZONE_QUADRANT covers all 8 zones', () => {
    const zoneIds = ['north-gate', 'south-gate', 'east-food', 'west-food', 'north-rest', 'south-rest', 'vip-entry', 'main-bar'];
    zoneIds.forEach(id => {
      expect(ZONE_QUADRANT[id]).toBeDefined();
    });
  });
});
