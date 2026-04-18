/**
 * VenueIQ Backend — API Test Suite
 *
 * Tests all routes using Jest + Supertest with mocked Firebase and Gemini services.
 * No real Firebase or Gemini calls are made during testing.
 */

// ===== Mock services BEFORE importing app =====
jest.mock('../src/services/firebase', () => {
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

  const mockAlerts = [
    { id: 'a1', title: 'Test Alert', body: 'Test body', urgency: 'info', type: 'info', icon: 'ℹ️', timestamp: Date.now(), source: 'manual' },
  ];

  return {
    initFirebase: jest.fn().mockResolvedValue(undefined),
    getDB: jest.fn().mockReturnValue({
      ref: jest.fn().mockReturnValue({
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        push: jest.fn().mockResolvedValue({ key: 'mock-key' }),
        once: jest.fn().mockResolvedValue({
          exists: () => false,
          val: () => null,
        }),
        orderByChild: jest.fn().mockReturnThis(),
        limitToLast: jest.fn().mockReturnThis(),
        child: jest.fn().mockReturnValue({
          remove: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    }),
    getZones: jest.fn().mockResolvedValue(mockZones),
    updateZone: jest.fn().mockResolvedValue(undefined),
    updateAllZones: jest.fn().mockResolvedValue(undefined),
    pushAlert: jest.fn().mockResolvedValue('mock-alert-id'),
    getAlerts: jest.fn().mockResolvedValue(mockAlerts),
    pushCrowdReport: jest.fn().mockResolvedValue(undefined),
    getRecentReports: jest.fn().mockResolvedValue([
      { type: 'crowded', timestamp: Date.now() },
      { type: 'empty', timestamp: Date.now() },
      { type: 'crowded', timestamp: Date.now() },
    ]),
    INITIAL_ZONES: {},
  };
});

jest.mock('../src/services/gemini', () => ({
  chat: jest.fn().mockResolvedValue('**West Food Court** has the shortest wait — just **6 min**. 🍔'),
  generateAlert: jest.fn().mockResolvedValue({ title: 'Test', body: 'Test body', urgency: 'info' }),
  localFallback: jest.fn().mockReturnValue('Fallback response'),
}));

jest.mock('../src/services/predictor', () => ({
  recordSnapshot:  jest.fn().mockResolvedValue(undefined),
  getForecast:     jest.fn().mockResolvedValue({ predictedWait: 8, trend: 'rising', confidence: 'high' }),
  getAllForecasts:  jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/services/storage', () => ({
  uploadZoneSnapshot: jest.fn().mockResolvedValue('snapshots/test.json'),
  listSnapshots: jest.fn().mockResolvedValue([]),
}));

const request = require('supertest');
const express = require('express');

// Build a minimal app for testing (no schedulers, no boot)
const chatRouter = require('../src/routes/chat');
const zonesRouter = require('../src/routes/zones');
const alertsRouter = require('../src/routes/alerts');
const reportsRouter = require('../src/routes/reports');
const meetupRouter = require('../src/routes/meetup');
const dashboardRouter = require('../src/routes/dashboard');
const { errorHandler } = require('../src/middleware/errorHandler');

const { requestId } = require('../src/middleware/requestId');
const { sanitizeBody } = require('../src/middleware/sanitize');

const app = express();
app.use(requestId);
app.use(express.json({ limit: '50kb' }));
app.use(sanitizeBody);
app.set('io', null);
app.use('/api/chat', chatRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/meetup', meetupRouter);
app.use('/api/dashboard', dashboardRouter);
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use(errorHandler);

// ===== HEALTH CHECK =====
describe('GET /health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ===== ZONES =====
describe('GET /api/zones', () => {
  it('returns all zones sorted by wait time', async () => {
    const res = await request(app).get('/api/zones');
    expect(res.status).toBe(200);
    expect(res.body.zones).toBeDefined();
    expect(res.body.count).toBe(8);
    expect(res.body.timestamp).toBeDefined();
    // Verify sorted by wait time ascending
    for (let i = 1; i < res.body.zones.length; i++) {
      expect(res.body.zones[i].wait).toBeGreaterThanOrEqual(res.body.zones[i - 1].wait);
    }
  });

  it('filters zones by type', async () => {
    const res = await request(app).get('/api/zones?type=food');
    expect(res.status).toBe(200);
    expect(res.body.zones.every(z => z.type === 'food')).toBe(true);
    expect(res.body.count).toBe(3);
  });

  it('returns empty array for unknown type', async () => {
    const res = await request(app).get('/api/zones?type=pool');
    expect(res.status).toBe(200);
    expect(res.body.zones).toEqual([]);
    expect(res.body.count).toBe(0);
  });
});

describe('GET /api/zones/:id', () => {
  it('returns a zone by ID', async () => {
    const res = await request(app).get('/api/zones/north-gate');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('north-gate');
    expect(res.body.name).toBe('North Gate');
    expect(res.body.wait).toBeDefined();
    expect(res.body.capacity).toBeDefined();
  });

  it('returns 404 for unknown zone', async () => {
    const res = await request(app).get('/api/zones/nonexistent-zone');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ===== FORECAST =====
describe('GET /api/zones/forecast', () => {
  it('returns zones with forecast fields', async () => {
    const res = await request(app).get('/api/zones/forecast');
    expect(res.status).toBe(200);
    expect(res.body.zones[0]).toHaveProperty('forecast');
    expect(res.body.forecastHorizonMinutes).toBe(15);
  });
});

// ===== CHAT =====
describe('POST /api/chat', () => {
  it('returns AI reply for valid message', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'Which food queue is shortest?' });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBeDefined();
    expect(typeof res.body.reply).toBe('string');
    expect(res.body.timestamp).toBeDefined();
  });

  it('accepts conversation history', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({
        message: 'What about gates?',
        history: [
          { role: 'user', text: 'Which food queue is shortest?' },
          { role: 'model', text: 'West Food Court has the shortest wait.' }
        ]
      });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBeDefined();
  });

  it('rejects missing message', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/message/i);
  });

  it('rejects non-string message', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/string/i);
  });

  it('rejects message exceeding 500 characters', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too long/i);
  });
});

// ===== ALERTS =====
describe('GET /api/alerts', () => {
  it('returns alerts array', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.alerts)).toBe(true);
    expect(res.body.count).toBeDefined();
  });

  it('respects limit parameter', async () => {
    const res = await request(app).get('/api/alerts?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.alerts).toBeDefined();
  });
});

describe('POST /api/alerts', () => {
  it('creates a valid alert', async () => {
    const res = await request(app)
      .post('/api/alerts')
      .send({ title: 'Test Alert', body: 'Test body text', urgency: 'info' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.alertId).toBeDefined();
  });

  it('creates urgent alert', async () => {
    const res = await request(app)
      .post('/api/alerts')
      .send({ title: 'Urgent!', body: 'Emergency alert body', urgency: 'urgent' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('rejects missing title', async () => {
    const res = await request(app)
      .post('/api/alerts')
      .send({ body: 'No title provided' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title.*body|required/i);
  });

  it('rejects missing body', async () => {
    const res = await request(app)
      .post('/api/alerts')
      .send({ title: 'No body' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title.*body|required/i);
  });

  it('rejects invalid urgency', async () => {
    const res = await request(app)
      .post('/api/alerts')
      .send({ title: 'Test', body: 'Test', urgency: 'critical' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid urgency/i);
  });
});

// ===== REPORTS =====
describe('POST /api/reports', () => {
  it('accepts a valid crowd report', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ zoneId: 'north-gate', reportType: 'crowded' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBeDefined();
  });

  it('accepts all valid report types', async () => {
    const types = ['crowded', 'empty', 'fast-moving', 'slow-moving'];
    for (const reportType of types) {
      const res = await request(app)
        .post('/api/reports')
        .send({ zoneId: 'east-food', reportType });
      expect(res.status).toBe(201);
    }
  });

  it('rejects missing zoneId', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ reportType: 'crowded' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/zoneId/i);
  });

  it('rejects invalid report type', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ zoneId: 'north-gate', reportType: 'very-busy' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reportType/i);
  });

  it('accepts optional userId', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ zoneId: 'north-gate', reportType: 'empty', userId: 'fan-42' });
    expect(res.status).toBe(201);
  });

  it('rejects invalid zoneId format', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ zoneId: '../admin', reportType: 'crowded' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });
});

// ===== PATCH ZONES =====
describe('PATCH /api/zones/:id', () => {
  it('updates zone capacity', async () => {
    const res = await request(app)
      .patch('/api/zones/north-gate')
      .send({ capacity: 0.5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.zoneId).toBe('north-gate');
    expect(res.body.updated.capacity).toBe(0.5);
  });

  it('updates zone wait time', async () => {
    const res = await request(app)
      .patch('/api/zones/north-gate')
      .send({ wait: 10 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updated.wait).toBe(10);
  });

  it('updates both capacity and wait', async () => {
    const res = await request(app)
      .patch('/api/zones/north-gate')
      .send({ capacity: 0.7, wait: 15 });
    expect(res.status).toBe(200);
    expect(res.body.updated.capacity).toBe(0.7);
    expect(res.body.updated.wait).toBe(15);
  });

  it('rejects capacity out of range (> 1)', async () => {
    const res = await request(app)
      .patch('/api/zones/north-gate')
      .send({ capacity: 1.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/capacity/i);
  });

  it('rejects capacity out of range (< 0)', async () => {
    const res = await request(app)
      .patch('/api/zones/north-gate')
      .send({ capacity: -0.1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/capacity/i);
  });

  it('rejects negative wait time', async () => {
    const res = await request(app)
      .patch('/api/zones/north-gate')
      .send({ wait: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/wait/i);
  });

  it('rejects non-numeric capacity', async () => {
    const res = await request(app)
      .patch('/api/zones/north-gate')
      .send({ capacity: 'full' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/capacity/i);
  });

  it('rejects empty body', async () => {
    const res = await request(app)
      .patch('/api/zones/north-gate')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('rejects invalid zone ID format', async () => {
    const res = await request(app)
      .patch('/api/zones/INVALID_ID!')
      .send({ capacity: 0.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });
});

// ===== MEETUP =====
describe('POST /api/meetup', () => {
  it('creates a session and returns a code', async () => {
    const res = await request(app).post('/api/meetup').send({ creatorName: 'Naren' });
    expect(res.status).toBe(201);
    expect(res.body.code).toHaveLength(6);
    expect(res.body.expiresAt).toBeGreaterThan(Date.now());
  });
  it('rejects missing creatorName', async () => {
    const res = await request(app).post('/api/meetup').send({});
    expect(res.status).toBe(400);
  });
});

// ===== DASHBOARD =====
describe('GET /api/dashboard/overview', () => {
  it('rejects without auth token', async () => {
    const res = await request(app).get('/api/dashboard/overview');
    expect(res.status).toBe(401);
  });
  it('returns overview with auth token', async () => {
    process.env.DASHBOARD_TOKEN = 'test-token';
    const res = await request(app)
      .get('/api/dashboard/overview')
      .set('X-Ops-Token', 'test-token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('zones');
  });
});

// ===== ADDITIONAL CHAT VALIDATION =====
describe('POST /api/chat — extended validation', () => {
  it('rejects whitespace-only message', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/message/i);
  });

  it('rejects non-array history', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'hello', history: 'not an array' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/array/i);
  });

  it('uses local fallback when Gemini throws', async () => {
    const { chat } = require('../src/services/gemini');
    chat.mockRejectedValueOnce(new Error('Gemini quota exceeded'));

    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'Which gate is best?' });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Fallback response');
  });
});

// ===== MALFORMED JSON =====
describe('Error handler', () => {
  it('handles malformed JSON body', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Content-Type', 'application/json')
      .send('{invalid json}');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid json/i);
  });
});

// ===== SANITISATION TESTS =====
describe('Input sanitisation', () => {
  it('strips HTML tags from chat message via sanitizeString', () => {
    const { sanitizeString } = require('../src/middleware/sanitize');
    expect(sanitizeString('<script>alert(1)</script>hello')).toBe('alert(1)hello');
    expect(sanitizeString('normal message')).toBe('normal message');
  });

  it('strips javascript: URI from strings', () => {
    const { sanitizeString } = require('../src/middleware/sanitize');
    expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)');
  });

  it('strips inline event handlers from strings', () => {
    const { sanitizeString } = require('../src/middleware/sanitize');
    expect(sanitizeString('test onerror=alert(1) value')).toBe('test alert(1) value');
  });
});

// ===== SECURITY HEADER TESTS =====
describe('Security headers', () => {
  it('includes X-Request-ID on every response', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('accepts valid UUID as X-Request-ID passthrough', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app).get('/health').set('X-Request-ID', id);
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('generates new UUID when X-Request-ID is invalid', async () => {
    const res = await request(app).get('/health').set('X-Request-ID', 'not-a-uuid');
    expect(res.headers['x-request-id']).not.toBe('not-a-uuid');
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});

// ===== STORAGE SERVICE =====
describe('Storage service', () => {
  it('listSnapshots returns empty array when bucket not configured', async () => {
    const { listSnapshots } = require('../src/services/storage');
    const result = await listSnapshots();
    expect(Array.isArray(result)).toBe(true);
  });

  it('uploadZoneSnapshot returns a filename', async () => {
    const { uploadZoneSnapshot } = require('../src/services/storage');
    const result = await uploadZoneSnapshot([{ id: 'test', capacity: 0.5 }]);
    expect(result).toBe('snapshots/test.json');
  });
});

// ===== RATE LIMITING SMOKE TEST =====
describe('Rate limiting', () => {
  it('/health is accessible (not rate limited)', async () => {
    const results = await Promise.all(
      Array(5).fill(null).map(() => request(app).get('/health'))
    );
    results.forEach(r => expect(r.status).toBe(200));
  });
});
