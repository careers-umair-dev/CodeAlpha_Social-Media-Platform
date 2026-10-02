const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Follow = require('../models/Follow');
const Bookmark = require('../models/Bookmark');
const Notification = require('../models/Notification');
const Media = require('../models/Media');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { validateProfile, validateImageRef } = require('../utils/validators');
const { escapeRegex, mediaIdFromPath, parsePagination } = require('../utils/helpers');
const { sanitizeUser } = require('./authController');
const { hydratePosts, populateAuthor, removeMediaByPath, deletePostsCascade } = require('../services/postService');

const CARD_FIELDS = 'name username profileImage bio followersCount followingCount';

const findByUsername = async (username) => {
  const user = await User.findOne({ username: String(username).toLowerCase() });
  if (!user) throw new ApiError(404, 'User not found');
  return user;
};

/** Public view of a user (no email). */
const publicUser = (u) => ({
  _id: u._id, name: u.name, username: u.username, bio: u.bio, profileImage: u.profileImage,
  followersCount: u.followersCount, followingCount: u.followingCount, createdAt: u.createdAt,
});

/** Adds `isFollowing` to a list of user docs for the viewer. */
async function withFollowState(users, viewerId) {
  let set = new Set();
  if (viewerId && users.length) {
    const rows = await Follow.find({ follower: viewerId, following: { $in: users.map((u) => u._id) } }).select('following');
    set = new Set(rows.map((r) => String(r.following)));
  }
  return users.map((u) => ({ ...publicUser(u), isFollowing: set.has(String(u._id)), isSelf: viewerId ? String(u._id) === String(viewerId) : false }));
}

/** Shared by GET /users and the search endpoint. */
async function findUsers(search, limit, viewerId) {
  const term = typeof search === 'string' ? search.trim().slice(0, 50) : '';
  const filter = term ? { $or: [{ username: new RegExp(escapeRegex(term), 'i') }, { name: new RegExp(escapeRegex(term), 'i') }] } : {};
  const users = await User.find(filter).sort({ followersCount: -1, createdAt: -1 }).limit(limit).select(CARD_FIELDS);
  return withFollowState(users, viewerId);
}

// GET /api/users?search=&limit=
const getUsers = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
  res.json({ success: true, users: await findUsers(req.query.search, limit, req.user && req.user._id) });
});

// GET /api/users/suggestions
const getSuggestions = asyncHandler(async (req, res) => {
  const following = (await Follow.find({ follower: req.user._id }).select('following')).map((f) => f.following);
  const users = await User.find({ _id: { $nin: [...following, req.user._id] } }).sort({ followersCount: -1, createdAt: -1 }).limit(5).select(CARD_FIELDS);
  res.json({ success: true, users: await withFollowState(users, req.user._id) });
});

// GET /api/users/:username
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await findByUsername(req.params.username);
  const viewerId = req.user && req.user._id;
  const isSelf = !!viewerId && String(viewerId) === String(user._id);
  const [postsCount, follow, followsYou] = await Promise.all([
    Post.countDocuments({ author: user._id }),
    viewerId && !isSelf ? Follow.exists({ follower: viewerId, following: user._id }) : null,
    viewerId && !isSelf ? Follow.exists({ follower: user._id, following: viewerId }) : null,
  ]);
  res.json({
    success: true,
    user: { ...(isSelf ? sanitizeUser(user) : publicUser(user)), postsCount },
    isFollowing: !!follow,
    followsYou: !!followsYou,
    isOwnProfile: isSelf,
  });
});

// GET /api/users/:username/posts?page=&media=true
const getUserPosts = asyncHandler(async (req, res) => {
  const user = await findByUsername(req.params.username);
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 12, maxLimit: 30 });
  const filter = { author: user._id };
  if (req.query.media === 'true') filter.image = { $ne: '' };
  const rows = await populateAuthor(Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit + 1));
  res.json({ success: true, page, hasMore: rows.length > limit, posts: await hydratePosts(rows.slice(0, limit), req.user && req.user._id) });
});

// PUT /api/users/profile
const updateProfile = asyncHandler(async (req, res) => {
  const fields = validateProfile(req.body);
  const image = validateImageRef(req.body.profileImage);
  const user = await User.findById(req.user._id);

  if (image !== undefined && image !== user.profileImage) {
    const mid = mediaIdFromPath(image);
    if (mid && !(await Media.exists({ _id: mid, owner: user._id }))) {
      throw new ApiError(422, 'Photo not found. Please upload it again.', { profileImage: 'Photo not found.' });
    }
    await removeMediaByPath(user.profileImage);
    user.profileImage = image;
  }
  Object.assign(user, fields);
  await user.save();
  res.json({ success: true, message: 'Profile updated', user: sanitizeUser(user) });
});

const listFollows = (side) => asyncHandler(async (req, res) => {
  const user = await findByUsername(req.params.username);
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 30, maxLimit: 50 });
  const other = side === 'followers' ? 'follower' : 'following';
  const filter = side === 'followers' ? { following: user._id } : { follower: user._id };
  const rows = await Follow.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit + 1).populate(other, CARD_FIELDS);
  const users = rows.slice(0, limit).map((r) => r[other]).filter(Boolean);
  res.json({ success: true, page, hasMore: rows.length > limit, users: await withFollowState(users, req.user && req.user._id) });
});

// DELETE /api/users/me  { password }  — permanently removes the account and all its data
const deleteAccount = asyncHandler(async (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = await User.findById(req.user._id).select('+password');
  if (!password || !(await bcrypt.compare(password, user.password))) {
    throw new ApiError(422, 'Password is incorrect', { password: 'Password is incorrect.' });
  }
  const uid = user._id;

  await deletePostsCascade(await Post.find({ author: uid }));

  // comments this user wrote elsewhere -> fix counters
  const comments = await Comment.find({ author: uid }).select('post');
  const perPost = new Map();
  comments.forEach((c) => perPost.set(String(c.post), (perPost.get(String(c.post)) || 0) + 1));
  await Promise.all([...perPost].map(([pid, n]) => Post.updateOne({ _id: pid }, { $inc: { commentsCount: -n } })));
  await Comment.deleteMany({ author: uid });

  // likes given
  await Post.updateMany({ likes: uid }, { $pull: { likes: uid }, $inc: { likesCount: -1 } });

  // follow graph -> fix counters of the other side
  const [followers, following] = await Promise.all([Follow.find({ following: uid }).select('follower'), Follow.find({ follower: uid }).select('following')]);
  await Promise.all([
    followers.length ? User.updateMany({ _id: { $in: followers.map((f) => f.follower) } }, { $inc: { followingCount: -1 } }) : null,
    following.length ? User.updateMany({ _id: { $in: following.map((f) => f.following) } }, { $inc: { followersCount: -1 } }) : null,
  ]);
  await Follow.deleteMany({ $or: [{ follower: uid }, { following: uid }] });

  await Promise.all([
    Bookmark.deleteMany({ user: uid }),
    Notification.deleteMany({ $or: [{ recipient: uid }, { actor: uid }] }),
    Media.deleteMany({ owner: uid }),
  ]);
  await user.deleteOne();
  res.json({ success: true, message: 'Your account has been deleted' });
});

module.exports = { findUsers, getUsers, getSuggestions, getUserProfile, getUserPosts, updateProfile, getFollowers: listFollows('followers'), getFollowing: listFollows('following'), deleteAccount };
