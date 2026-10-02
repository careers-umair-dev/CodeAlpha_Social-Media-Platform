const router = require('express').Router();
const p = require('../controllers/postController');
const c = require('../controllers/commentController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { validateObjectId } = require('../utils/helpers');

router.get('/', optionalAuth, p.getFeed);
router.post('/', protect, p.createPost);
router.get('/trending', p.getTrending);
router.get('/saved', protect, p.getSaved);

router.get('/:id', validateObjectId('id'), optionalAuth, p.getPostById);
router.put('/:id', validateObjectId('id'), protect, p.updatePost);
router.delete('/:id', validateObjectId('id'), protect, p.deletePost);

router.post('/:id/like', validateObjectId('id'), protect, p.like);
router.delete('/:id/like', validateObjectId('id'), protect, p.unlike);
router.post('/:id/save', validateObjectId('id'), protect, p.save);
router.delete('/:id/save', validateObjectId('id'), protect, p.unsave);

router.get('/:postId/comments', validateObjectId('postId'), c.getComments);
router.post('/:postId/comments', validateObjectId('postId'), protect, c.addComment);

module.exports = router;
