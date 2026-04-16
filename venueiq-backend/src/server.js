// src/server.js

require('dotenv').config();
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

const { startHeatmapScheduler } = require('./services/heatmapScheduler');
const { startAlertScheduler }   = require('./services/alertScheduler');
const { initFirebase }          = require('./services/firebase');
const { errorHandler }          = require('./middleware/errorHandler');
const { requestLogger }         = require('./middleware/requestLogger');

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
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '50kb' }));
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

// Health check endpoint
app.get('/health', (req, res) => res.json({
  status:    'ok',
  uptime:    Math.floor(process.uptime()),
  timestamp: new Date().toISOString(),
  version:   require('../package.json').version,
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
