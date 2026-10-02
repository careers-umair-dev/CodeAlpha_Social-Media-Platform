const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Bookmark = require('../models/Bookmark');
const Follow = require('../models/Follow');
const Notification = require('../models/Notification');
const Media = require('../models/Media');
const { mediaIdFromPath } = require('../utils/helpers');

const AUTHOR_FIELDS = 'name username profileImage';

/** Deletes an uploaded image if the given path points to one. */
async function removeMediaByPath(path) {
  const id = mediaIdFromPath(path);
  if (id) await Media.deleteOne({ _id: id });
}

/**
 * Turns Post documents (with populated author) into API objects, adding the viewer-specific
 * flags (liked / saved / following author) using three batched queries instead of N.
 */
async function hydratePosts(posts, viewerId) {
  const viewer = viewerId ? String(viewerId) : null;
  let savedSet = new Set();
  let followingSet = new Set();

  if (viewer && posts.length) {
    const [bookmarks, follows] = await Promise.all([
      Bookmark.find({ user: viewer, post: { $in: posts.map((p) => p._id) } }).select('post'),
      Follow.find({ follower: viewer, following: { $in: posts.map((p) => p.author && p.author._id).filter(Boolean) } }).select('following'),
    ]);
    savedSet = new Set(bookmarks.map((b) => String(b.post)));
    followingSet = new Set(follows.map((f) => String(f.following)));
  }

  return posts
    .filter((p) => p.author) // skip orphaned posts whose author no longer exists
    .map((p) => ({
      _id: p._id,
      author: p.author,
      content: p.content,
      image: p.image || '',
      hashtags: p.hashtags,
      likesCount: p.likesCount,
      commentsCount: p.commentsCount,
      createdAt: p.createdAt,
      editedAt: p.editedAt,
      likedByCurrentUser: viewer ? p.likes.some((id) => String(id) === viewer) : false,
      savedByCurrentUser: savedSet.has(String(p._id)),
      isFollowingAuthor: followingSet.has(String(p.author._id)),
    }));
}

const populateAuthor = (query) => query.populate('author', AUTHOR_FIELDS);

/** Fully removes posts and everything hanging off them. */
async function deletePostsCascade(posts) {
  if (!posts.length) return;
  const ids = posts.map((p) => p._id);
  await Promise.all([
    Comment.deleteMany({ post: { $in: ids } }),
    Bookmark.deleteMany({ post: { $in: ids } }),
    Notification.deleteMany({ post: { $in: ids } }),
    Media.deleteMany({ _id: { $in: posts.map((p) => mediaIdFromPath(p.image)).filter(Boolean) } }),
  ]);
  await Post.deleteMany({ _id: { $in: ids } });
}

module.exports = { AUTHOR_FIELDS, hydratePosts, populateAuthor, removeMediaByPath, deletePostsCascade };
