
require('dotenv').config();

const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const models = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite'
];

async function testModel(model) {
  console.log(`\nMenguji model: ${model}`);

  const start = Date.now();

  try {
    const response = await ai.models.generateContent({
      model,
      contents: 'Di mana lokasi Pura Tanah Lot? Jawab dalam bahasa Indonesia secara singkat.',
      config: {
        maxOutputTokens: 150
      }
    });

    console.log('STATUS: BERHASIL');
    console.log('Waktu:', Date.now() - start, 'ms');
    console.log('Jawaban:', response.text);
  } catch (error) {
    console.log('STATUS: GAGAL');
    console.log('Waktu:', Date.now() - start, 'ms');
    console.log('Error:', error.message);
  }
}

async function main() {
  for (const model of models) {
    await testModel(model);
  }
}

main();
