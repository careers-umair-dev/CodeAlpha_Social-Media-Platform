/**
 * One-off, idempotent upgrade for databases created by the ORIGINAL Mini Social Media project.
 *  - recalculates likesCount / commentsCount / hashtags on posts
 *  - recalculates followersCount / followingCount on users
 *  - creates the new indexes
 * Safe to run more than once.   Usage:  npm run migrate
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Follow = require('../models/Follow');
const Bookmark = require('../models/Bookmark');
const Notification = require('../models/Notification');
const Media = require('../models/Media');
const { extractHashtags } = require('../utils/helpers');

(async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to', mongoose.connection.name);

  // Posts: counters + hashtags
  const commentCounts = new Map();
  for (const c of await Comment.find().select('post')) commentCounts.set(String(c.post), (commentCounts.get(String(c.post)) || 0) + 1);
  let posts = 0;
  for await (const p of Post.find()) {
    const likesCount = new Set((p.likes || []).map(String)).size;
    const commentsCount = commentCounts.get(String(p._id)) || 0;
    const hashtags = extractHashtags(p.content);
    const changed = p.likesCount !== likesCount || p.commentsCount !== commentsCount || (p.hashtags || []).join() !== hashtags.join() || p.image === undefined;
    if (changed) {
      await Post.updateOne({ _id: p._id }, { $set: { likesCount, commentsCount, hashtags, image: p.image || '' } });
      posts++;
    }
  }

  // Users: follower / following counters
  const followers = new Map(), following = new Map();
  for (const f of await Follow.find().select('follower following')) {
    followers.set(String(f.following), (followers.get(String(f.following)) || 0) + 1);
    following.set(String(f.follower), (following.get(String(f.follower)) || 0) + 1);
  }
  let users = 0;
  for await (const u of User.find()) {
    const fc = followers.get(String(u._id)) || 0, gc = following.get(String(u._id)) || 0;
    if (u.followersCount !== fc || u.followingCount !== gc) { await User.updateOne({ _id: u._id }, { $set: { followersCount: fc, followingCount: gc } }); users++; }
  }

  for (const m of [User, Post, Comment, Follow, Bookmark, Notification, Media]) await m.syncIndexes();
  console.log(`Done. Updated ${posts} post(s) and ${users} user(s); indexes are in sync.`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
