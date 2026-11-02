
const productModel = require('../models/productModel');

module.exports = {
    getHome: (req, res) => {
        const products = productModel.getAllProducts();
        res.render('index', { title: 'Beranda - TanyaBali', products });
    },

  
    getLandingPage: (req, res) => {
        res.render('landing-page', { title: 'Referensi Jurnal - TanyaBali' });
    },

    getStatusAPI: (req, res) => {
        res.json({
            status: 'success',
            message: 'Server berjalan dengan baik',
            timestamp: new Date().toISOString()
        });
    },

    getProductsAPI: (req, res) => {
    const products = productModel.getAllProducts();
    console.log("Data Produk dari Model:", products); 
    res.json(products);
}
};