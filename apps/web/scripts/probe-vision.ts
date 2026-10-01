// Sonde temporaire : envoie une photo à Gemini avec la consigne réelle de l'app.
// Usage : tsx --conditions=react-server scripts/probe-vision.ts <image> <modèle...>
import { readFileSync } from 'node:fs';
import { MAX_TOKENS, SYSTEM_PROMPT, USER_PROMPT } from '../src/server/clients/vision';
import { parseItems } from '../src/lib/vision-parse';

const [imagePath, ...models] = process.argv.slice(2);
const apiKey = process.env.PROBE_KEY ?? '';
const base64 = readFileSync(imagePath!).toString('base64');
const mimeType = imagePath!.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

for (const model of models) {
  const started = Date.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: USER_PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: MAX_TOKENS,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              aliments: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: { nom: { type: 'STRING' }, grammes: { type: 'INTEGER' } },
                  required: ['nom', 'grammes'],
                },
              },
            },
            required: ['aliments'],
          },
        },
      }),
    },
  );
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: Record<string, number>;
    error?: { message?: string };
  };
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  console.log(`\n== ${model} : HTTP ${response.status}, ${Date.now() - started} ms`);
  if (body.error) {
    console.log('erreur :', body.error.message);
    continue;
  }
  console.log('finishReason :', body.candidates?.[0]?.finishReason, JSON.stringify(body.usageMetadata));
  console.log('analyse :', JSON.stringify(parseItems(text)));
}
