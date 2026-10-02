const router = require('express').Router();
const { search } = require('../controllers/searchController');
const { optionalAuth } = require('../middleware/authMiddleware');

router.get('/', optionalAuth, search);

module.exports = router;
