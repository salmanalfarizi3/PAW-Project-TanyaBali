const db=require('../config/database');
module.exports={
 async getAllProducts(){const q=await db.query('SELECT id,name,category,price,description FROM produk ORDER BY id DESC');return q.rows;},
 async getProductById(id){const q=await db.query('SELECT id,name,category,price,description FROM produk WHERE id=$1',[id]);return q.rows[0]||null;},
 async createProduct(d){const q=await db.query('INSERT INTO produk(name,category,price,description) VALUES($1,$2,$3,$4) RETURNING id,name,category,price,description',[d.name,d.category,Number(d.price)||0,d.description||null]);return q.rows[0];},
 async updateProduct(id,d){const q=await db.query('UPDATE produk SET name=$1,category=$2,price=$3,description=$4 WHERE id=$5 RETURNING id,name,category,price,description',[d.name,d.category,Number(d.price)||0,d.description||null,id]);return q.rows[0]||null;},
 async deleteProduct(id){const q=await db.query('DELETE FROM produk WHERE id=$1 RETURNING id',[id]);return q.rows[0]||null;}
};
