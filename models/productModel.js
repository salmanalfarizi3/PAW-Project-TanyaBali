
const products = [
    { id: 1, name: 'Pura Tanah Lot', category: 'Wisata Budaya & Pantai', price: 20000 },
    { id: 2, name: 'Pantai Kuta', category: 'Wisata Bahari', price: 10000 },
    { id: 3, name: 'Pura Uluwatu', category: 'Wisata Religi & Sunset', price: 30000 }
];

module.exports = {
    getAllProducts: () => products
};