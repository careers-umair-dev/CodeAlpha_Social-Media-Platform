const Follow = require('../models/Follow');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { notify, unnotify } = require('../services/notificationService');

const target = async (username) => {
  const user = await User.findOne({ username: String(username).toLowerCase() }).select('username followersCount');
  if (!user) throw new ApiError(404, 'User not found');
  return user;
};

// POST /api/users/:username/follow  (idempotent)
const followUser = asyncHandler(async (req, res) => {
  const user = await target(req.params.username);
  if (String(user._id) === String(req.user._id)) throw new ApiError(400, 'You cannot follow yourself');

  const result = await Follow.updateOne(
    { follower: req.user._id, following: user._id },
    { $setOnInsert: { follower: req.user._id, following: user._id } },
    { upsert: true }
  );
  const created = result.upsertedCount > 0;
  if (created) {
    await Promise.all([
      User.updateOne({ _id: user._id }, { $inc: { followersCount: 1 } }),
      User.updateOne({ _id: req.user._id }, { $inc: { followingCount: 1 } }),
    ]);
    await notify({ recipient: user._id, actor: req.user._id, type: 'follow' });
  }
  const [t, me] = await Promise.all([User.findById(user._id).select('followersCount'), User.findById(req.user._id).select('followingCount')]);
  res.json({ success: true, following: true, message: `You're now following @${user.username}`, followersCount: t.followersCount, followingCount: me.followingCount });
});

// DELETE /api/users/:username/follow  (idempotent)
const unfollowUser = asyncHandler(async (req, res) => {
  const user = await target(req.params.username);
  if (String(user._id) === String(req.user._id)) throw new ApiError(400, 'You cannot unfollow yourself');

  const removed = await Follow.findOneAndDelete({ follower: req.user._id, following: user._id });
  if (removed) {
    await Promise.all([
      User.updateOne({ _id: user._id, followersCount: { $gt: 0 } }, { $inc: { followersCount: -1 } }),
      User.updateOne({ _id: req.user._id, followingCount: { $gt: 0 } }, { $inc: { followingCount: -1 } }),
    ]);
    await unnotify({ recipient: user._id, actor: req.user._id, type: 'follow' });
  }
  const [t, me] = await Promise.all([User.findById(user._id).select('followersCount'), User.findById(req.user._id).select('followingCount')]);
  res.json({ success: true, following: false, message: `You unfollowed @${user.username}`, followersCount: t.followersCount, followingCount: me.followingCount });
});

module.exports = { followUser, unfollowUser };
