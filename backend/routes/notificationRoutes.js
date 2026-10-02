const router = require('express').Router();
const n = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');
const { validateObjectId } = require('../utils/helpers');

router.use(protect);
router.get('/', n.list);
router.get('/unread-count', n.unreadCount);
router.post('/read-all', n.markAllRead);
router.delete('/', n.clearAll);
router.patch('/:id/read', validateObjectId('id'), n.markRead);

module.exports = router;
