const admin = require('firebase-admin');

let db = null;

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
 * Accepts JSON service account from env var or falls back to Application Default Credentials.
 * Seeds initial zone data if the database is empty.
 */
async function initFirebase() {
  if (admin.apps.length > 0) return;

  const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    : admin.credential.applicationDefault();

  admin.initializeApp({
    credential,
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });

  db = admin.database();

  // Seed initial data if zones don't exist yet
  const snap = await db.ref('zones').once('value');
  if (!snap.exists()) {
    console.log('[Firebase] Seeding initial zone data...');
    await db.ref('zones').set(INITIAL_ZONES);
  }
}

function getDB() {
  if (!db) throw new Error('Firebase not initialized — call initFirebase() first');
  return db;
}

// ── Zone cache (5-second TTL to reduce Firebase reads) ──
let _zoneCache = null;
let _zoneCacheTime = 0;
const ZONE_CACHE_TTL = 5000;

/**
 * Get all zones as an array.
 * Uses a short-lived in-memory cache to reduce Firebase reads.
 * Falls back to INITIAL_ZONES if Firebase is empty.
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
 */
function invalidateZoneCache() {
  _zoneCache = null;
  _zoneCacheTime = 0;
}

/**
 * Update a single zone's fields.
 */
async function updateZone(zoneId, data) {
  await getDB().ref(`zones/${zoneId}`).update({
    ...data,
    updatedAt: Date.now()
  });
  invalidateZoneCache();
}

/**
 * Batch-update multiple paths in a single atomic write.
 */
async function updateAllZones(updates) {
  await getDB().ref().update(updates);
  invalidateZoneCache();
}

/**
 * Push a new alert and return the generated key.
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
 */
async function pushCrowdReport(zoneId, reportData) {
  await getDB().ref(`reports/${zoneId}`).push({
    ...reportData,
    timestamp: Date.now()
  });
}

/**
 * Get recent crowd reports for a zone.
 */
async function getRecentReports(zoneId, limit = 20) {
  const snap = await getDB().ref(`reports/${zoneId}`)
    .orderByChild('timestamp')
    .limitToLast(limit)
    .once('value');

  return snap.exists() ? Object.values(snap.val()) : [];
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
  INITIAL_ZONES
};
