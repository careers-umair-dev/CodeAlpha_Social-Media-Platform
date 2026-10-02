const Comment = require('../models/Comment');
const Post = require('../models/Post');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { validateCommentText } = require('../utils/validators');
const { parsePagination } = require('../utils/helpers');
const { AUTHOR_FIELDS } = require('../services/postService');
const { notify } = require('../services/notificationService');
const Notification = require('../models/Notification');

// POST /api/posts/:postId/comments
const addComment = asyncHandler(async (req, res) => {
  const text = validateCommentText(req.body.text);
  const bumped = await Post.updateOne({ _id: req.params.postId }, { $inc: { commentsCount: 1 } });
  if (!bumped.matchedCount) throw new ApiError(404, 'This post no longer exists');
  const post = await Post.findById(req.params.postId).select('author commentsCount');

  const comment = await Comment.create({ post: post._id, author: req.user._id, text });
  await comment.populate('author', AUTHOR_FIELDS);
  await notify({ recipient: post.author, actor: req.user._id, type: 'comment', post: post._id, comment: comment._id, text });
  res.status(201).json({ success: true, message: 'Comment added', comment, commentsCount: post.commentsCount });
});

// GET /api/posts/:postId/comments?page=
const getComments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const post = await Post.findById(req.params.postId).select('_id author');
  if (!post) throw new ApiError(404, 'This post no longer exists');
  const rows = await Comment.find({ post: post._id }).populate('author', AUTHOR_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(limit + 1);
  res.json({
    success: true, page, hasMore: rows.length > limit, postAuthor: post.author,
    comments: rows.slice(0, limit).filter((c) => c.author),
  });
});

// PUT /api/comments/:id  (author only)
const updateComment = asyncHandler(async (req, res) => {
  const text = validateCommentText(req.body.text);
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw new ApiError(404, 'This comment no longer exists');
  if (String(comment.author) !== String(req.user._id)) throw new ApiError(403, 'You can only edit your own comments');
  if (text !== comment.text) {
    comment.text = text;
    comment.editedAt = new Date();
    await comment.save();
    await Notification.updateMany({ comment: comment._id }, { text: text.slice(0, 120) });
  }
  await comment.populate('author', AUTHOR_FIELDS);
  res.json({ success: true, message: 'Comment updated', comment });
});

// DELETE /api/comments/:id  (comment author or the post's author)
const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw new ApiError(404, 'This comment no longer exists');
  const post = await Post.findById(comment.post).select('author');
  const isAuthor = String(comment.author) === String(req.user._id);
  const isPostOwner = post && String(post.author) === String(req.user._id);
  if (!isAuthor && !isPostOwner) throw new ApiError(403, 'You can only delete your own comments');

  await comment.deleteOne();
  let commentsCount = 0;
  if (post) {
    await Post.updateOne({ _id: post._id, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } });
    commentsCount = (await Post.findById(post._id).select('commentsCount')).commentsCount;
    await Notification.deleteMany({ comment: comment._id }); // don't leave a notification pointing at nothing
  }
  res.json({ success: true, message: 'Comment deleted', commentsCount });
});

module.exports = { addComment, getComments, updateComment, deleteComment };
