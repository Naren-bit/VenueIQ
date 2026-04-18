/**
 * @fileoverview Input sanitisation middleware for VenueIQ API.
 * Strips potentially dangerous characters from string inputs
 * before they reach business logic or are stored in Firebase.
 * @module sanitize
 */

const DANGEROUS_PATTERN = /<[^>]*>|javascript:|data:|on\w+=/gi;

/**
 * Sanitise a single string value by removing HTML tags,
 * javascript: URIs, data: URIs, and inline event handlers.
 *
 * @param {string} str - raw input string
 * @returns {string} sanitised string safe for storage and display
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(DANGEROUS_PATTERN, '').trim().slice(0, 1000);
}

/**
 * Express middleware that sanitises all string values in req.body.
 * Operates recursively on nested objects and arrays.
 * Applied globally in server.js before route handlers.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeDeep(req.body);
  }
  next();
}

/**
 * Recursively sanitise all string values in an object.
 *
 * @param {*} obj - input value (string, array, object, or primitive)
 * @returns {*} sanitised value with all strings cleaned
 */
function sanitizeDeep(obj) {
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeDeep);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, sanitizeDeep(v)])
    );
  }
  return obj;
}

module.exports = { sanitizeBody, sanitizeString };
