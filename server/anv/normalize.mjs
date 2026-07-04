// Normalisations partagées : le code, pas le modèle, fait foi sur les valeurs.

export function normalizeNumber(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = String(value)
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/(eur|euros?|€|ttc)/gi, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

export function normalizeDate(value) {
  if (!value) return null
  const text = String(value).trim()
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  match = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  const months = { janvier: '01', fevrier: '02', février: '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07', aout: '08', août: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12', décembre: '12' }
  match = text.toLowerCase().match(/(\d{1,2})(?:er)?\s+([a-zéûù]+)\s+(\d{4})/)
  if (match && months[match[2]]) return `${match[3]}-${months[match[2]]}-${match[1].padStart(2, '0')}`
  return null
}

export function normalizeMonth(value) {
  if (!value) return null
  const text = String(value).trim()
  let match = text.match(/^(\d{4})[-/](\d{1,2})$/)
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}`
  match = text.match(/^(\d{1,2})[-/](\d{4})$/)
  if (match) return `${match[2]}-${match[1].padStart(2, '0')}`
  return normalizeDate(text)?.slice(0, 7) ?? null
}

export function normalizeBool(value) {
  return /^(oui|yes|true|1|x)$/i.test(String(value ?? '').trim())
}

export function normalizeEnergie(value) {
  const text = String(value ?? '').toLowerCase()
  if (/(elec|électr)/.test(text)) return 'electrique'
  if (/hybride/.test(text)) return 'hybride'
  return 'thermique'
}

export function normalizeMode(value) {
  return /(loc|lld|loa|leas|crédit-bail|credit-bail)/i.test(String(value ?? '')) ? 'location' : 'achat'
}

export function normalizeImmat(value) {
  return String(value ?? '').toUpperCase().replace(/[\s-]/g, '')
}

export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function sameSalarie(a, b) {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const ta = na.split(' ')
  const tb = nb.split(' ')
  const shared = ta.filter((token) => token.length > 2 && tb.includes(token))
  return shared.length >= Math.min(2, Math.min(ta.length, tb.length))
}

// Split CSV minimal conscient des guillemets ("a;b" ne casse pas la ligne).
export function splitCsvLine(line, delimiter) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1 } else { inQuotes = !inQuotes }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}
