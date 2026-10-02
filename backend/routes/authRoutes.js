const router = require('express').Router();
const c = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiters');

router.post('/register', authLimiter, c.register);
router.post('/login', authLimiter, c.login);
router.post('/logout', c.logout);
router.get('/me', protect, c.getMe);
router.put('/password', protect, authLimiter, c.changePassword);
router.post('/logout-all', protect, c.logoutAll);

module.exports = router;
