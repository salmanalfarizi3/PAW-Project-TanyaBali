
const chatbot = require('../services/chatbotService');
const conversations = require('../models/conversationModel');

exports.page = async (req, res, next) => {
  try {
    const items = await conversations.listByUser(req.session.user.id);

    res.render('chatbot', {
      title: 'Tanya AI — TanyaBali',
      conversations: items
    });
  } catch (error) {
    next(error);
  }
};

exports.list = async (req, res) => {
  try {
    const items = await conversations.listByUser(req.session.user.id);

    res.json({
      status: 'success',
      data: items
    });
  } catch (error) {
    console.error('List conversations:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil riwayat percakapan.'
    });
  }
};

exports.create = async (req, res) => {
  try {
    const title = String(
      req.body.title || 'Percakapan baru'
    ).trim().slice(0, 100) || 'Percakapan baru';

    const item = await conversations.createConversation(
      req.session.user.id,
      title
    );

    res.status(201).json({
      status: 'success',
      data: item
    });
  } catch (error) {
    console.error('Create conversation:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Gagal membuat percakapan baru.'
    });
  }
};

exports.messages = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const conversation = await conversations.findById(
      req.params.id,
      userId
    );

    if (!conversation) {
      return res.status(404).json({
        status: 'error',
        message: 'Percakapan tidak ditemukan.'
      });
    }

    const data = await conversations.listMessages(
      conversation.id,
      userId
    );

    res.json({
      status: 'success',
      data
    });
  } catch (error) {
    console.error('Get messages:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil pesan.'
    });
  }
};

exports.rename = async (req, res) => {
  const title = String(req.body.title || '').trim();

  if (!title || title.length > 100) {
    return res.status(400).json({
      status: 'error',
      message: 'Judul wajib diisi (maksimal 100 karakter).'
    });
  }

  try {
    const item = await conversations.rename(
      req.params.id,
      req.session.user.id,
      title
    );

    if (!item) {
      return res.status(404).json({
        status: 'error',
        message: 'Percakapan tidak ditemukan.'
      });
    }

    res.json({
      status: 'success',
      data: item,
      message: 'Judul percakapan berhasil diubah.'
    });
  } catch (error) {
    console.error('Rename conversation:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Gagal mengubah judul percakapan.'
    });
  }
};

exports.remove = async (req, res) => {
  try {
    const item = await conversations.remove(
      req.params.id,
      req.session.user.id
    );

    if (!item) {
      return res.status(404).json({
        status: 'error',
        message: 'Percakapan tidak ditemukan.'
      });
    }

    res.json({
      status: 'success',
      message: 'Percakapan berhasil dihapus.'
    });
  } catch (error) {
    console.error('Delete conversation:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Gagal menghapus percakapan.'
    });
  }
};

// Mengirim pertanyaan ke TanyaBali AI.
exports.ask = async (req, res) => {
  const question = String(req.body.message || '').trim();

  if (!question || question.length > 1000) {
    return res.status(400).json({
      status: 'error',
      message: 'Pertanyaan wajib diisi dan maksimal 1.000 karakter.'
    });
  }

  const userId = req.session.user.id;

  try {
    let conversation;

    // 1. Cari percakapan yang sedang digunakan.
    if (req.body.conversationId) {
      conversation = await conversations.findById(
        req.body.conversationId,
        userId
      );

      if (!conversation) {
        return res.status(404).json({
          status: 'error',
          message: 'Percakapan tidak ditemukan.'
        });
      }
    } else {
      // 2. Buat percakapan baru jika belum ada.
      conversation = await conversations.createConversation(
        userId,
        question.slice(0, 60)
      );
    }

    // 3. Ambil riwayat SEBELUM menyimpan pertanyaan terbaru.
    const previousMessages = await conversations.listMessages(
      conversation.id,
      userId
    );

    // 4. Kirim pertanyaan dan riwayat sebelumnya ke Gemini.
    const result = await chatbot.reply(question, {
      history: previousMessages
    });

    // 5. Simpan pertanyaan pengguna.
    await conversations.addMessage(
      conversation.id,
      'user',
      question
    );

    // 6. Simpan jawaban AI.
    await conversations.addMessage(
      conversation.id,
      'assistant',
      result.answer,
      result.source || null
    );

    // 7. Kirim hasil ke frontend.
    return res.json({
      status: 'success',
      conversationId: conversation.id,
      title: conversation.title,
      ...result
    });

  } catch (error) {
    console.error('Chatbot error:', error);

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      status: 'error',
      message: error.message ||
        'Chatbot sedang mengalami kendala. Silakan coba kembali.'
    });
  }
};
