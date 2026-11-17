const db = require('../config/database');

exports.createConversation = async (userId, title) => {
  const result = await db.query(
    `INSERT INTO chat_conversations (user_id, title)
     VALUES ($1, $2) RETURNING id, user_id, title, created_at, updated_at`,
    [userId, title]
  );
  return result.rows[0];
};

exports.listByUser = async (userId) => {
  const result = await db.query(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
            (SELECT content FROM chat_messages m WHERE m.conversation_id = c.id
             ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message
     FROM chat_conversations c
     WHERE c.user_id = $1
     ORDER BY c.updated_at DESC, c.id DESC`,
    [userId]
  );
  return result.rows;
};

exports.findById = async (conversationId, userId) => {
  const result = await db.query(
    'SELECT id, user_id, title FROM chat_conversations WHERE id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  return result.rows[0] || null;
};

exports.listMessages = async (conversationId, userId) => {
  const result = await db.query(
    `SELECT m.id, m.role, m.content, m.source, m.created_at
     FROM chat_messages m
     JOIN chat_conversations c ON c.id = m.conversation_id
     WHERE m.conversation_id = $1 AND c.user_id = $2
     ORDER BY m.created_at ASC, m.id ASC`,
    [conversationId, userId]
  );
  return result.rows;
};

exports.addMessage = async (conversationId, role, content, source = null) => {
  const result = await db.query(
    `INSERT INTO chat_messages (conversation_id, role, content, source)
     VALUES ($1, $2, $3, $4)
     RETURNING id, role, content, source, created_at`,
    [conversationId, role, content, source]
  );
  await db.query(
    'UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1',
    [conversationId]
  );
  return result.rows[0];
};

exports.rename = async (conversationId, userId, title) => {
  const result = await db.query(
    `UPDATE chat_conversations SET title = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3 RETURNING id, title, updated_at`,
    [title, conversationId, userId]
  );
  return result.rows[0] || null;
};

exports.remove = async (conversationId, userId) => {
  const result = await db.query(
    'DELETE FROM chat_conversations WHERE id = $1 AND user_id = $2 RETURNING id',
    [conversationId, userId]
  );
  return result.rows[0] || null;
};
