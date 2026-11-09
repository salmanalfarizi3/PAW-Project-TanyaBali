
const express = require('express');
const path = require('path');
require('dotenv').config();

const logger = require('./middlewares/loggerMiddleware');
const webRoutes = require('./routes/web');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Middleware untuk membaca request
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Static files (CSS dan gambar)
app.use(express.static(path.join(__dirname, 'css')));
app.use(express.static(path.join(__dirname, 'assets')));

// 3. Pengaturan EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 4. Middleware Logger
app.use(logger);

// 5. Routes
app.use('/', webRoutes);

// 6. Halaman 404
app.use((req, res) => {
    res.status(404).send('Halaman tidak ditemukan');
});

// 7. Error handler
app.use((err, req, res, next) => {
    console.error('Terjadi kesalahan:', err);

    res.status(500).json({
        status: 'error',
        message: 'Internal Server Error'
    });
});

// 8. Jalankan server
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
