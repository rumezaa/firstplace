import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { env } from './env.js';

const ai = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;

// Small in-memory cache: the same venue vibe is asked for by every phone.
const cache = new Map<string, { at: number; text: string }>();

/**
 * Ask Gemini for short text. Tries each configured model in turn, caches the
 * answer for `ttlMs`, and returns null (never throws) so a Gemini outage only
 * hides an AI line in the app instead of breaking a screen.
 */
export async function generate(
  cacheKey: string,
  prompt: string,
  ttlMs = 10 * 60_000,
  opts: { json?: boolean } = {},
): Promise<string | null> {
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttlMs) return hit.text;
  if (!ai) return null;

  for (const model of env.geminiModels) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.7,
          // Thinking models spend output tokens on reasoning first; keep it
          // minimal and leave room so short copy is never cut off mid-sentence.
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
          systemInstruction:
            'You write short, warm, plain-language copy for FirstPlace, a Calgary app that helps people ' +
            'become regulars at cafes and meet the familiar faces they keep seeing. Reply with the final ' +
            'copy only: no preamble, no options, no markdown. Never invent facts about specific people. ' +
            'Never mention names, ages, appearance or locations of individuals.',
        },
      });
      const finish = res.candidates?.[0]?.finishReason;
      const text = res.text?.trim();
      if (finish === 'MAX_TOKENS') throw new Error('reply was cut off');
      if (text) {
        cache.set(cacheKey, { at: Date.now(), text });
        return text;
      }
    } catch (err) {
      if (!env.isProduction) console.warn(`[gemini] ${model} failed:`, (err as Error).message.slice(0, 120));
    }
  }
  return null;
}

/** Parse a JSON array of strings out of a model reply, tolerating code fences. */
export function parseStringList(text: string | null, max = 3): string[] {
  if (!text) return [];
  const match = text.match(/\[[\s\S]*\]/);
  try {
    const list = JSON.parse(match ? match[0] : text);
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string').slice(0, max) : [];
  } catch {
    return text.split('\n').map((l) => l.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).slice(0, max);
  }
}
