const router = require('express').Router();
const c = require('../controllers/commentController');
const { protect } = require('../middleware/authMiddleware');
const { validateObjectId } = require('../utils/helpers');

router.put('/:id', validateObjectId('id'), protect, c.updateComment);
router.delete('/:id', validateObjectId('id'), protect, c.deleteComment);

module.exports = router;
