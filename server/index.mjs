import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 8787)
const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'

const demoAudit = {
  environmentId: 'legak-demo-fr-employment-dd-001',
  target: 'Syntec SME, 78 employees, URSSAF period 2023-2026',
  findings: [
    {
      risk: 'high',
      title: 'Provident scheme not proven for one executive category',
      exposure: '42k-68k EUR',
      citation: 'Provident plan instrument.pdf#page=3',
    },
    {
      risk: 'medium',
      title: 'Vehicle benefit assessed under the wrong dated scale',
      exposure: '18k-31k EUR',
      citation: 'Payroll ledger 2025.xlsx#L214-L287',
    },
  ],
  nextAction:
    'Request the Q3 URSSAF statement and arbitrate the provident scheme category.',
}

function send(res, status, body) {
  res.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body, null, 2))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
  })
}

async function geminiSummary(payload) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
  if (!apiKey) return null

  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model,
    contents: [
      'You are Legak, an employment due diligence audit agent for French M&A.',
      'You may receive English or French source documents, but your product output is English.',
      'Return a concise deal-language summary. Do not invent citations.',
      JSON.stringify(payload),
    ].join('\n'),
  })

  return response.text
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (req.method === 'GET' && req.url === '/api/health') {
    return send(res, 200, {
      ok: true,
      mode: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? 'gemini' : 'demo',
      model,
    })
  }

  if (req.method === 'POST' && req.url === '/api/run-diligence') {
    try {
      const body = await readJson(req)
      const audit = {
        ...demoAudit,
        input: body,
        // ponytail: placeholder until sponsor accounts expose live Interactions API environments.
        computerUsePlan: [
          'open virtual data room',
          'click cited document',
          'highlight exact source passage',
        ],
      }
      return send(res, 200, {
        ...audit,
        geminiSummary: await geminiSummary(audit),
      })
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : 'invalid request' })
    }
  }

  send(res, 404, { error: 'not found' })
}).listen(port, () => {
  console.log(`Legak API listening on http://localhost:${port}`)
})
