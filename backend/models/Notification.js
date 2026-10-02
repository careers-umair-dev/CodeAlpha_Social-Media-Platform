const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['follow', 'like', 'comment'], required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
    comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
    text: { type: String, default: '', maxlength: 120 }, // comment preview
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipient: 1, updatedAt: -1 });
NotificationSchema.index({ recipient: 1, read: 1 });
NotificationSchema.index({ actor: 1, type: 1, post: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);
