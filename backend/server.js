require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const loadConfig = require('./config/env');
const connectDB = require('./config/db');
const { apiLimiter } = require('./middleware/rateLimiters');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

let config;
try { config = loadConfig(); } catch (err) { console.error(`\nConfiguration error: ${err.message}\n`); process.exit(1); }
const app = express();

app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy); // needed for correct client IPs behind Render/Vercel/Nginx

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'connect-src': ["'self'", ...config.corsOrigins],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': config.isProd ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

// CORS: allow explicit origins; in development also allow any localhost port (e.g. a separate static server).
const devOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(
  '/api',
  cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) || (!config.isProd && devOrigin.test(origin))),
    maxAge: 600,
  })
);

// Only the upload route gets a large body limit; everything else is capped at 100 KB.
app.use('/api/media', express.json({ limit: '4mb' }));
app.use(express.json({ limit: '100kb' }));

if (process.env.LOG_REQUESTS !== 'false' && process.env.NODE_ENV !== 'test') {
  app.use('/api', (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => console.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - start}ms`));
    next();
  });
}

app.get('/api/health', (req, res) =>
  res.json({ success: true, message: 'API is running', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' })
);

// Ensure the database is connected before any API work (also makes serverless cold starts safe).
app.use('/api', apiLimiter, async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    res.status(503).json({ success: false, message: 'The service is temporarily unavailable. Please try again shortly.' });
  }
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/comments', require('./routes/commentRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/search', require('./routes/searchRoutes'));
app.use('/api/media', require('./routes/mediaRoutes'));

app.use('/api', notFoundHandler);

// Serve the static frontend from the same origin (no CORS setup needed, simplest deployment).
if (config.serveFrontend) {
  const frontendDir = path.join(__dirname, '..', 'frontend');
  app.use(express.static(frontendDir, { extensions: ['html'], maxAge: config.isProd ? '1h' : 0 }));
  app.get('/', (req, res) => res.redirect('/index.html'));
}

app.use(errorHandler);

module.exports = app;
module.exports.config = config;

if (require.main === module) {
  connectDB()
    .then(() => {
      const server = app.listen(config.port, () => console.log(`MiniSocial running on http://localhost:${config.port}`));
      server.on('error', (err) => {
        console.error(err.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Stop the other process or set a different PORT in .env.` : `Server error: ${err.message}`);
        process.exit(1);
      });
      const shutdown = () => server.close(() => mongoose.connection.close().then(() => process.exit(0)));
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    })
    .catch((err) => {
      console.error(`MongoDB connection error: ${err.message}`);
      process.exit(1);
    });
}
