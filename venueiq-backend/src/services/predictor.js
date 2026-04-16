// src/services/predictor.js

const { getDB } = require('./firebase');

const HISTORY_WINDOW = 10;    // readings to keep per zone
const FORECAST_MINUTES = 15;  // how far ahead to predict

/**
 * Record a snapshot of all zone capacities into Firebase history.
 * Called by heatmapScheduler after every tick.
 * Stores as: history/{zoneId}/{pushKey} = { capacity, wait, timestamp }
 * Prunes to last HISTORY_WINDOW readings automatically.
 */
async function recordSnapshot(zones) {
  const db = getDB();
  const now = Date.now();
  const writes = zones.map(async zone => {
    const ref = db.ref(`history/${zone.id}`);
    await ref.push({ capacity: zone.capacity, wait: zone.wait, timestamp: now });
    // Prune: keep only last HISTORY_WINDOW entries
    const snap = await ref.orderByChild('timestamp').once('value');
    if (snap.exists()) {
      const entries = Object.entries(snap.val()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      if (entries.length > HISTORY_WINDOW) {
        const toDelete = entries.slice(0, entries.length - HISTORY_WINDOW);
        await Promise.all(toDelete.map(([key]) => ref.child(key).remove()));
      }
    }
  });
  await Promise.all(writes);
}

/**
 * Fetch history for a zone and compute an exponentially-weighted
 * moving average (EWMA) trend. Returns predicted capacity and wait
 * FORECAST_MINUTES from now.
 *
 * EWMA gives more weight to recent readings: alpha = 0.3 means
 * the most recent reading contributes 30% of the forecast.
 *
 * @param {string} zoneId
 * @returns {{ predictedCapacity: number, predictedWait: number, trend: 'rising'|'falling'|'stable', confidence: 'high'|'low' }}
 */
async function getForecast(zoneId) {
  const db = getDB();
  const snap = await db.ref(`history/${zoneId}`)
    .orderByChild('timestamp')
    .limitToLast(HISTORY_WINDOW)
    .once('value');

  if (!snap.exists()) {
    return { predictedCapacity: null, predictedWait: null, trend: 'stable', confidence: 'low' };
  }

  const readings = Object.values(snap.val()).sort((a, b) => a.timestamp - b.timestamp);

  if (readings.length < 3) {
    return { predictedCapacity: null, predictedWait: null, trend: 'stable', confidence: 'low' };
  }

  // EWMA
  const alpha = 0.3;
  let ewma = readings[0].capacity;
  for (let i = 1; i < readings.length; i++) {
    ewma = alpha * readings[i].capacity + (1 - alpha) * ewma;
  }

  // Linear trend: slope from first to last reading
  const first = readings[0].capacity;
  const last = readings[readings.length - 1].capacity;
  const slopePerReading = (last - first) / (readings.length - 1);

  // Project forward: each reading is ~2 min apart, forecast is 15 min = ~7.5 readings
  const stepsAhead = FORECAST_MINUTES / 2;
  const projected = Math.max(0.04, Math.min(0.97, ewma + slopePerReading * stepsAhead));
  const projectedWait = Math.max(1, Math.round(projected * 22));

  const trend = slopePerReading > 0.015 ? 'rising'
              : slopePerReading < -0.015 ? 'falling'
              : 'stable';

  return {
    predictedCapacity: Math.round(projected * 100) / 100,
    predictedWait: projectedWait,
    trend,
    confidence: readings.length >= 6 ? 'high' : 'low',
  };
}

/**
 * Get forecasts for all zones.
 * Returns a map: { [zoneId]: ForecastResult }
 */
async function getAllForecasts(zones) {
  const results = await Promise.all(
    zones.map(async z => ({ id: z.id, forecast: await getForecast(z.id) }))
  );
  return Object.fromEntries(results.map(r => [r.id, r.forecast]));
}

module.exports = { recordSnapshot, getForecast, getAllForecasts };
