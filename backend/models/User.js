const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: [50, 'Name cannot exceed 50 characters'] },
    username: {
      type: String, required: [true, 'Username is required'], unique: true, trim: true, lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'], maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-z0-9_]+$/, 'Username can only contain letters, numbers and underscores'],
    },
    email: { type: String, required: [true, 'Email is required'], unique: true, trim: true, lowercase: true, maxlength: 254 },
    password: { type: String, required: true, select: false },
    bio: { type: String, default: '', maxlength: [160, 'Bio cannot exceed 160 characters'] },
    profileImage: { type: String, default: '' },
    followersCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
    // Bumped on password change / "log out everywhere" to invalidate every issued JWT.
    tokenVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true }
);

UserSchema.index({ followersCount: -1, createdAt: -1 });

module.exports = mongoose.model('User', UserSchema);
