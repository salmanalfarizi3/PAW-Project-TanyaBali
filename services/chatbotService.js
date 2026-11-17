const { GoogleGenAI } = require('@google/genai');
const knowledge = require('../models/knowledgeModel');

let client = null;

const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-latest';
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

// Gerbang awal untuk mencegah AI digunakan sebagai chatbot serbaguna.
const tourismTerms = [
  'bali', 'wisata', 'wisatawan', 'destinasi', 'tempat wisata', 'objek wisata',
  'obyek wisata', 'pantai', 'pura', 'museum', 'air terjun', 'gunung', 'danau',
  'desa wisata', 'kuliner', 'makanan khas', 'masakan', 'oleh oleh', 'oleh-oleh',
  'kabupaten', 'kecamatan', 'ubud', 'denpasar', 'badung', 'gianyar', 'tabanan',
  'buleleng', 'bangli', 'karangasem', 'jembrana', 'klungkung', 'nusa penida',
  'tiket', 'harga', 'biaya masuk', 'alamat', 'lokasi', 'fasilitas', 'jam buka',
  'jam operasional', 'rute', 'jarak', 'penginapan'
];

const unrelatedRequests = [
  /\b(buatkan|bikin|tuliskan|coding|kode program|program|debug|debugging)\b.*\b(game|website|aplikasi|script|program)\b/i,
  /\b(kerjakan|jawabkan)\b.*\b(tugas|ujian|matematika|soal)\b/i,
  /\b(puisi|cerpen|dongeng|pantun|terjemahkan|translate)\b/i
];

function isTourismQuestion(question) {
  const normalized = question.toLowerCase();
  if (unrelatedRequests.some((pattern) => pattern.test(normalized))) return false;
  return tourismTerms.some((term) => normalized.includes(term));
}

function getClient() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
    .map((item) => `• ${item.nama} (${item.kategori}) — Harga: ${item.harga}. ${item.keterangan}`)
    .join('\n');

  return `${header}\n${list}`;
}

function buildSystemInstruction(hasDatabaseData, contextRecords) {
  return `
Kamu adalah TanyaBali AI, asisten virtual khusus pariwisata, budaya, pura, dan kuliner Bali.

ATURAN MENJAWAB:
1. PRIORITAS UTAMA: Jika terdapat "DATA DATABASE LOKAL" di bawah ini, gunakan data tersebut sebagai acuan utama.
2. JIKA DATA DATABASE KOSONG: Gunakan pengetahuan umummu yang akurat mengenai pariwisata, tempat menarik, pura, atau kuliner di Bali.
3. GAYA JAWABAN: Jawab secara ramah, langsung ke inti, dan ringkas dalam 2–4 kalimat atau maksimal 4 poin singkat (sekitar 80–120 kata) agar mudah dibaca dan cepat dimuat.
4. Jangan pernah keluar dari topik seputar Bali.

DATA DATABASE LOKAL:
${hasDatabaseData ? JSON.stringify(contextRecords, null, 2) : 'Tidak ada data spesifik yang cocok di database lokal.'}
`.trim();
}

function extractStatusCode(error) {
  if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') return 504;
  if (typeof error?.status === 'number') return error.status;
  if (typeof error?.statusCode === 'number') return error.statusCode;

  const match = String(error?.message || '').match(/\b(400|401|403|404|429|500|502|503|504)\b/);
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
      'Waktu tunggu respons AI habis. Silakan klik coba lagi.',
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
      throw new ChatbotError('Permintaan dibatalkan oleh pengguna.', 499);
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
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
  const modelsToTry =
    FALLBACK_MODEL && FALLBACK_MODEL !== PRIMARY_MODEL
      ? [PRIMARY_MODEL, FALLBACK_MODEL]
      : [PRIMARY_MODEL, PRIMARY_MODEL];

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
        throw new ChatbotError('Permintaan dibatalkan oleh pengguna.', 499);
      }

      lastStatus = extractStatusCode(error);
      console.error(`[Gemini Attempt ${attempt + 1} - ${model}] Status ${lastStatus}:`, error.message);

      // Jangan retry pada 429 (kuota/RPM habis) atau 4xx client error
      if (lastStatus === 429 || (lastStatus >= 400 && lastStatus < 500 && lastStatus !== 408)) {
        break;
      }

      // Retry sekali untuk 503 / 504 / jaringan setelah jeda singkat
      if (attempt < modelsToTry.length - 1) {
        await sleep(600);
      }
    }
  }

  throw buildUserError(lastStatus);
}

async function prepareContext(question) {
  const matches = await knowledge.search(question);
  const hasDatabaseData = matches.length > 0;
  const contextRecords = hasDatabaseData
    ? matches.map((item) => ({
        nama: item.name,
        kategori: item.category,
        harga: formatPrice(item.price),
        keterangan: item.description || 'Tidak ada keterangan dalam database'
      }))
    : [];

  return { matches, hasDatabaseData, contextRecords };
}

/**
 * Mode Non-Streaming (kompatibel dengan res.json saat ini)
 */
exports.reply = async (question, { signal } = {}) => {
  if (!isTourismQuestion(question)) {
    return { answer: OUT_OF_SCOPE_REPLY, source: 'scope-guard', matches: [] };
  }

  const { matches, hasDatabaseData, contextRecords } = await prepareContext(question);
  const ai = getClient();

  if (!ai) {
    if (hasDatabaseData) {
      return {
        answer: formatDatabaseAnswer(contextRecords, false),
        source: 'database',
        matches
      };
    }
    throw new ChatbotError('Informasi belum tersedia dan layanan AI sedang tidak aktif.', 503);
  }

  const systemInstruction = buildSystemInstruction(hasDatabaseData, contextRecords);

  try {
    const response = await executeWithRetry(
      (model, abortSignal) =>
        ai.models.generateContent({
          model,
          contents: question,
          config: {
            systemInstruction,
            temperature: 0.3,
            maxOutputTokens: 500,
            thinkingConfig: { thinkingLevel: THINKING_LEVEL },
            abortSignal
          }
        }),
      signal
    );

    const answer = response.text ? response.text.trim() : '';
    if (!answer) {
      throw new ChatbotError('Respons AI kosong.', 502);
    }

    return {
      answer,
      source: hasDatabaseData ? 'database + Gemini AI' : 'Gemini AI (Pengetahuan Umum Bali)',
      matches
    };
  } catch (error) {
    if (error.statusCode === 499) throw error;

    // Jika Gemini gagal (429/503/timeout) tapi data DB tersedia, gunakan data DB
    if (hasDatabaseData) {
      return {
        answer: formatDatabaseAnswer(contextRecords, true),
        source: 'database',
        matches
      };
    }

    throw error instanceof ChatbotError ? error : buildUserError(extractStatusCode(error));
  }
};

/**
 * Mode Streaming SSE (untuk dipakai setelah chatController & chatbot.js di-update)
 */
exports.replyStream = async (question, { onChunk, signal } = {}) => {
  if (!isTourismQuestion(question)) {
    if (onChunk) onChunk(OUT_OF_SCOPE_REPLY);
    return { answer: OUT_OF_SCOPE_REPLY, source: 'scope-guard', matches: [] };
  }

  const { matches, hasDatabaseData, contextRecords } = await prepareContext(question);
  const ai = getClient();

  if (!ai) {
    if (hasDatabaseData) {
      const fallbackText = formatDatabaseAnswer(contextRecords, false);
      if (onChunk) onChunk(fallbackText);
      return { answer: fallbackText, source: 'database', matches };
    }
    throw new ChatbotError('Informasi belum tersedia dan layanan AI sedang tidak aktif.', 503);
  }

  const systemInstruction = buildSystemInstruction(hasDatabaseData, contextRecords);

  try {
    return await executeWithRetry(async (model, abortSignal) => {
      const stream = await ai.models.generateContentStream({
        model,
        contents: question,
        config: {
          systemInstruction,
          temperature: 0.3,
          maxOutputTokens: 500,
          thinkingConfig: { thinkingLevel: THINKING_LEVEL },
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
        throw new ChatbotError('Respons stream AI kosong.', 502);
      }

      return {
        answer,
        source: hasDatabaseData ? 'database + Gemini AI' : 'Gemini AI (Pengetahuan Umum Bali)',
        matches
      };
    }, signal);
  } catch (error) {
    if (error.statusCode === 499) throw error;

    if (hasDatabaseData) {
      const fallbackText = formatDatabaseAnswer(contextRecords, true);
      if (onChunk) onChunk(fallbackText);
      return { answer: fallbackText, source: 'database', matches };
    }

    throw error instanceof ChatbotError ? error : buildUserError(extractStatusCode(error));
  }
};

exports.isTourismQuestion = isTourismQuestion;
exports.ChatbotError = ChatbotError;