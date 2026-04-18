/**
 * @fileoverview Google Cloud Storage integration for VenueIQ.
 * Stores versioned zone snapshots for historical crowd pattern analysis.
 * Uses Firebase Storage (backed by Google Cloud Storage) for seamless
 * integration with the existing Firebase Admin SDK.
 * @module storage
 */

const { getStorage } = require('firebase-admin/storage');

/**
 * Upload a JSON snapshot of zone data to Cloud Storage.
 * Creates a versioned backup: snapshots/zones-{timestamp}.json
 * Called by heatmapScheduler every 10 ticks (~20 min).
 * Enables historical crowd pattern analysis.
 *
 * @param {Array<{id: string, name: string, capacity: number, wait: number}>} zones - current zone array
 * @returns {Promise<string|null>} filename path or null if bucket is unavailable
 */
async function uploadZoneSnapshot(zones) {
  try {
    const bucket = getStorage().bucket();
    const filename = `snapshots/zones-${Date.now()}.json`;
    const file = bucket.file(filename);
    await file.save(JSON.stringify({ zones, timestamp: Date.now() }, null, 2), {
      contentType: 'application/json',
      metadata: { cacheControl: 'no-cache' },
    });
    console.log(`[Storage] Zone snapshot saved: ${filename}`);
    return filename;
  } catch (err) {
    console.warn('[Storage] Upload skipped (bucket not configured):', err.message);
    return null;
  }
}

/**
 * List recent zone snapshots for historical analysis.
 * Returns an array of file paths sorted newest-first.
 *
 * @param {number} [limit=10] - max number of files to return
 * @returns {Promise<string[]>} array of snapshot file paths
 */
async function listSnapshots(limit = 10) {
  try {
    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: 'snapshots/', maxResults: limit });
    return files.map(f => f.name).reverse();
  } catch {
    return [];
  }
}

module.exports = { uploadZoneSnapshot, listSnapshots };
