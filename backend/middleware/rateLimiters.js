const rateLimit = require('express-rate-limit');

const json = (message) => ({ success: false, message });
const limit = (windowMs, max, message) =>
  rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: json(message), skip: () => process.env.RATE_LIMIT_DISABLED === 'true' });

module.exports = {
  apiLimiter: limit(60 * 1000, 300, 'Too many requests. Please slow down.'),
  authLimiter: limit(15 * 60 * 1000, 30, 'Too many attempts. Please try again in a few minutes.'),
  uploadLimiter: limit(60 * 1000, 20, 'Too many uploads. Please wait a moment.'),
};
