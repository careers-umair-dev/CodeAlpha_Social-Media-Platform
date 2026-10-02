const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: [true, 'Comment text is required'], trim: true, maxlength: [300, 'Comment cannot exceed 300 characters'] },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CommentSchema.index({ post: 1, createdAt: -1 });
CommentSchema.index({ author: 1 });

module.exports = mongoose.model('Comment', CommentSchema);
