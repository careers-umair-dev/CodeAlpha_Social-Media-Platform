const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { parsePagination } = require('../utils/helpers');

// GET /api/notifications?page=&unread=true
const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const filter = { recipient: req.user._id };
  if (req.query.unread === 'true') filter.read = false;
  const [rows, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit + 1)
      .populate('actor', 'name username profileImage')
      .populate('post', 'content image'),
    Notification.countDocuments({ recipient: req.user._id, read: false }),
  ]);
  const notifications = rows.slice(0, limit).filter((n) => n.actor).map((n) => ({
    _id: n._id, type: n.type, read: n.read, text: n.text, actor: n.actor,
    post: n.post ? { _id: n.post._id, content: n.post.content.slice(0, 80), image: n.post.image } : null,
    createdAt: n.updatedAt,
  }));
  res.json({ success: true, page, hasMore: rows.length > limit, unreadCount, notifications });
});

// GET /api/notifications/unread-count
const unreadCount = asyncHandler(async (req, res) => {
  res.json({ success: true, unreadCount: await Notification.countDocuments({ recipient: req.user._id, read: false }) });
});

// PATCH /api/notifications/:id/read
const markRead = asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { read: true }, { new: true });
  if (!n) throw new ApiError(404, 'Notification not found');
  res.json({ success: true, unreadCount: await Notification.countDocuments({ recipient: req.user._id, read: false }) });
});

// POST /api/notifications/read-all
const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ recipient: req.user._id, read: false }, { read: true });
  res.json({ success: true, unreadCount: 0, message: 'All caught up' });
});

// DELETE /api/notifications
const clearAll = asyncHandler(async (req, res) => {
  await Notification.deleteMany({ recipient: req.user._id });
  res.json({ success: true, unreadCount: 0, message: 'Notifications cleared' });
});

module.exports = { list, unreadCount, markRead, markAllRead, clearAll };
