const Notification = require('../models/Notification');

const same = (a, b) => String(a) === String(b);

/** Creates (or refreshes) a notification. Never notifies users about their own actions. Never throws. */
async function notify({ recipient, actor, type, post = null, comment = null, text = '' }) {
  try {
    if (same(recipient, actor)) return;
    if (type === 'comment') {
      await Notification.create({ recipient, actor, type, post, comment, text: text.slice(0, 120) });
      return;
    }
    // follow / like are idempotent: re-liking or re-following re-surfaces the same notification
    await Notification.findOneAndUpdate(
      { recipient, actor, type, post },
      { $set: { read: false }, $setOnInsert: { text: '' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    console.error('[notify] failed:', err.message);
  }
}

/** Removes the notification created by an action that has been undone (unlike / unfollow). */
async function unnotify({ recipient, actor, type, post = null }) {
  try {
    await Notification.deleteMany({ recipient, actor, type, post });
  } catch (err) {
    console.error('[unnotify] failed:', err.message);
  }
}

module.exports = { notify, unnotify };
