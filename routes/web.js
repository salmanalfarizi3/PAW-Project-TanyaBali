const express = require('express');
const router = express.Router();
const mainController = require('../controllers/mainController');


router.get('/', mainController.getHome);


router.get('/referensi', mainController.getLandingPage);


router.get('/api/status', mainController.getStatusAPI);
router.get('/api/produk', mainController.getProductsAPI);

module.exports = router;