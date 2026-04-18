/**
 * @fileoverview Firebase Realtime Database service for VenueIQ.
 * Handles all database operations: zone CRUD, alerts, crowd reports,
 * meetup sessions, and analytics event tracking. Uses Firebase Admin SDK
 * for secure server-side access with automatic credential management.
 * @module firebase
 */

const admin = require('firebase-admin');

let db = null;

/** @type {Object<string, {id: string, name: string, type: string, wait: number, capacity: number, floor: number}>} */
const INITIAL_ZONES = {
  'north-gate':  { id: 'north-gate',  name: 'North Gate',       type: 'gate',     wait: 4,  capacity: 0.28, floor: 0 },
  'south-gate':  { id: 'south-gate',  name: 'South Gate',       type: 'gate',     wait: 18, capacity: 0.79, floor: 0 },
  'east-food':   { id: 'east-food',   name: 'East Food Court',  type: 'food',     wait: 12, capacity: 0.61, floor: 1 },
  'west-food':   { id: 'west-food',   name: 'West Food Court',  type: 'food',     wait: 6,  capacity: 0.34, floor: 1 },
  'north-rest':  { id: 'north-rest',  name: 'North Restrooms',  type: 'restroom', wait: 2,  capacity: 0.19, floor: 1 },
  'south-rest':  { id: 'south-rest',  name: 'South Restrooms',  type: 'restroom', wait: 9,  capacity: 0.55, floor: 1 },
  'vip-entry':   { id: 'vip-entry',   name: 'VIP Entry',        type: 'gate',     wait: 1,  capacity: 0.10, floor: 0 },
  'main-bar':    { id: 'main-bar',    name: 'Main Bar L2',      type: 'food',     wait: 15, capacity: 0.72, floor: 2 },
};

/**
 * Initialize Firebase Admin SDK.
 * Accepts JSON service account from env var or falls back to
 * Application Default Credentials (ADC).
 * Seeds initial zone data if the database is empty.
 *
 * @returns {Promise<void>}
 * @throws {Error} if Firebase initialization fails
 */
async function initFirebase() {
  if (admin.apps.length > 0) return;

  const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    : admin.credential.applicationDefault();

  admin.initializeApp({
    credential,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.GCLOUD_STORAGE_BUCKET || undefined,
  });

  db = admin.database();

  // Seed initial data if zones don't exist yet
  const snap = await db.ref('zones').once('value');
  if (!snap.exists()) {
    console.log('[Firebase] Seeding initial zone data...');
    await db.ref('zones').set(INITIAL_ZONES);
  }
}

/**
 * Get the Firebase Realtime Database instance.
 *
 * @returns {import('firebase-admin').database.Database} Firebase database reference
 * @throws {Error} if Firebase has not been initialized
 */
function getDB() {
  if (!db) throw new Error('Firebase not initialized — call initFirebase() first');
  return db;
}

// ── Zone cache (5-second TTL to reduce Firebase reads) ──
/** @type {Array|null} */
let _zoneCache = null;
/** @type {number} */
let _zoneCacheTime = 0;
/** @type {number} Cache time-to-live in milliseconds */
const ZONE_CACHE_TTL = 5000;

/**
 * Get all zones as an array.
 * Uses a short-lived in-memory cache to reduce Firebase reads.
 * Falls back to INITIAL_ZONES if Firebase is empty.
 *
 * @returns {Promise<Array<{id: string, name: string, type: string, wait: number, capacity: number}>>} array of zone objects
 */
async function getZones() {
  const now = Date.now();
  if (_zoneCache && (now - _zoneCacheTime) < ZONE_CACHE_TTL) {
    return _zoneCache;
  }

  const snap = await getDB().ref('zones').once('value');
  _zoneCache = snap.exists() ? Object.values(snap.val()) : Object.values(INITIAL_ZONES);
  _zoneCacheTime = now;
  return _zoneCache;
}

/**
 * Invalidate the zone cache (called after writes).
 *
 * @returns {void}
 */
function invalidateZoneCache() {
  _zoneCache = null;
  _zoneCacheTime = 0;
}

/**
 * Update a single zone's fields with defence-in-depth validation.
 * Ensures capacity and wait are always within valid ranges
 * regardless of upstream validation.
 *
 * @param {string} zoneId - the zone identifier (e.g. 'north-gate')
 * @param {Object} data - fields to update
 * @param {number} [data.capacity] - capacity ratio (0-1)
 * @param {number} [data.wait] - wait time in minutes (>= 0)
 * @param {boolean} [data.closed] - whether the zone is closed
 * @param {string} [data.operatorNote] - operator note (max 200 chars)
 * @returns {Promise<void>}
 */
async function updateZone(zoneId, data) {
  // Enforce valid ranges — defence in depth beyond route validation
  const safe = {};
  if (data.capacity !== undefined) safe.capacity = Math.max(0, Math.min(1, Number(data.capacity) || 0));
  if (data.wait !== undefined)     safe.wait     = Math.max(0, Math.min(999, Math.round(Number(data.wait) || 0)));
  if (data.closed !== undefined)   safe.closed   = Boolean(data.closed);
  if (data.operatorNote !== undefined) safe.operatorNote = String(data.operatorNote).slice(0, 200);
  safe.updatedAt = Date.now();
  await getDB().ref(`zones/${zoneId}`).update(safe);
  invalidateZoneCache();
}

/**
 * Batch-update multiple paths in a single atomic write.
 * Used by heatmapScheduler to update all zones simultaneously.
 *
 * @param {Object<string, *>} updates - Firebase multi-path update object
 * @returns {Promise<void>}
 */
async function updateAllZones(updates) {
  await getDB().ref().update(updates);
  invalidateZoneCache();
}

/**
 * Push a new alert to Firebase and return the generated key.
 *
 * @param {Object} alertData - alert payload
 * @param {string} alertData.title - alert title
 * @param {string} alertData.body - alert body text
 * @param {string} alertData.urgency - 'urgent' or 'info'
 * @returns {Promise<string>} the generated Firebase push key
 */
async function pushAlert(alertData) {
  const ref = await getDB().ref('alerts').push({
    ...alertData,
    timestamp: Date.now()
  });
  return ref.key;
}

/**
 * Get the most recent alerts, sorted newest-first.
 *
 * @param {number} [limit=20] - maximum number of alerts to return
 * @returns {Promise<Array<{id: string, title: string, body: string, urgency: string, timestamp: number}>>}
 */
async function getAlerts(limit = 20) {
  const snap = await getDB().ref('alerts')
    .orderByChild('timestamp')
    .limitToLast(limit)
    .once('value');

  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([key, val]) => ({ id: key, ...val }))
    .reverse();
}

/**
 * Store a fan's crowd report for a zone.
 *
 * @param {string} zoneId - the zone identifier
 * @param {Object} reportData - report payload
 * @param {string} reportData.type - report type (crowded, empty, fast-moving, slow-moving)
 * @param {string} [reportData.userId] - optional user identifier
 * @returns {Promise<void>}
 */
async function pushCrowdReport(zoneId, reportData) {
  await getDB().ref(`reports/${zoneId}`).push({
    ...reportData,
    timestamp: Date.now()
  });
}

/**
 * Get recent crowd reports for a zone.
 *
 * @param {string} zoneId - the zone identifier
 * @param {number} [limit=20] - maximum number of reports to return
 * @returns {Promise<Array<{type: string, userId: string, timestamp: number}>>}
 */
async function getRecentReports(zoneId, limit = 20) {
  const snap = await getDB().ref(`reports/${zoneId}`)
    .orderByChild('timestamp')
    .limitToLast(limit)
    .once('value');

  return snap.exists() ? Object.values(snap.val()) : [];
}

/**
 * Track an analytics event in Firebase Realtime Database.
 * Writes to analytics/events node for cross-reference with
 * the frontend Google Analytics (GA4) SDK.
 * Non-critical — never throws for analytics failures.
 *
 * @param {string} eventName - event name (e.g. 'chat_message_sent')
 * @param {Object} [params={}] - event parameters
 * @param {string} [params.sessionId] - client session ID
 * @returns {Promise<void>}
 */
async function trackEvent(eventName, params = {}) {
  try {
    await getDB().ref('analytics/events').push({
      event: eventName,
      params,
      timestamp: Date.now(),
      sessionId: params.sessionId || 'server',
    });
  } catch {
    // Non-critical — never throw for analytics
  }
}

module.exports = {
  initFirebase,
  getDB,
  getZones,
  updateZone,
  updateAllZones,
  invalidateZoneCache,
  pushAlert,
  getAlerts,
  pushCrowdReport,
  getRecentReports,
  trackEvent,
  INITIAL_ZONES
};
