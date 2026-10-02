const mongoose = require('mongoose');

const BookmarkSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  },
  { timestamps: true }
);

BookmarkSchema.index({ user: 1, post: 1 }, { unique: true });
BookmarkSchema.index({ user: 1, createdAt: -1 });
BookmarkSchema.index({ post: 1 });

module.exports = mongoose.model('Bookmark', BookmarkSchema);
