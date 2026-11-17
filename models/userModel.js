const db=require('../config/database');
exports.findByEmail=async email=>{const q=await db.query('SELECT id,name,email,password_hash FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1',[email]);return q.rows[0]||null;};
exports.create=async ({name,email,passwordHash})=>{const q=await db.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',[name,email,passwordHash]);return q.rows[0];};
