const User = require('../models/User');
const Post = require('../models/Post');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { escapeRegex, parsePagination } = require('../utils/helpers');
const { hydratePosts, populateAuthor } = require('../services/postService');
const { findUsers } = require('./userController');

// GET /api/search?q=&type=all|users|posts&page=
// "#tag" searches hashtags. Users are only searched on page 1.
const search = asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
  if (q.length < 2) throw new ApiError(422, 'Type at least 2 characters to search');
  const type = ['users', 'posts'].includes(req.query.type) ? req.query.type : 'all';
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 20 });
  const viewerId = req.user && req.user._id;

  const out = { success: true, query: q, page };

  if ((type === 'all' || type === 'users') && page === 1 && !q.startsWith('#')) {
    out.users = await findUsers(q, type === 'users' ? 20 : 5, viewerId);
  }

  if (type === 'all' || type === 'posts') {
    const tag = q.startsWith('#') ? q.slice(1).toLowerCase() : null;
    const filter = tag ? { hashtags: tag } : { content: new RegExp(escapeRegex(q), 'i') };
    const rows = await populateAuthor(Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit + 1));
    out.posts = await hydratePosts(rows.slice(0, limit), viewerId);
    out.hasMore = rows.length > limit;
  }
  res.json(out);
});

module.exports = { search };
