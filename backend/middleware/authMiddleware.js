const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { unauthorized } = require('../utils/ApiError');

function readToken(req) {
  const h = req.headers.authorization;
  return h && h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function resolveUser(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  const user = await User.findById(decoded.id).select('+tokenVersion');
  if (!user || (user.tokenVersion || 0) !== (decoded.tv || 0)) return null;
  return user;
}

/** Requires a valid token whose session has not been revoked. */
const protect = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return next(unauthorized('Please log in to continue'));
  try {
    const user = await resolveUser(token);
    if (!user) return next(unauthorized('Your session has ended. Please log in again.'));
    req.user = user;
    next();
  } catch (_) {
    next(unauthorized('Your session has expired. Please log in again.'));
  }
};

/** Attaches req.user when a valid token is present; otherwise continues anonymously. */
const optionalAuth = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return next();
  try {
    const user = await resolveUser(token);
    if (user) req.user = user;
  } catch (_) { /* treat as anonymous */ }
  next();
};

module.exports = { protect, optionalAuth };
