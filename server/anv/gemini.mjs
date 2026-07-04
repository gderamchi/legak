// Helper Gemini unique : appel avec timeout, extraction JSON robuste.
// Toute erreur (clé absente, timeout, réponse non parsable) remonte en
// exception typée que l'appelant traite par un fallback explicite.

const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const TIMEOUT_MS = 75_000

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY)
}

export async function geminiCall(parts, { label, json = true } = {}) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error(`Gemini indisponible (pas de clé) [${label}]`)
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })

  // AbortSignal : la requête HTTP est réellement annulée au timeout (pas
  // seulement abandonnée côté promesse).
  const request = ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: Array.isArray(parts) ? parts : [{ text: String(parts) }] }],
    config: { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
  })
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Gemini timeout après ${TIMEOUT_MS / 1000}s [${label}]`)), TIMEOUT_MS + 5000))
  const response = await Promise.race([request, timeout])
  const text = response.text
  if (!json) return text

  let raw = String(text ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const first = raw.search(/[[{]/)
  const last = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'))
  if (first >= 0 && last > first) raw = raw.slice(first, last + 1)
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Réponse Gemini non parsable [${label}]`)
  }
}
