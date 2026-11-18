
require('dotenv').config();

const { GoogleGenAI } = require('@google/genai');

async function testGemini() {
  if (!process.env.GEMINI_API_KEY) {
    console.log('GEMINI_API_KEY tidak ditemukan!');
    return;
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  try {
    const models = await ai.models.list();

    console.log('\n=== DAFTAR MODEL GEMINI ===');

    for await (const model of models) {
      console.log({
        name: model.name,
        methods: model.supportedActions
      });
    }
  } catch (error) {
    console.error('GAGAL MENGAMBIL MODEL:', error.message);
  }
}

testGemini();
