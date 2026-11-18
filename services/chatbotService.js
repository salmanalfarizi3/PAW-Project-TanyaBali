
const { GoogleGenAI } = require('@google/genai');
const knowledge = require('../models/knowledgeModel');

let client = null;

// Gunakan model yang sudah berhasil kamu uji.
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash-lite';
const THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL || 'minimal';
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 12000;

const OUT_OF_SCOPE_REPLY =
  'Maaf, saya TanyaBali AI. Saya hanya dapat membantu memberikan informasi seputar tempat wisata, pura, kuliner khas, dan informasi pariwisata Bali.';

class ChatbotError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.name = 'ChatbotError';
    this.statusCode = statusCode;
  }
}

// Kata kunci yang berhubungan dengan pariwisata Bali.
const tourismTerms = [
  'bali', 'wisata', 'wisatawan', 'destinasi', 'tempat wisata',
  'objek wisata', 'obyek wisata', 'pantai', 'pura', 'museum',
  'air terjun', 'gunung', 'danau', 'desa wisata',
  'kuliner', 'makanan', 'makan', 'makanan khas', 'masakan',
  'restoran', 'restaurant', 'rumah makan', 'tempat makan',
  'warung', 'oleh oleh', 'oleh-oleh', 'jajanan', 'minuman',
  'kabupaten', 'kecamatan', 'ubud', 'denpasar', 'badung',
  'gianyar', 'tabanan', 'buleleng', 'bangli', 'karangasem',
  'jembrana', 'klungkung', 'nusa penida',
  'tiket', 'harga', 'biaya masuk', 'alamat', 'lokasi',
  'fasilitas', 'jam buka', 'jam operasional', 'rute',
  'jarak', 'penginapan', 'hotel', 'akomodasi'
];

// Kata atau frasa yang biasanya digunakan untuk pertanyaan lanjutan.
const followUpTerms = [
  'di sana', 'disana', 'di situ', 'disitu',
  'tempat itu', 'lokasi itu', 'tempat tersebut',
  'sekitar sana', 'dekat sana', 'di sekitar',
  'bagaimana dengan', 'kalau di sana', 'kalau disana',
  'ada apa saja', 'apa saja', 'selain itu',
  'berapa harganya', 'bagaimana lokasinya',
  'apakah ada', 'rekomendasikan', 'rekomendasi', 'tanah lot',
  'pura tanah lot',
  'beraban',
  'kediri',
];

const unrelatedRequests = [
  /\b(buatkan|bikin|tuliskan|coding|kode program|program|debug|debugging)\b.*\b(game|website|aplikasi|script|program)\b/i,
  /\b(kerjakan|jawabkan)\b.*\b(tugas|ujian|matematika|soal)\b/i,
  /\b(puisi|cerpen|dongeng|pantun|terjemahkan|translate)\b/i
];

function normalizeHistory(history = []) {
  if (!Array.isArray(history)) return [];

  return history
    .map((item) => {
      if (typeof item === 'string') {
        return { role: 'user', text: item };
      }

      if (!item || typeof item !== 'object') return null;

      const rawRole = String(
        item.role || item.sender || item.type || ''
      ).toLowerCase();

      const text = String(
        item.content ||
        item.message ||
        item.text ||
        item.message_text ||
        ''
      ).trim();

      if (!text) return null;

      let role = 'user';

      if (
        ['assistant', 'model', 'bot', 'ai'].includes(rawRole) ||
        item.is_bot === true
      ) {
        role = 'model';
      }

      return { role, text };
    })
    .filter(Boolean)
    .slice(-8);
}

function isTourismQuestion(question, history = []) {
  const normalized = String(question || '').toLowerCase().trim();

  if (!normalized) return false;

  // Tetap tolak permintaan yang jelas-jelas tidak berkaitan.
  if (unrelatedRequests.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  const hasTourismKeyword = tourismTerms.some((term) =>
    normalized.includes(term)
  );

  if (hasTourismKeyword) return true;

  const previousMessages = normalizeHistory(history);
  const previousUserMessages = previousMessages
    .filter((item) => item.role === 'user')
    .map((item) => item.text.toLowerCase());

  const hasTourismContext = previousUserMessages.some((message) =>
    tourismTerms.some((term) => message.includes(term))
  );

  const isFollowUp = followUpTerms.some((term) =>
    normalized.includes(term)
  );

  // Izinkan pertanyaan lanjutan jika percakapan sebelumnya tentang wisata.
  return hasTourismContext && isFollowUp;
}

function getClient() {
  if (!process.env.GEMINI_API_KEY) return null;

  if (!client) {
    client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });
  }

  return client;
}

function formatPrice(price) {
  const amount = Number(price);

  return Number.isFinite(amount) && amount > 0
    ? `Rp ${amount.toLocaleString('id-ID')}`
    : 'Belum tersedia';
}

function formatDatabaseAnswer(contextRecords, isAiFallback = false) {
  const header = isAiFallback
    ? 'Layanan AI sedang sibuk, berikut informasi yang ditemukan di database TanyaBali:'
    : 'Berikut informasi yang ditemukan di database TanyaBali:';

  const list = contextRecords
    .map((item) =>
      `• ${item.nama} (${item.kategori}) — Harga: ${item.harga}. ${item.keterangan}`
    )
    .join('\n');

  return `${header}\n${list}`;
}

function buildSystemInstruction(hasDatabaseData, contextRecords) {
  return `
Kamu adalah TanyaBali AI, asisten virtual khusus pariwisata, budaya,
pura, tempat wisata, dan kuliner Bali.

ATURAN MENJAWAB:
1. Jawab hanya pertanyaan yang berkaitan dengan pariwisata Bali.
2. Pahami riwayat percakapan. Jika pengguna mengatakan "di sana",
   "di situ", atau "tempat tersebut", hubungkan dengan lokasi yang
   sedang dibahas sebelumnya.
3. Jika pengguna bertanya tentang makanan di suatu lokasi, berikan
   informasi kuliner atau rekomendasi makanan di sekitar lokasi tersebut.
4. Jika terdapat DATA DATABASE LOKAL, gunakan data tersebut sebagai
   acuan utama. Jangan mengarang harga atau informasi database.
5. Jika data database tidak tersedia, gunakan pengetahuan umum yang
   kamu miliki. Jika tidak yakin dengan nama tempat, alamat, atau harga,
   sampaikan bahwa informasi tersebut perlu diverifikasi.
6. Jawab dengan ramah, langsung, dan ringkas dalam 2–4 kalimat.
7. Jangan mengulang pertanyaan pengguna.
8. Jangan mengubah topik pembicaraan ke luar pariwisata Bali.

DATA DATABASE LOKAL:
${
  hasDatabaseData
    ? JSON.stringify(contextRecords, null, 2)
    : 'Tidak ada data spesifik yang cocok di database lokal.'
}
`.trim();
}

function extractStatusCode(error) {
  if (
    error?.name === 'AbortError' ||
    error?.code === 'ETIMEDOUT'
  ) {
    return 504;
  }

  if (typeof error?.status === 'number') return error.status;
  if (typeof error?.statusCode === 'number') return error.statusCode;

  const match = String(error?.message || '').match(
    /\b(400|401|403|404|408|429|500|502|503|504)\b/
  );

  return match ? Number(match[1]) : 503;
}

function buildUserError(statusCode) {
  if (statusCode === 429) {
    return new ChatbotError(
      'Batas permintaan layanan AI sedang penuh (429). Silakan tunggu beberapa detik lalu coba lagi.',
      429
    );
  }

  if (statusCode === 504) {
    return new ChatbotError(
      'Waktu tunggu respons AI habis. Silakan coba lagi.',
      504
    );
  }

  return new ChatbotError(
    'Layanan AI sedang mengalami gangguan sementara. Silakan coba beberapa saat lagi.',
    503
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithTimeout(taskFn, timeoutMs, externalSignal) {
  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      throw new ChatbotError(
        'Permintaan dibatalkan oleh pengguna.',
        499
      );
    }

    externalSignal.addEventListener('abort', onExternalAbort, {
      once: true
    });
  }

  try {
    return await taskFn(controller.signal);
  } finally {
    clearTimeout(timer);

    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

async function executeWithRetry(executorFn, externalSignal) {
  const modelsToTry = [
    ...new Set([PRIMARY_MODEL, FALLBACK_MODEL].filter(Boolean))
  ];

  let lastStatus = 503;

  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const model = modelsToTry[attempt];

    try {
      return await runWithTimeout(
        (signal) => executorFn(model, signal),
        REQUEST_TIMEOUT_MS,
        externalSignal
      );
    } catch (error) {
      if (externalSignal?.aborted) {
        throw new ChatbotError(
          'Permintaan dibatalkan oleh pengguna.',
          499
        );
      }

      lastStatus = extractStatusCode(error);

      console.error(
        `[Gemini Attempt ${attempt + 1} - ${model}] Status ${lastStatus}:`,
        error.message
      );

      // Tidak mengulang jika kesalahan berasal dari API key,
      // izin akses, model tidak ditemukan, atau kuota habis.
      if (
        lastStatus === 429 ||
        (lastStatus >= 400 && lastStatus < 500 && lastStatus !== 408)
      ) {
        break;
      }

      if (attempt < modelsToTry.length - 1) {
        await sleep(600);
      }
    }
  }

  throw buildUserError(lastStatus);
}

// Membuat konteks pencarian database dari pertanyaan dan
// beberapa pertanyaan pengguna sebelumnya.
function buildSearchQuery(question, history) {
  const previousUserQuestions = normalizeHistory(history)
    .filter((item) => item.role === 'user')
    .slice(-3)
    .map((item) => item.text);

  return [...previousUserQuestions, question].join(' ');
}

// Menyusun riwayat percakapan untuk dikirim ke Gemini.
function buildGeminiContents(question, history) {
  const previousMessages = normalizeHistory(history);

  const contents = previousMessages.map((item) => ({
    role: item.role,
    parts: [{ text: item.text }]
  }));

  contents.push({
    role: 'user',
    parts: [{ text: question }]
  });

  return contents;
}

async function prepareContext(question, history = []) {
  const searchQuery = buildSearchQuery(question, history);
  const matches = await knowledge.search(searchQuery);

  const hasDatabaseData = matches.length > 0;

  const contextRecords = hasDatabaseData
    ? matches.map((item) => ({
        nama: item.name,
        kategori: item.category,
        harga: formatPrice(item.price),
        keterangan:
          item.description || 'Tidak ada keterangan dalam database'
      }))
    : [];

  return {
    matches,
    hasDatabaseData,
    contextRecords
  };
}

/**
 * Mode Non-Streaming
 *
 * history berisi riwayat percakapan SEBELUM pertanyaan terbaru.
 */
exports.reply = async (question, { signal, history = [] } = {}) => {
  const conversationHistory = normalizeHistory(history);

  if (!isTourismQuestion(question, conversationHistory)) {
    return {
      answer: OUT_OF_SCOPE_REPLY,
      source: 'scope-guard',
      matches: []
    };
  }

  const {
    matches,
    hasDatabaseData,
    contextRecords
  } = await prepareContext(question, conversationHistory);

  const ai = getClient();

  if (!ai) {
    if (hasDatabaseData) {
      return {
        answer: formatDatabaseAnswer(contextRecords),
        source: 'database',
        matches
      };
    }

    throw new ChatbotError(
      'Informasi belum tersedia dan layanan AI sedang tidak aktif.',
      503
    );
  }

  const systemInstruction = buildSystemInstruction(
    hasDatabaseData,
    contextRecords
  );

  const contents = buildGeminiContents(
    question,
    conversationHistory
  );

  try {
    const response = await executeWithRetry(
      (model, abortSignal) =>
        ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.3,
            maxOutputTokens: 500,
            thinkingConfig: {
              thinkingLevel: THINKING_LEVEL
            },
            abortSignal
          }
        }),
      signal
    );

    const answer = response.text
      ? response.text.trim()
      : '';

    if (!answer) {
      throw new ChatbotError('Respons AI kosong.', 502);
    }

    return {
      answer,
      source: hasDatabaseData
        ? 'database + Gemini AI'
        : 'Gemini AI (Pengetahuan Umum Bali)',
      matches
    };
  } catch (error) {
    if (error.statusCode === 499) throw error;

    if (hasDatabaseData) {
      return {
        answer: formatDatabaseAnswer(contextRecords, true),
        source: 'database',
        matches
      };
    }

    throw error instanceof ChatbotError
      ? error
      : buildUserError(extractStatusCode(error));
  }
};

/**
 * Mode Streaming SSE
 */
exports.replyStream = async (
  question,
  { onChunk, signal, history = [] } = {}
) => {
  const conversationHistory = normalizeHistory(history);

  if (!isTourismQuestion(question, conversationHistory)) {
    if (onChunk) onChunk(OUT_OF_SCOPE_REPLY);

    return {
      answer: OUT_OF_SCOPE_REPLY,
      source: 'scope-guard',
      matches: []
    };
  }

  const {
    matches,
    hasDatabaseData,
    contextRecords
  } = await prepareContext(question, conversationHistory);

  const ai = getClient();

  if (!ai) {
    if (hasDatabaseData) {
      const fallbackText = formatDatabaseAnswer(contextRecords);

      if (onChunk) onChunk(fallbackText);

      return {
        answer: fallbackText,
        source: 'database',
        matches
      };
    }

    throw new ChatbotError(
      'Informasi belum tersedia dan layanan AI sedang tidak aktif.',
      503
    );
  }

  const systemInstruction = buildSystemInstruction(
    hasDatabaseData,
    contextRecords
  );

  const contents = buildGeminiContents(
    question,
    conversationHistory
  );

  try {
    return await executeWithRetry(
      async (model, abortSignal) => {
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.3,
            maxOutputTokens: 500,
            thinkingConfig: {
              thinkingLevel: THINKING_LEVEL
            },
            abortSignal
          }
        });

        let fullText = '';

        for await (const chunk of stream) {
          if (chunk.text) {
            fullText += chunk.text;
            if (onChunk) onChunk(chunk.text);
          }
        }

        const answer = fullText.trim();

        if (!answer) {
          throw new ChatbotError(
            'Respons stream AI kosong.',
            502
          );
        }

        return {
          answer,
          source: hasDatabaseData
            ? 'database + Gemini AI'
            : 'Gemini AI (Pengetahuan Umum Bali)',
          matches
        };
      },
      signal
    );
  } catch (error) {
    if (error.statusCode === 499) throw error;

    if (hasDatabaseData) {
      const fallbackText = formatDatabaseAnswer(
        contextRecords,
        true
      );

      if (onChunk) onChunk(fallbackText);

      return {
        answer: fallbackText,
        source: 'database',
        matches
      };
    }

    throw error instanceof ChatbotError
      ? error
      : buildUserError(extractStatusCode(error));
  }
};

exports.isTourismQuestion = isTourismQuestion;
exports.ChatbotError = ChatbotError;
