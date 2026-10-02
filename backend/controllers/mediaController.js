const Media = require('../models/Media');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { mediaPath } = require('../utils/helpers');

const MAX_BYTES = 2.5 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/;

/** Verifies the real file signature so a renamed .exe can't pass as an image. */
function detectType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

// POST /api/media  { dataUrl }
const upload = asyncHandler(async (req, res) => {
  const match = typeof req.body.dataUrl === 'string' ? req.body.dataUrl.match(DATA_URL_RE) : null;
  if (!match) throw new ApiError(422, 'Please choose a JPG, PNG, WebP or GIF image');

  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (buffer.length > MAX_BYTES) throw new ApiError(413, 'Image is too large (max 2.5 MB)');
  const type = detectType(buffer);
  if (!type) throw new ApiError(422, 'That file is not a valid image');

  const media = await Media.create({ owner: req.user._id, contentType: type, size: buffer.length, data: buffer });
  res.status(201).json({ success: true, url: mediaPath(media._id), size: media.size });
});

// GET /api/media/:id
const serve = asyncHandler(async (req, res) => {
  const media = await Media.findById(req.params.id);
  if (!media) throw new ApiError(404, 'Image not found');
  res.set({
    'Content-Type': media.contentType,
    'Content-Length': media.size,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  res.send(media.data);
});

module.exports = { upload, serve };
