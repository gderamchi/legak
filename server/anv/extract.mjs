// Extraction réelle des pièces : Gemini lit les documents tels qu'ils arrivent
// (en-têtes de colonnes arbitraires, formulations libres, dates françaises) et
// les réduit à un schéma strict ; le code normalise, parse les lignes et fait
// les jointures. Le modèle comprend, le code calcule. En cas d'échec Gemini,
// repli explicite sur les parsers hors ligne (fichiers canoniques uniquement),
// tracé dans le mode d'extraction.

import { readFileSync } from 'node:fs'
import { parseFleet, parsePayroll, extractDocumentFacts } from './parse.mjs'
import { geminiCall, hasGeminiKey } from './gemini.mjs'
import {
  normalizeNumber, normalizeDate, normalizeMonth, normalizeBool,
  normalizeEnergie, normalizeMode, normalizeImmat, sameSalarie, splitCsvLine,
} from './normalize.mjs'

function inlinePart(doc) {
  if (doc.textContent) return null
  try {
    const buffer = readFileSync(doc.storageKey)
    if (buffer.length > 3_000_000) return null
    return { inlineData: { mimeType: doc.mimeType ?? 'application/octet-stream', data: buffer.toString('base64') } }
  } catch {
    return null
  }
}

// ── Classification (intake) ─────────────────────────────────────────────────

export const KINDS = ['listing-flotte', 'journal-paie', 'politique-vehicule', 'avenant', 'carte-grise', 'contrat-location', 'attestation-eco-score', 'dsn', 'contexte', 'autre']

const kindProfile = {
  'listing-flotte': { theme: 'flotte', force: 'déclarative', note: 'Listing interne : déclaratif, à recouper avec cartes grises et contrats.' },
  'journal-paie': { theme: 'paie', force: 'probante', note: 'Export de paie : matériau de calcul.' },
  'politique-vehicule': { theme: 'politique', force: 'probante', note: 'Politique interne : engage la cible sur la méthode et le carburant.' },
  avenant: { theme: 'preuves-attribution', force: 'probante', note: "Accord écrit daté : preuve de la date d'attribution." },
  'carte-grise': { theme: 'preuves-vehicule', force: 'probante', note: "Certificat officiel : preuve de l'âge du véhicule." },
  'contrat-location': { theme: 'preuves-vehicule', force: 'probante', note: 'Contrat : preuve du coût global annuel.' },
  'attestation-eco-score': { theme: 'preuves-vehicule', force: 'probante', note: "Condition de l'abattement électrique." },
  dsn: { theme: 'paie', force: 'probante', note: 'Déclaratif mensuel : recoupement paie ↔ DSN.' },
  contexte: { theme: 'contexte', force: 'informative', note: 'Cadrage de mission.' },
  autre: { theme: 'a-classer', force: 'à qualifier', note: 'Nature non identifiée : revue humaine.' },
}

function qualify(doc, kind, siret, note, mission) {
  const profile = kindProfile[kind] ?? kindProfile.autre
  // Rattachement de périmètre : SIRET exact si connu, sinon préfixe SIREN.
  const siretIssue = Boolean(siret) && (
    (mission.siret && siret !== mission.siret)
    || (!mission.siret && mission.siren && !String(siret).startsWith(mission.siren))
  )
  return {
    docId: doc.id,
    name: doc.name,
    kind,
    theme: profile.theme,
    forceProbante: profile.force,
    note: note || profile.note,
    siretOk: !siretIssue,
    status: siretIssue ? 'hors périmètre (SIRET)' : kind === 'autre' ? 'à qualifier' : 'exploitable',
  }
}

function classifyFallback(mission, documents) {
  return {
    mode: 'parsers hors ligne (fichiers canoniques uniquement)',
    qualified: documents.map((doc) => {
      const facts = extractDocumentFacts(doc)
      return qualify(doc, facts.kind ?? 'autre', facts.siret, null, mission)
    }),
  }
}

export async function classifyDocuments(mission, documents) {
  if (!hasGeminiKey()) return classifyFallback(mission, documents)
  try {
    const parts = [{
      text: [
        'Tu es le collaborateur chargé du classement documentaire d\'une due diligence sociale M&A (thématique : avantages en nature véhicules, France).',
        `Cible auditée : ${mission.target}${mission.siret ? `, SIRET ${mission.siret}` : mission.siren ? `, SIREN ${mission.siren}` : ''}.`,
        `Classe chaque document dans un type : ${KINDS.join(' | ')}.`,
        '"listing-flotte" = tableau du parc automobile ; "journal-paie" = export de paie avec des lignes mensuelles d\'avantage en nature ; "avenant" = accord écrit d\'attribution d\'un véhicule à un salarié ; "carte-grise" = certificat d\'immatriculation ; "contrat-location" = contrat LLD/LOA/leasing ; "politique-vehicule" = car policy interne.',
        'Retourne STRICTEMENT un tableau JSON : [{"docId":"...","kind":"...","siret":"14 chiffres si présent sinon null","note":"une phrase en français sur la valeur probatoire"}]',
        JSON.stringify(documents.map((doc) => ({
          docId: doc.id,
          name: doc.name,
          mimeType: doc.mimeType,
          extrait: doc.textContent ? doc.textContent.slice(0, 1500) : '(document binaire joint)',
        }))),
      ].join('\n'),
    }]
    for (const doc of documents.filter((d) => !d.textContent).slice(0, 4)) {
      const part = inlinePart(doc)
      if (part) parts.push(part)
    }
    const items = await geminiCall(parts, { label: 'classification' })
    if (!Array.isArray(items)) throw new Error('classification invalide')
    const qualified = documents.map((doc) => {
      const item = items.find((entry) => entry.docId === doc.id)
      const kind = KINDS.includes(item?.kind) ? item.kind : 'autre'
      return qualify(doc, kind, item?.siret ?? null, item?.note ? String(item.note).slice(0, 200) : null, mission)
    })
    return { mode: 'Gemini (classification documentaire)', qualified }
  } catch (error) {
    const fallback = classifyFallback(mission, documents)
    fallback.mode += ` — repli : ${error.message}`
    return fallback
  }
}

// ── Extraction des tableaux par mapping de schéma ────────────────────────────
// Gemini identifie le délimiteur et le rôle de chaque colonne ; le code parse
// ensuite TOUTES les lignes lui-même : aucune valeur ne transite par le modèle.

function splitTable(content) {
  const lines = content.replace(/^\ufeff/, '').split('\n').map((line) => line.trim()).filter(Boolean)
  const comments = lines.filter((line) => /^(#|\/\/|NB\b|Note\b)/i.test(line))
  const rows = lines.filter((line) => !/^(#|\/\/|NB\b|Note\b)/i.test(line))
  return { comments, rows }
}

function columnIndex(headerCells, headerName) {
  if (!headerName) return -1
  const target = String(headerName).trim().toLowerCase()
  return headerCells.findIndex((cell) => cell.trim().toLowerCase() === target)
}

async function mapFleetSchema(doc) {
  const { rows, comments } = splitTable(doc.textContent)
  const sample = [rows[0], ...rows.slice(1, 6)].join('\n')
  const mapping = await geminiCall([{
    text: [
      'Voici l\'en-tête et les premières lignes d\'un listing de flotte automobile (due diligence sociale française).',
      'Identifie le délimiteur et le nom EXACT de la colonne correspondant à chaque champ (null si absente) :',
      '{"delimiter":";","columns":{"vehicleId":"...","immatriculation":"...","modele":"...","energie":"...","mode":"...","coutAchat":"...","coutLocationAnnuel":"...","premiereImmatriculation":"...","miseADisposition":"...","salarie":"...","fonction":"...","carburant":"...","siret":"..."}}',
      '"mode" = colonne indiquant achat vs location/LLD ; "carburant" = prise en charge du carburant par l\'employeur ; "miseADisposition" = date d\'attribution au salarié.',
      'Ensuite, si des notes ou commentaires mentionnent des réattributions de véhicules (un véhicule passé d\'un salarié à un autre), liste-les :',
      '"reassignments":[{"vehicleRef":"...","salarie":"ancien titulaire","from":"date ISO","to":"date ISO"}]',
      'Réponds en JSON strict {"delimiter":...,"columns":{...},"reassignments":[...]}.',
      '--- EN-TÊTE ET LIGNES ---',
      sample,
      '--- NOTES / COMMENTAIRES ---',
      comments.join('\n') || '(aucun)',
    ].join('\n'),
  }], { label: 'mapping flotte' })

  const delimiter = mapping.delimiter ?? ';'
  const headerCells = splitCsvLine(rows[0], delimiter)
  const col = Object.fromEntries(Object.entries(mapping.columns ?? {}).map(([field, name]) => [field, columnIndex(headerCells, name)]))
  const cell = (cells, field) => (col[field] >= 0 ? cells[col[field]]?.trim() ?? '' : '')

  let dropped = 0
  const vehicles = []
  rows.slice(1).forEach((line, index) => {
    const cells = splitCsvLine(line, delimiter)
    const immat = normalizeImmat(cell(cells, 'immatriculation'))
    const vehicle = {
      id: cell(cells, 'vehicleId') || immat || `V-${String(index + 1).padStart(3, '0')}`,
      immatriculation: immat,
      modele: cell(cells, 'modele') || 'véhicule',
      energie: normalizeEnergie(cell(cells, 'energie')),
      mode: normalizeMode(cell(cells, 'mode')),
      coutAchat: normalizeNumber(cell(cells, 'coutAchat')),
      coutGlobalAnnuel: normalizeNumber(cell(cells, 'coutLocationAnnuel')),
      premiereImmatriculation: normalizeDate(cell(cells, 'premiereImmatriculation')),
      miseADisposition: normalizeDate(cell(cells, 'miseADisposition')),
      salarie: cell(cells, 'salarie'),
      fonction: cell(cells, 'fonction'),
      carburant: normalizeBool(cell(cells, 'carburant')),
      siret: cell(cells, 'siret') || null,
    }
    if (vehicle.miseADisposition && vehicle.salarie) vehicles.push(vehicle)
    else dropped += 1
  })

  const reassignments = (Array.isArray(mapping.reassignments) ? mapping.reassignments : []).map((item) => ({
    vehicleId: String(item.vehicleRef ?? '').trim(),
    salarie: String(item.salarie ?? '').trim(),
    from: normalizeDate(item.from),
    to: normalizeDate(item.to),
  })).filter((item) => item.vehicleId && item.from && item.to)

  return { vehicles, reassignments, dropped }
}

async function mapPayrollSchema(doc) {
  const { rows } = splitTable(doc.textContent)
  const sample = [rows[0], ...rows.slice(1, 8)].join('\n')
  const mapping = await geminiCall([{
    text: [
      'Voici l\'en-tête et les premières lignes d\'un export de paie listant les avantages en nature véhicule mensuels.',
      'Identifie le délimiteur et le nom EXACT de la colonne pour chaque champ (null si absente) :',
      '{"delimiter":";","columns":{"month":"colonne de la période/mois","salarie":"...","vehicleRef":"référence ou id du véhicule","amount":"montant mensuel de l\'ANV en euros","siret":"..."}}',
      'Réponds en JSON strict.',
      '--- ÉCHANTILLON ---',
      sample,
    ].join('\n'),
  }], { label: 'mapping paie' })

  const delimiter = mapping.delimiter ?? ';'
  const headerCells = splitCsvLine(rows[0], delimiter)
  const col = Object.fromEntries(Object.entries(mapping.columns ?? {}).map(([field, name]) => [field, columnIndex(headerCells, name)]))
  const cell = (cells, field) => (col[field] >= 0 ? cells[col[field]]?.trim() ?? '' : '')

  const parsed = []
  let dropped = 0
  for (const line of rows.slice(1)) {
    const cells = splitCsvLine(line, delimiter)
    const month = normalizeMonth(cell(cells, 'month'))
    const declared = normalizeNumber(cell(cells, 'amount'))
    if (!month || declared === null) { dropped += 1; continue }
    parsed.push({
      month,
      salarie: cell(cells, 'salarie'),
      vehicleRef: cell(cells, 'vehicleRef'),
      declared,
      siret: cell(cells, 'siret') || null,
    })
  }
  return { rows: parsed, dropped }
}

// ── Extraction des pièces libres (avenants, cartes grises, contrats…) ───────

async function extractProbativeFacts(documents) {
  if (!documents.length) return []
  const parts = [{
    text: [
      'Tu lis des pièces probatoires d\'une due diligence sociale française (avantages en nature véhicules).',
      'Pour chaque document, retourne un objet typé selon sa nature. Dates STRICTEMENT au format ISO YYYY-MM-DD. Montants en nombre (euros TTC).',
      'Schémas par nature :',
      '- avenant : {"docId":"...","kind":"avenant","salarie":"NOM Prénom","vehicleRef":"référence du véhicule si citée","immatriculation":"plaque si citée","dateAttribution":"YYYY-MM-DD","siret":"..."}',
      '- carte-grise : {"docId":"...","kind":"carte-grise","immatriculation":"plaque","premiereImmatriculation":"YYYY-MM-DD","energie":"thermique|electrique|hybride"}',
      '- contrat-location : {"docId":"...","kind":"contrat-location","vehicleRef":"...","immatriculation":"...","coutGlobalAnnuel":9600}',
      '- politique-vehicule : {"docId":"...","kind":"politique-vehicule","methodeForfait":true,"carburantCommerciaux":true,"avenantPrevu":true}',
      '- attestation-eco-score : {"docId":"...","kind":"attestation-eco-score","vehicleRef":"...","immatriculation":"...","ecoScoreConforme":true}',
      'Retourne STRICTEMENT un tableau JSON avec un objet par document. N\'invente aucune valeur : mets null si l\'information est absente.',
      JSON.stringify(documents.map((doc) => ({
        docId: doc.id,
        name: doc.name,
        contenu: doc.textContent ? doc.textContent.slice(0, 2400) : '(binaire joint)',
      }))),
    ].join('\n'),
  }]
  for (const doc of documents.filter((d) => !d.textContent).slice(0, 4)) {
    const part = inlinePart(doc)
    if (part) parts.push(part)
  }
  const items = await geminiCall(parts, { label: 'extraction probatoire' })
  return Array.isArray(items) ? items : []
}

// ── Jointures tolérantes ─────────────────────────────────────────────────────

function matchVehicle(vehicles, { vehicleRef, immatriculation, salarie }) {
  const ref = String(vehicleRef ?? '').trim().toLowerCase()
  const immat = normalizeImmat(immatriculation)
  return vehicles.find((vehicle) =>
    (ref && vehicle.id.toLowerCase() === ref)
    || (immat && vehicle.immatriculation === immat)) ??
    (salarie ? single(vehicles.filter((vehicle) => sameSalarie(vehicle.salarie, salarie))) : undefined)
}

function single(list) {
  return list.length === 1 ? list[0] : undefined
}

function crossReferenceTolerant(vehicles, reassignments, facts) {
  const cartesGrises = facts.filter((fact) => fact.kind === 'carte-grise')
  const avenants = facts.filter((fact) => fact.kind === 'avenant')
  const contrats = facts.filter((fact) => fact.kind === 'contrat-location')
  const ecoScores = facts.filter((fact) => fact.kind === 'attestation-eco-score')

  return vehicles.map((vehicle) => {
    const carteGrise = cartesGrises.find((fact) => normalizeImmat(fact.immatriculation) === vehicle.immatriculation)
    const avenant = avenants.find((fact) => {
      const target = matchVehicle([vehicle], fact)
      return target && (!fact.salarie || sameSalarie(fact.salarie, vehicle.salarie))
    })
    const contrat = contrats.find((fact) => matchVehicle([vehicle], fact))
    const ecoScore = ecoScores.find((fact) => matchVehicle([vehicle], fact))
    const reassignment = reassignments.find((item) => {
      const ref = item.vehicleId.toLowerCase()
      return vehicle.id.toLowerCase() === ref || vehicle.immatriculation === normalizeImmat(item.vehicleId)
    })
    // La date d'attribution écrite (avenant, probante) prévaut sur le listing
    // (déclaratif) ; toute divergence est tracée pour le contrôle ANV-PRE-001.
    const avenantDate = normalizeDate(avenant?.dateAttribution)
    const dateDiscrepancy = avenantDate && vehicle.miseADisposition && avenantDate !== vehicle.miseADisposition
      ? { listing: vehicle.miseADisposition, avenant: avenantDate }
      : null
    return {
      ...vehicle,
      miseADisposition: avenantDate ?? vehicle.miseADisposition,
      dateDiscrepancy,
      premiereImmatriculation: vehicle.premiereImmatriculation ?? normalizeDate(carteGrise?.premiereImmatriculation) ?? null,
      coutGlobalAnnuel: vehicle.coutGlobalAnnuel ?? normalizeNumber(contrat?.coutGlobalAnnuel) ?? null,
      ecoScoreProuve: Boolean(ecoScore?.ecoScoreConforme),
      preuves: {
        avenant: avenant ? { docId: avenant.docId, name: avenant.name, dateAttribution: avenantDate } : null,
        carteGrise: carteGrise ? { docId: carteGrise.docId, name: carteGrise.name } : null,
        contratLocation: contrat ? { docId: contrat.docId, name: contrat.name, coutGlobalAnnuel: normalizeNumber(contrat.coutGlobalAnnuel) } : null,
      },
      reassignment: reassignment ? { vehicleId: vehicle.id, salarie: reassignment.salarie, from: reassignment.from, to: reassignment.to } : null,
      forceProbanteMiseADispo: avenant ? 'probante' : 'declarative',
    }
  })
}

function resolvePayroll(rows, vehicles) {
  const resolved = []
  const unmatchedSalaries = new Set()
  let unmatched = 0
  for (const row of rows) {
    const vehicle = matchVehicle(vehicles, { vehicleRef: row.vehicleRef, salarie: row.salarie })
    if (!vehicle) {
      unmatched += 1
      if (row.salarie) unmatchedSalaries.add(row.salarie)
      continue
    }
    resolved.push({ ...row, vehicleId: vehicle.id })
  }
  return { resolved, unmatched, unmatchedSalaries: [...unmatchedSalaries] }
}

// ── Point d'entrée analyse ───────────────────────────────────────────────────

function offlineStructured(mission, fleetDoc, payrollDoc, probativeDocs, presenceMarkers, reason) {
  const { vehicles, reassignments } = parseFleet(fleetDoc.textContent)
  const usable = vehicles.filter((v) => v.miseADisposition && v.salarie)
  const payrollRaw = parsePayroll(payrollDoc.textContent)
  const facts = probativeDocs.map((doc) => ({ ...extractDocumentFacts(doc), docId: doc.id, name: doc.name }))
  const enriched = crossReferenceTolerant(usable, reassignments, facts)
  const { resolved, unmatched, unmatchedSalaries } = resolvePayroll(
    payrollRaw.rows.map((row) => ({ ...row, vehicleRef: row.vehicleId })),
    enriched,
  )
  return {
    mode: reason ? `parsers hors ligne (repli : ${reason})` : 'parsers hors ligne',
    vehicles: enriched,
    payroll: resolved,
    unmatchedPayroll: unmatched,
    unmatchedPayrollSalaries: unmatchedSalaries,
    droppedPayroll: payrollRaw.dropped,
    droppedVehicles: vehicles.length - usable.length,
    documentFacts: [...facts, ...presenceMarkers],
    policyFact: facts.find((fact) => fact.kind === 'politique-vehicule') ?? null,
    fleetDocName: fleetDoc.name,
    payrollDocName: payrollDoc.name,
  }
}

export async function extractStructuredData(mission) {
  const kinds = new Map((mission.intake?.qualified ?? []).map((item) => [item.docId, item.kind]))
  const byKind = (kind) => mission.documents.filter((doc) => kinds.get(doc.id) === kind)

  const fleetDoc = byKind('listing-flotte')[0]
  const payrollDoc = byKind('journal-paie')[0]
  if (!fleetDoc || !payrollDoc) {
    const missing = [!fleetDoc && 'listing flotte', !payrollDoc && 'journal de paie ANV'].filter(Boolean).join(' et ')
    return { error: `Pièces structurantes manquantes ou non reconnues : ${missing}.` }
  }
  if (!fleetDoc.textContent || !payrollDoc.textContent) {
    return { error: 'Le listing flotte et le journal de paie doivent être des fichiers texte/CSV lisibles dans cette version.' }
  }

  const probativeDocs = mission.documents.filter((doc) =>
    ['avenant', 'carte-grise', 'contrat-location', 'politique-vehicule', 'attestation-eco-score'].includes(kinds.get(doc.id)))

  // Marqueurs de présence pour le moteur (contrôle de complétude et Q&A).
  const presenceMarkers = [
    { docId: fleetDoc.id, name: fleetDoc.name, kind: 'listing-flotte' },
    { docId: payrollDoc.id, name: payrollDoc.name, kind: 'journal-paie' },
    ...byKind('dsn').map((doc) => ({ docId: doc.id, name: doc.name, kind: 'dsn' })),
  ]

  if (!hasGeminiKey()) {
    return offlineStructured(mission, fleetDoc, payrollDoc, probativeDocs, presenceMarkers, null)
  }

  try {
    const [fleet, payroll, rawFacts] = await Promise.all([
      mapFleetSchema(fleetDoc),
      mapPayrollSchema(payrollDoc),
      extractProbativeFacts(probativeDocs),
    ])

    if (!fleet.vehicles.length) return { error: 'Le listing flotte n\'a produit aucun véhicule exploitable (dates de mise à disposition ou salariés manquants).' }
    if (!payroll.rows.length) return { error: 'Le journal de paie n\'a produit aucune ligne exploitable (mois ou montants illisibles).' }

    const facts = rawFacts.map((fact) => ({
      ...fact,
      name: mission.documents.find((doc) => doc.id === fact.docId)?.name ?? fact.docId,
    }))

    const enriched = crossReferenceTolerant(fleet.vehicles, fleet.reassignments, facts)
    const { resolved, unmatched, unmatchedSalaries } = resolvePayroll(payroll.rows, enriched)

    return {
      mode: 'Gemini (mapping de schéma + extraction typée), calculs par code',
      vehicles: enriched,
      payroll: resolved,
      unmatchedPayroll: unmatched,
      unmatchedPayrollSalaries: unmatchedSalaries,
      droppedPayroll: payroll.dropped,
      droppedVehicles: fleet.dropped,
      documentFacts: [...facts, ...presenceMarkers],
      policyFact: facts.find((fact) => fact.kind === 'politique-vehicule') ?? null,
      fleetDocName: fleetDoc.name,
      payrollDocName: payrollDoc.name,
    }
  } catch (error) {
    // Repli honnête : parsers hors ligne (ne fonctionne que sur les formats
    // canoniques) — le mode d'extraction est affiché dans l'audit log.
    const fallback = offlineStructured(mission, fleetDoc, payrollDoc, probativeDocs, presenceMarkers, error.message)
    if (!fallback.vehicles.length || !fallback.payroll.length) {
      return { error: `Extraction Gemini indisponible (${error.message}) et les parsers hors ligne ne reconnaissent pas ces formats. Relancez l'audit.` }
    }
    return fallback
  }
}
