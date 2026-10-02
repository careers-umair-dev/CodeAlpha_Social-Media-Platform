const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Bookmark = require('../models/Bookmark');
const Follow = require('../models/Follow');
const Media = require('../models/Media');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { validatePostContent } = require('../utils/validators');
const { extractHashtags, mediaIdFromPath, parsePagination } = require('../utils/helpers');
const { hydratePosts, populateAuthor, removeMediaByPath, deletePostsCascade } = require('../services/postService');
const { notify, unnotify } = require('../services/notificationService');

/** Confirms an image path is an upload owned by this user and not already attached to another post/avatar. */
async function assertOwnedMedia(path, userId, { exceptPostId } = {}) {
  const id = mediaIdFromPath(path);
  if (!id) throw new ApiError(422, 'Invalid image', { image: 'Invalid image.' });
  const media = await Media.findOne({ _id: id, owner: userId }).select('_id');
  if (!media) throw new ApiError(422, 'Image not found. Please upload it again.', { image: 'Image not found.' });
  const inUse = await Post.exists({ image: path, ...(exceptPostId ? { _id: { $ne: exceptPostId } } : {}) });
  if (inUse) throw new ApiError(422, 'That image is already used by another post. Please upload it again.', { image: 'Image already in use.' });
}

const findPostOr404 = async (id) => {
  const post = await Post.findById(id);
  if (!post) throw new ApiError(404, 'This post no longer exists');
  return post;
};

// POST /api/posts
const createPost = asyncHandler(async (req, res) => {
  const image = typeof req.body.image === 'string' ? req.body.image.trim() : '';
  const content = validatePostContent(req.body.content, { required: !image });
  if (image) await assertOwnedMedia(image, req.user._id);

  const post = await Post.create({ author: req.user._id, content, image, hashtags: extractHashtags(content) });
  await post.populate('author', 'name username profileImage');
  const [hydrated] = await hydratePosts([post], req.user._id);
  res.status(201).json({ success: true, message: 'Post published', post: hydrated });
});

const RANK_POOL = 150;

/** "For You": recent posts ranked by engagement with time decay, boosted for people you follow. */
async function rankedFeed(viewerId, { page, limit }) {
  const candidates = await populateAuthor(Post.find().sort({ createdAt: -1 }).limit(RANK_POOL));
  const following = viewerId ? new Set((await Follow.find({ follower: viewerId }).select('following')).map((f) => String(f.following))) : new Set();
  const now = Date.now();
  const scored = candidates
    .filter((p) => p.author)
    .map((p) => {
      const ageH = (now - p.createdAt.getTime()) / 36e5;
      const engagement = 1 + p.likesCount + p.commentsCount * 2;
      const boost = following.has(String(p.author._id)) ? 1.6 : String(p.author._id) === String(viewerId) ? 1.2 : 1;
      return { p, score: (engagement * boost) / Math.pow(ageH + 2, 1.35) };
    })
    .sort((a, b) => b.score - a.score);
  const start = (page - 1) * limit;
  const slice = scored.slice(start, start + limit).map((s) => s.p);
  return { posts: slice, hasMore: start + limit < scored.length };
}

// GET /api/posts?feed=foryou|following|latest&page=&limit=
const getFeed = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 30 });
  const feed = ['foryou', 'following', 'latest'].includes(req.query.feed) ? req.query.feed : 'latest';
  const viewerId = req.user ? req.user._id : null;

  if (feed === 'following' && !viewerId) throw new ApiError(401, 'Log in to see posts from people you follow');

  let posts;
  let hasMore;
  if (feed === 'foryou') {
    ({ posts, hasMore } = await rankedFeed(viewerId, { page, limit }));
  } else {
    let filter = {};
    if (feed === 'following') {
      const ids = (await Follow.find({ follower: viewerId }).select('following')).map((f) => f.following);
      filter = { author: { $in: [...ids, viewerId] } };
    }
    const rows = await populateAuthor(Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit + 1));
    hasMore = rows.length > limit;
    posts = rows.slice(0, limit);
  }

  res.json({ success: true, feed, page, hasMore, posts: await hydratePosts(posts, viewerId) });
});

// GET /api/posts/trending
const getTrending = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const rows = await Post.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $unwind: '$hashtags' },
    { $group: { _id: '$hashtags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 6 },
  ]);
  res.json({ success: true, tags: rows.map((r) => ({ tag: r._id, count: r.count })) });
});

// GET /api/posts/saved
const getSaved = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 30 });
  const bookmarks = await Bookmark.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit + 1);
  const hasMore = bookmarks.length > limit;
  const page_ = bookmarks.slice(0, limit);
  const posts = await populateAuthor(Post.find({ _id: { $in: page_.map((b) => b.post) } }));
  const byId = new Map(posts.map((p) => [String(p._id), p]));
  const ordered = page_.map((b) => byId.get(String(b.post))).filter(Boolean);
  // Clean up bookmarks whose post disappeared
  const missing = page_.filter((b) => !byId.has(String(b.post))).map((b) => b._id);
  if (missing.length) await Bookmark.deleteMany({ _id: { $in: missing } });
  res.json({ success: true, page, hasMore, posts: await hydratePosts(ordered, req.user._id) });
});

// GET /api/posts/:id
const getPostById = asyncHandler(async (req, res) => {
  const post = await populateAuthor(Post.findById(req.params.id));
  if (!post || !post.author) throw new ApiError(404, 'This post no longer exists');
  const [hydrated] = await hydratePosts([post], req.user && req.user._id);
  res.json({ success: true, post: hydrated });
});

// PUT /api/posts/:id   { content?, image? ('' removes) }
const updatePost = asyncHandler(async (req, res) => {
  const post = await findPostOr404(req.params.id);
  if (String(post.author) !== String(req.user._id)) throw new ApiError(403, 'You can only edit your own posts');

  const oldImage = post.image;
  let newImage = oldImage;
  if (req.body.image !== undefined) {
    newImage = typeof req.body.image === 'string' ? req.body.image.trim() : '';
    if (newImage && newImage !== oldImage) await assertOwnedMedia(newImage, req.user._id, { exceptPostId: post._id });
  }
  const content = req.body.content !== undefined
    ? validatePostContent(req.body.content, { required: !newImage })
    : post.content;
  if (!content && !newImage) throw new ApiError(422, 'A post needs text or an image', { content: 'Write something or add an image.' });

  const changed = content !== post.content || newImage !== oldImage;
  post.content = content;
  post.image = newImage;
  post.hashtags = extractHashtags(content);
  if (changed) post.editedAt = new Date();
  await post.save();
  if (oldImage && oldImage !== newImage) await removeMediaByPath(oldImage);

  await post.populate('author', 'name username profileImage');
  const [hydrated] = await hydratePosts([post], req.user._id);
  res.json({ success: true, message: 'Post updated', post: hydrated });
});

// DELETE /api/posts/:id
const deletePost = asyncHandler(async (req, res) => {
  const post = await findPostOr404(req.params.id);
  if (String(post.author) !== String(req.user._id)) throw new ApiError(403, 'You can only delete your own posts');
  await deletePostsCascade([post]);
  res.json({ success: true, message: 'Post deleted' });
});

// POST /api/posts/:id/like  and  DELETE /api/posts/:id/like  (idempotent, atomic)
const setLike = (shouldLike) => asyncHandler(async (req, res) => {
  const uid = req.user._id;
  const update = shouldLike
    ? { $addToSet: { likes: uid }, $inc: { likesCount: 1 } }
    : { $pull: { likes: uid }, $inc: { likesCount: -1 } };
  const filter = shouldLike ? { _id: req.params.id, likes: { $ne: uid } } : { _id: req.params.id, likes: uid };

  // The filter makes this atomic + idempotent: it only matches when the state actually changes.
  const result = await Post.updateOne(filter, update);
  const changed = result.modifiedCount > 0;
  const post = await Post.findById(req.params.id).select('author likesCount');
  if (!post) throw new ApiError(404, 'This post no longer exists');

  if (changed) {
    if (shouldLike) await notify({ recipient: post.author, actor: uid, type: 'like', post: post._id });
    else await unnotify({ recipient: post.author, actor: uid, type: 'like', post: post._id });
  }
  res.json({ success: true, liked: shouldLike, likesCount: post.likesCount });
});

// POST/DELETE /api/posts/:id/save
const setSaved = (shouldSave) => asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id).select('_id');
  if (!post) throw new ApiError(404, 'This post no longer exists');
  if (shouldSave) {
    await Bookmark.updateOne({ user: req.user._id, post: post._id }, { $setOnInsert: { user: req.user._id, post: post._id } }, { upsert: true });
  } else {
    await Bookmark.deleteOne({ user: req.user._id, post: post._id });
  }
  res.json({ success: true, saved: shouldSave, message: shouldSave ? 'Saved to your bookmarks' : 'Removed from saved' });
});

module.exports = {
  createPost, getFeed, getTrending, getSaved, getPostById, updatePost, deletePost,
  like: setLike(true), unlike: setLike(false), save: setSaved(true), unsave: setSaved(false),
};
