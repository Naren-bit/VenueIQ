/**
 * @fileoverview VenueIQ Express server entry point.
 * Initialises middleware, API routes, Socket.IO WebSocket server,
 * and background schedulers for crowd intelligence.
 * @module server
 */

/**
 * VenueIQ addresses the PromptWars challenge:
 * "Design a solution that improves the physical event experience for attendees
 * at large-scale sporting venues. The system should address challenges such as
 * crowd movement, waiting times, and real-time coordination."
 *
 * Architecture decision: persistent Express + Socket.IO server (not serverless)
 * is essential for WebSocket connections and scheduled crowd analysis — things
 * that Cloud Functions cannot sustain for real-time stadium operations.
 */

require('dotenv').config();

// ===== Validate required environment variables on startup =====
const REQUIRED_ENV = ['GEMINI_API_KEY', 'FIREBASE_DATABASE_URL'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`[Boot] Missing required environment variables: ${missing.join(', ')}`);
  console.error('[Boot] Copy .env.example to .env and fill in your values.');
  process.exit(1);
}

const path = require('path');
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

const chatRouter      = require('./routes/chat');
const zonesRouter     = require('./routes/zones');
const alertsRouter    = require('./routes/alerts');
const reportsRouter   = require('./routes/reports');
const meetupRouter    = require('./routes/meetup');
const dashboardRouter = require('./routes/dashboard');
const simulateRouter  = require('./routes/simulate');

const { startHeatmapScheduler } = require('./services/heatmapScheduler');
const { startAlertScheduler }   = require('./services/alertScheduler');
const { initFirebase }          = require('./services/firebase');
const { errorHandler }          = require('./middleware/errorHandler');
const { requestLogger }         = require('./middleware/requestLogger');
const { requestId }             = require('./middleware/requestId');
const { sanitizeBody }          = require('./middleware/sanitize');

// ===== Express App =====
const app        = express();
const httpServer = createServer(app);

// ===== Socket.IO =====
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST'] }
});
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // Join meetup room if client provides a code
  socket.on('meetup:join', (code) => {
    socket.join(`meetup:${code}`);
    console.log(`[WS] ${socket.id} joined meetup room: ${code}`);
  });

  socket.on('disconnect', () => console.log(`[WS] Client disconnected: ${socket.id}`));
});

// ===== Middleware =====
app.use(requestId);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        'https://www.gstatic.com',
        'https://www.googletagmanager.com',
        'https://maps.googleapis.com',
        'https://cdnjs.cloudflare.com',
        'https://cdn.socket.io',
        'https://unpkg.com',
        "'unsafe-inline'",
      ],
      connectSrc: [
        "'self'",
        'http://localhost:*',
        'ws://localhost:*',
        'https://venueiq-8w9e.onrender.com',
        'wss://venueiq-8w9e.onrender.com',
        'https://*.firebaseio.com',
        'wss://*.firebaseio.com',
        'https://generativelanguage.googleapis.com',
        'https://maps.googleapis.com',
        'https://www.google-analytics.com',
        'https://www.googletagmanager.com',
      ],
      imgSrc: ["'self'", 'data:', 'https://maps.gstatic.com', 'https://*.googleapis.com', 'https://*.openstreetmap.org'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      styleSrc: ["'self'", 'https://fonts.googleapis.com', 'https://unpkg.com', "'unsafe-inline'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      upgradeInsecureRequests: [],
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false,
  crossOriginEmbedderPolicy: false, // needed for Google Maps tiles
}));
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '5mb' }));
app.use(sanitizeBody);
app.use(requestLogger);

// Rate limiting
const limiter     = rateLimit({ windowMs: 60000, max: 60,  message: { error: 'Too many requests.' } });
const chatLimiter = rateLimit({ windowMs: 60000, max: 20,  message: { error: 'Chat rate limit reached.' } });
const opsLimiter  = rateLimit({ windowMs: 60000, max: 120, message: { error: 'Rate limit reached.' } });
app.use('/api/', limiter);
app.use('/api/chat', chatLimiter);
app.use('/api/dashboard', opsLimiter);

// ===== API Routes =====
app.use('/api/chat',      chatRouter);
app.use('/api/zones',     zonesRouter);
app.use('/api/alerts',    alertsRouter);
app.use('/api/reports',   reportsRouter);
app.use('/api/meetup',    meetupRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/simulate',  simulateRouter);

// Health check endpoint
app.get('/health', (req, res) => res.json({
  status:    'ok',
  uptime:    Math.floor(process.uptime()),
  timestamp: new Date().toISOString(),
  version:   require('../package.json').version,
  wsClients: io.engine ? io.engine.clientsCount : 0,
}));

// ===== Error Handler (must be before static fallback for API errors) =====
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});
app.use(errorHandler);

// ===== Serve Frontend (public/ directory) =====
const publicPath = path.join(__dirname, '..', '..', 'public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// ===== Boot Sequence =====
const PORT = process.env.PORT || 3001;

/**
 * Boot the server: initialize Firebase, start schedulers, listen on PORT.
 *
 * @returns {Promise<void>}
 * @throws {Error} if Firebase initialization fails
 */
async function boot() {
  try {
    await initFirebase();
    console.log('[Firebase] Connected');
    startHeatmapScheduler(io);
    startAlertScheduler(io);
    console.log('[Schedulers] Running');
    httpServer.listen(PORT, () => console.log(`[Server] VenueIQ running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('[Boot] Fatal:', err);
    process.exit(1);
  }
}

// ===== Graceful Error Handling =====
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

// Export for testing (supertest needs the app without listening)
module.exports = { app, httpServer, boot };

// Only boot if run directly (not imported by tests)
if (require.main === module) {
  boot();
}
