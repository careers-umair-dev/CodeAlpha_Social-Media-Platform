const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { validateRegister, passwordProblem } = require('../utils/validators');

const BCRYPT_COST = 12;
// Compared against when the user does not exist, so response time doesn't reveal valid accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

const generateToken = (user) =>
  jwt.sign({ id: user._id, tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

/** Shape of the logged-in user (includes email, which is never exposed to other users). */
const sanitizeUser = (u) => ({
  _id: u._id,
  name: u.name,
  username: u.username,
  email: u.email,
  bio: u.bio,
  profileImage: u.profileImage,
  followersCount: u.followersCount,
  followingCount: u.followingCount,
  createdAt: u.createdAt,
});

const asString = (v) => (typeof v === 'string' ? v : '');

const register = asyncHandler(async (req, res) => {
  const data = validateRegister(req.body);

  const existing = await User.findOne({ $or: [{ email: data.email }, { username: data.username }] }).select('email');
  if (existing) {
    const field = existing.email === data.email ? 'email' : 'username';
    throw new ApiError(409, `That ${field} is already in use`, { [field]: `That ${field} is already in use.` });
  }

  const user = await User.create({ ...data, password: await bcrypt.hash(data.password, BCRYPT_COST) });
  res.status(201).json({ success: true, message: 'Welcome to MiniSocial!', token: generateToken(user), user: sanitizeUser(user) });
});

const login = asyncHandler(async (req, res) => {
  const identifier = asString(req.body.emailOrUsername).toLowerCase().trim();
  const password = asString(req.body.password);
  if (!identifier || !password) {
    throw new ApiError(422, 'Please enter your email/username and password', {
      ...(identifier ? {} : { emailOrUsername: 'Enter your email or username.' }),
      ...(password ? {} : { password: 'Enter your password.' }),
    });
  }

  const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] }).select('+password +tokenVersion');
  const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !ok) throw new ApiError(401, 'Incorrect email/username or password');

  res.json({ success: true, message: 'Welcome back!', token: generateToken(user), user: sanitizeUser(user) });
});

const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: sanitizeUser(req.user) });
});

/** Stateless JWTs can't be "killed" individually; the client discards its token. Kept for a clean API. */
const logout = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

/** Revokes every token issued so far (all devices), and returns a fresh one for this device. */
const logoutAll = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  res.json({ success: true, message: 'Logged out of all other devices' });
});

const changePassword = asyncHandler(async (req, res) => {
  const current = asString(req.body.currentPassword);
  const next = asString(req.body.newPassword);
  const errors = {};
  if (!current) errors.currentPassword = 'Enter your current password.';
  const problem = passwordProblem(next);
  if (problem) errors.newPassword = problem;
  if (Object.keys(errors).length) throw new ApiError(422, 'Please fix the highlighted fields', errors);

  const user = await User.findById(req.user._id).select('+password +tokenVersion');
  if (!(await bcrypt.compare(current, user.password))) {
    throw new ApiError(422, 'Current password is incorrect', { currentPassword: 'Current password is incorrect.' });
  }
  if (await bcrypt.compare(next, user.password)) {
    throw new ApiError(422, 'Choose a different password', { newPassword: 'New password must differ from the current one.' });
  }
  user.password = await bcrypt.hash(next, BCRYPT_COST);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out every other session
  await user.save();
  res.json({ success: true, message: 'Password updated', token: generateToken(user) });
});

module.exports = { register, login, getMe, logout, logoutAll, changePassword, sanitizeUser, generateToken };
