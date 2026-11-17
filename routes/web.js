
const express = require('express');
const router = express.Router();

const mainController = require('../controllers/mainController');
const authController = require('../controllers/authController');
const chatController = require('../controllers/chatController');

const {
    requireAuth,
    redirectIfAuth
} = require('../middlewares/authMiddleware');

// Halaman utama
router.get('/', mainController.getHome);
router.get('/referensi', mainController.getLandingPage);

// Login dan Register
router.get('/login', redirectIfAuth, authController.loginPage);
router.post('/login', redirectIfAuth, authController.login);

router.get('/register', redirectIfAuth, authController.registerPage);
router.post('/register', redirectIfAuth, authController.register);

router.post('/logout', requireAuth, authController.logout);

// Chatbot
router.get('/chatbot', requireAuth, chatController.page);
router.post('/api/chatbot', requireAuth, chatController.ask);

// Riwayat percakapan
router.get('/api/conversations', requireAuth, chatController.list);
router.post('/api/conversations', requireAuth, chatController.create);
router.get('/api/conversations/:id/messages', requireAuth, chatController.messages);
router.patch('/api/conversations/:id', requireAuth, chatController.rename);
router.delete('/api/conversations/:id', requireAuth, chatController.remove);

// API produk
router.get('/api/status', mainController.getStatusAPI);
router.get('/api/produk', mainController.getProductsAPI);
router.get('/api/produk/:id', mainController.getProductByIdAPI);

router.post('/api/produk', requireAuth, mainController.createProductAPI);
router.put('/api/produk/:id', requireAuth, mainController.updateProductAPI);
router.delete('/api/produk/:id', requireAuth, mainController.deleteProductAPI);

// Informasi tiket
router.get('/info-tiket', requireAuth, mainController.getInfoTiket);

module.exports = router;
