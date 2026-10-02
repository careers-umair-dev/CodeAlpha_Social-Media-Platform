const router = require('express').Router();
const m = require('../controllers/mediaController');
const { protect } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/rateLimiters');
const { validateObjectId } = require('../utils/helpers');

router.post('/', protect, uploadLimiter, m.upload);
router.get('/:id', validateObjectId('id'), m.serve);

module.exports = router;
