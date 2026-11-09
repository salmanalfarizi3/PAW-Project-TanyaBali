
const db = require('../config/database');

const productModel = {
    // Read All
    getAllProducts: async () => {
        const result = await db.query(
            'SELECT * FROM produk'
        );
        return result.rows;
    },

    // Read by ID
    getProductById: async (id) => {
        const result = await db.query(
            'SELECT * FROM produk WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    },

    // Create
    createProduct: async (data) => {
        const { nama, deskripsi, harga } = data;

        const result = await db.query(
            `INSERT INTO produk (nama, deskripsi, harga)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [nama, deskripsi, harga]
        );

        return result.rows[0];
    },

    // Update
    updateProduct: async (id, data) => {
        const { nama, deskripsi, harga } = data;

        const result = await db.query(
            `UPDATE produk
             SET nama = $1, deskripsi = $2, harga = $3
             WHERE id = $4
             RETURNING *`,
            [nama, deskripsi, harga, id]
        );

        return result.rows[0] || null;
    },

    // Delete
    deleteProduct: async (id) => {
        const result = await db.query(
            'DELETE FROM produk WHERE id = $1',
            [id]
        );

        return result.rowCount > 0;
    }
};

module.exports = productModel;
