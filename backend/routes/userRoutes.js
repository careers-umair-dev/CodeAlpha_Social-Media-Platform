const router = require('express').Router();
const u = require('../controllers/userController');
const f = require('../controllers/followController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');

router.get('/', optionalAuth, u.getUsers);
// Fixed paths must be declared before '/:username'
router.get('/suggestions', protect, u.getSuggestions);
router.put('/profile', protect, u.updateProfile);
router.delete('/me', protect, u.deleteAccount);

router.get('/:username', optionalAuth, u.getUserProfile);
router.get('/:username/posts', optionalAuth, u.getUserPosts);
router.get('/:username/followers', optionalAuth, u.getFollowers);
router.get('/:username/following', optionalAuth, u.getFollowing);
router.post('/:username/follow', protect, f.followUser);
router.delete('/:username/follow', protect, f.unfollowUser);

module.exports = router;
