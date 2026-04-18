/**
 * @fileoverview Request ID middleware for VenueIQ API.
 * Assigns a unique UUID to every incoming request for log correlation
 * and distributed tracing across services.
 * @module requestId
 */

const { randomUUID } = require('crypto');

/** @type {RegExp} UUID v4 validation pattern */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Assigns X-Request-ID header to every request.
 * Uses client-provided ID if present and valid UUID v4 format,
 * otherwise generates a fresh one. Enables log correlation
 * between frontend and backend services.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
function requestId(req, res, next) {
  const clientId = req.headers['x-request-id'];
  const id = (clientId && UUID_PATTERN.test(clientId)) ? clientId : randomUUID();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}

module.exports = { requestId };
