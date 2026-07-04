// Parsers hors ligne (repli sans Gemini) : ne reconnaissent que les formats
// canoniques de demo-data-room/. Le chemin nominal est l'extraction par
// mapping de schéma dans extract.mjs.

import { normalizeNumber, normalizeMonth, splitCsvLine } from './normalize.mjs'

function parseCsv(content) {
  const lines = content.replace(/^\ufeff/, '').split('\n').map((line) => line.trim()).filter(Boolean)
  const comments = lines.filter((line) => line.startsWith('#'))
  const rows = lines.filter((line) => !line.startsWith('#'))
  const header = splitCsvLine(rows[0], ';').map((cell) => cell.trim())
  return {
    comments,
    rows: rows.slice(1).map((line) => {
      const cells = splitCsvLine(line, ';')
      return Object.fromEntries(header.map((key, i) => [key, (cells[i] ?? '').trim()]))
    }),
  }
}

export function parseFleet(content) {
  const { rows, comments } = parseCsv(content)
  const vehicles = rows.map((row) => ({
    id: row.vehicule_id,
    immatriculation: row.immatriculation,
    modele: row.modele,
    energie: row.energie,
    mode: row.mode,
    coutAchat: normalizeNumber(row.cout_achat_ttc),
    coutGlobalAnnuel: normalizeNumber(row.cout_global_annuel_location_ttc),
    premiereImmatriculation: row.date_premiere_immatriculation || null,
    miseADisposition: row.date_mise_a_disposition,
    salarie: row.salarie,
    fonction: row.fonction,
    carburant: row.carburant_pris_en_charge === 'oui',
    siret: row.siret || null,
  }))
  const reassignments = comments
    .map((line) => {
      const match = line.match(/Réattribution : (\S+) précédemment affecté à (.+) du (\S+) au (\S+)/)
      return match ? { vehicleId: match[1], salarie: match[2], from: match[3], to: match[4] } : null
    })
    .filter(Boolean)
  return { vehicles, reassignments }
}

export function parsePayroll(content) {
  const { rows } = parseCsv(content)
  const parsed = rows.map((row) => ({
    month: normalizeMonth(row.mois),
    salarie: row.salarie,
    vehicleId: row.vehicule_id,
    declared: normalizeNumber(row.anv_vehicule_declare_eur),
    siret: row.siret || null,
  }))
  const usable = parsed.filter((row) => row.month && row.declared !== null)
  return { rows: usable, dropped: parsed.length - usable.length }
}

// Réduction des pièces libres à des faits typés (formats canoniques uniquement).
export function extractDocumentFacts(document) {
  const content = document.textContent ?? ''
  const facts = { docId: document.id, name: document.name }

  const siret = content.match(/SIRET\s*:?\s*(\d{14})/i)
  if (siret) facts.siret = siret[1]

  if (/politique v[ée]hicules?/i.test(document.name) || /^#.*politique v[ée]hicules?/im.test(content)) {
    facts.kind = 'politique-vehicule'
    facts.methodeForfait = /forfait/i.test(content)
    facts.carburantCommerciaux = /commercial[e]?s?[^.]*carburant|carburant[^.]*commercial/is.test(content)
    facts.avenantPrevu = /avenant/i.test(content)
  } else if (/^AVENANT AU CONTRAT DE TRAVAIL/m.test(content)) {
    facts.kind = 'avenant'
    facts.salarie = content.match(/AVENANT AU CONTRAT DE TRAVAIL — (.+)/)?.[1]?.trim()
    facts.vehicleRef = content.match(/\((V-\d{3})\)/)?.[1]
    facts.dateAttribution = content.match(/Date d'attribution\s*:\s*(\d{4}-\d{2}-\d{2})/)?.[1]
  } else if (/CERTIFICAT D'IMMATRICULATION/i.test(content)) {
    facts.kind = 'carte-grise'
    facts.immatriculation = content.match(/CERTIFICAT D'IMMATRICULATION\s+(\S+)/)?.[1]
    facts.premiereImmatriculation = content.match(/première immatriculation\s*:\s*(\d{4}-\d{2}-\d{2})/i)?.[1]
  } else if (/CONTRAT DE LOCATION LONGUE DURÉE/i.test(content)) {
    facts.kind = 'contrat-location'
    facts.vehicleRef = content.match(/—\s*(V-\d{3})/)?.[1]
    facts.coutGlobalAnnuel = normalizeNumber(content.match(/Coût global annuel TTC[^:]*:\s*([\d.,\s]+)/)?.[1])
  } else if (/mois;salarie;vehicule_id/.test(content)) {
    facts.kind = 'journal-paie'
  } else if (/vehicule_id;immatriculation/.test(content)) {
    facts.kind = 'listing-flotte'
  } else if (/note de contexte/i.test(content)) {
    facts.kind = 'contexte'
  } else {
    facts.kind = 'autre'
  }
  return facts
}
