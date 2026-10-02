const { invalid } = require('./ApiError');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'api', 'me', 'profile', 'settings', 'suggestions', 'preferences',
  'search', 'notifications', 'support', 'help', 'explore', 'login', 'logout', 'register',
  'saved', 'post', 'posts', 'user', 'users', 'root', 'system', 'moderator', 'mod', 'null', 'undefined',
]);

const str = (v) => (typeof v === 'string' ? v : '');

/** Returns an error message or '' if the password is acceptable. */
function passwordProblem(pw) {
  if (typeof pw !== 'string' || !pw) return 'Please enter a password.';
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (Buffer.byteLength(pw) > 72) return 'Password is too long (max 72 bytes).';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number.';
  return '';
}

function validateRegister(body = {}) {
  const errors = {};
  const name = str(body.name).trim();
  const username = str(body.username).trim();
  const email = str(body.email).trim().toLowerCase();
  const password = body.password;

  if (!name) errors.name = 'Please enter your name.';
  else if (name.length > 50) errors.name = 'Name cannot exceed 50 characters.';

  if (!username) errors.username = 'Please choose a username.';
  else if (!USERNAME_RE.test(username)) errors.username = '3–30 characters: letters, numbers and underscores only.';
  else if (RESERVED_USERNAMES.has(username.toLowerCase())) errors.username = 'That username is reserved.';

  if (!email) errors.email = 'Please enter your email.';
  else if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Please enter a valid email address.';

  const pwProblem = passwordProblem(password);
  if (pwProblem) errors.password = pwProblem;

  if (Object.keys(errors).length) throw invalid(errors);
  return { name, username: username.toLowerCase(), email, password };
}

function validateProfile(body = {}) {
  const errors = {};
  const out = {};
  if (body.name !== undefined) {
    const name = str(body.name).trim();
    if (!name) errors.name = 'Name cannot be empty.';
    else if (name.length > 50) errors.name = 'Name cannot exceed 50 characters.';
    else out.name = name;
  }
  if (body.bio !== undefined) {
    const bio = str(body.bio).trim();
    if (bio.length > 160) errors.bio = 'Bio cannot exceed 160 characters.';
    else out.bio = bio;
  }
  if (Object.keys(errors).length) throw invalid(errors);
  return out;
}

/** Profile image may be empty, one of our uploads, or an http(s) URL. */
function validateImageRef(value) {
  if (value === undefined) return undefined;
  const v = str(value).trim();
  if (!v) return '';
  if (v.length > 500) throw invalid({ profileImage: 'Image link is too long.' });
  if (/^\/api\/media\/[a-f0-9]{24}$/i.test(v)) return v;
  try {
    const url = new URL(v);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch (_) { /* fall through */ }
  throw invalid({ profileImage: 'Use an uploaded photo or a valid http(s) image link.' });
}

function validatePostContent(content, { required = true } = {}) {
  const text = str(content).trim();
  if (required && !text) throw invalid({ content: 'Write something or add an image.' });
  if (text.length > 500) throw invalid({ content: 'Posts cannot exceed 500 characters.' });
  return text;
}

function validateCommentText(text) {
  const t = str(text).trim();
  if (!t) throw invalid({ text: 'Comment cannot be empty.' });
  if (t.length > 300) throw invalid({ text: 'Comments cannot exceed 300 characters.' });
  return t;
}

module.exports = {
  EMAIL_RE,
  passwordProblem,
  validateRegister,
  validateProfile,
  validateImageRef,
  validatePostContent,
  validateCommentText,
};
