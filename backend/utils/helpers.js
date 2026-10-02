const ApiError = require('./ApiError');

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const MEDIA_PATH_RE = /^\/api\/media\/([a-f0-9]{24})$/i;
const HASHTAG_RE = /(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{1,30})/gu;

const isObjectId = (v) => typeof v === 'string' && OBJECT_ID_RE.test(v);
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mediaPath = (id) => `/api/media/${id}`;
const mediaIdFromPath = (p) => {
  const m = typeof p === 'string' ? p.match(MEDIA_PATH_RE) : null;
  return m ? m[1] : null;
};

/** Reads ?page & ?limit safely. */
function parsePagination(query, { defaultLimit = 10, maxLimit = 30 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

/** Unique, lowercase hashtags (max 10) found in a piece of text. */
function extractHashtags(text = '') {
  const tags = new Set();
  for (const match of String(text).matchAll(HASHTAG_RE)) {
    tags.add(match[1].toLowerCase());
    if (tags.size >= 10) break;
  }
  return [...tags];
}

/** Express param guard: rejects malformed ObjectIds with a 400 instead of a CastError. */
const validateObjectId = (...params) => (req, res, next) => {
  for (const name of params) {
    if (!isObjectId(req.params[name])) return next(new ApiError(400, 'Invalid id'));
  }
  next();
};

module.exports = {
  isObjectId,
  escapeRegex,
  mediaPath,
  mediaIdFromPath,
  parsePagination,
  extractHashtags,
  validateObjectId,
};
