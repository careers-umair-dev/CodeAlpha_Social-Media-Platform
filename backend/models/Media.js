const mongoose = require('mongoose');

/** Uploaded images live in MongoDB so the app works on read-only/serverless hosts with no disk. */
const MediaSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Media', MediaSchema);
