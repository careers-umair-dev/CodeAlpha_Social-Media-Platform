const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, default: '', trim: true, maxlength: [500, 'Post cannot exceed 500 characters'] },
    image: { type: String, default: '' }, // /api/media/:id
    hashtags: { type: [String], default: [] },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    likesCount: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

PostSchema.pre('validate', function (next) {
  if (!this.content && !this.image) this.invalidate('content', 'A post needs text or an image');
  next();
});

PostSchema.index({ createdAt: -1 });
PostSchema.index({ author: 1, createdAt: -1 });
PostSchema.index({ hashtags: 1, createdAt: -1 });

module.exports = mongoose.model('Post', PostSchema);
