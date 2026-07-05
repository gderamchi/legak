import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { demoTarget, demoDataRoom } from './anv/demo-data.mjs'
import { classifyDocuments, extractStructuredData } from './anv/extract.mjs'
import { runAudit } from './anv/engine.mjs'
import { contradictionAgent, draftingAgent } from './anv/agents.mjs'
import { openDossier, recordMilestone, recallDossier } from './anv/dossier.mjs'
import { buildReport, reportToMarkdown } from './anv/report.mjs'
import { appendProof, proofFromAudit } from './anv/proof-trail.mjs'
import { handleVdr } from './vdr/site.mjs'
import { collectFromVdr, postQaToVdr } from './vdr/operator.mjs'
import { startLiveSession, liveStatus, serveLiveFrame, attachMjpegClient } from './vdr/live.mjs'

const port = Number(process.env.PORT ?? 8787)
const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const storePath = fileURLToPath(new URL('../data/missions.json', import.meta.url))
const uploadsRoot = fileURLToPath(new URL('../data/uploads', import.meta.url))
const missions = loadMissions()

// Liste de pièces attendues pour la thématique ANV véhicules (adaptation de la
// check-list de collecte d'un audit URSSAF au contexte buy-side).
const expectedPieces = [
  { id: 'piece-flotte', label: 'Listing flotte avec affectation par salarié', why: 'Périmètre du contrôle : véhicules, salariés, dates de mise à disposition.' },
  { id: 'piece-paie', label: 'Journal de paie des lignes ANV véhicule (période auditée)', why: 'Matériau du contrôle de calcul.' },
  { id: 'piece-politique', label: 'Politique véhicules / car policy', why: 'Méthode d\'évaluation, prise en charge du carburant, procédure d\'attribution.' },
  { id: 'piece-avenants', label: 'Avenants ou accords écrits de mise à disposition', why: 'La date d\'attribution détermine le barème applicable.' },
  { id: 'piece-cartes-grises', label: 'Cartes grises de la flotte', why: 'Preuve de l\'âge du véhicule (taux récent vs plus de 5 ans) et de l\'énergie.' },
  { id: 'piece-contrats-location', label: 'Contrats LLD / LOA avec coût global annuel', why: 'Assiette du forfait location.' },
  { id: 'piece-eco-score', label: 'Attestations d\'éco-score (véhicules électriques)', why: 'Condition de l\'abattement de 70 % depuis le 01/02/2025.' },
  { id: 'piece-dsn', label: 'DSN mensuelles par établissement', why: 'Contrôle de cohérence paie ↔ déclaratif.' },
]

function loadMissions() {
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(storePath, 'utf8'))))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`missions.json illisible (${error.message}) : démarrage sur un état vide, fichier conservé.`)
    }
    return new Map()
  }
}

// Écriture atomique : un crash en cours d'écriture ne corrompt pas le store.
function saveMissions() {
  mkdirSync(dirname(storePath), { recursive: true })
  const tmpPath = `${storePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(Object.fromEntries(missions), null, 2))
  renameSync(tmpPath, storePath)
}

class MissionInputError extends Error {}

const nowISO = () => new Date().toISOString()
const sanitize = (value) => String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'file'

function appendAudit(mission, event, detail = {}) {
  mission.auditLog = [...(mission.auditLog ?? []), { at: nowISO(), event, ...detail }].slice(-120)
  mission.updatedAt = nowISO()
  proofFromAudit(mission, event, detail)
}

// Validation du cadrage (création et recadrage) : cible et période
// obligatoires, aucun défaut silencieux.
function validateCadrage(input) {
  const target = String(input.target ?? '').trim()
  const periodStart = String(input.periodStart ?? '').trim()
  const periodEnd = String(input.periodEnd ?? '').trim()
  if (!target) throw new MissionInputError('La cible est obligatoire.')
  if (!/^\d{4}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}$/.test(periodEnd)) {
    throw new MissionInputError('La période auditée est obligatoire (format AAAA-MM).')
  }
  if (periodStart > periodEnd) throw new MissionInputError('Le début de période doit précéder la fin.')
  if (input.siren && !/^\d{9}$/.test(String(input.siren))) throw new MissionInputError('SIREN invalide (9 chiffres).')
  if (input.siret && !/^\d{14}$/.test(String(input.siret))) throw new MissionInputError('SIRET invalide (14 chiffres).')
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (periodEnd > currentMonth) throw new MissionInputError(`La fin de période ne peut pas dépasser le mois en cours (${currentMonth}).`)
  const [sy, sm] = periodStart.split('-').map(Number)
  const [ey, em] = periodEnd.split('-').map(Number)
  if ((ey - sy) * 12 + (em - sm) > 120) throw new MissionInputError('Période auditée limitée à 10 ans.')
  return {
    target,
    siren: input.siren ? String(input.siren) : null,
    siret: input.siret ? String(input.siret) : null,
    convention: input.convention ? String(input.convention).trim() : null,
    effectif: Number.isFinite(Number(input.effectif)) && Number(input.effectif) > 0 ? Number(input.effectif) : null,
    period: `${periodStart} → ${periodEnd}`,
    periodStart,
    periodEnd,
  }
}

// Aucun préremplissage : le cadrage vient de l'utilisateur (ou explicitement
// de demoTarget pour la route de smoke test /api/run-diligence).
function createMission(input) {
  const cadrage = validateCadrage(input)

  const mission = {
    schemaVersion: 2,
    id: randomUUID(),
    ...cadrage,
    thematique: 'Avantages en nature véhicules',
    status: 'cadrage',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    requestList: expectedPieces.map((p) => ({ ...p, status: 'à demander' })),
    documents: [],
    intake: null,
    controls: [],
    findings: [],
    qaTracker: [],
    vehicleAnalyses: [],
    totals: null,
    riskScore: null,
    report: null,
    reportMarkdown: null,
    vdrEvidence: [],
    antigravity: null,
    auditLog: [],
    proofTrail: [],
  }
  appendAudit(mission, 'mission.cadrage', {
    target: mission.target, siren: mission.siren, period: mission.period,
    convention: mission.convention, thematique: mission.thematique,
    note: `Liste de collecte générée : ${expectedPieces.length} familles de pièces.`,
  })
  // Mémoire de mission : l'agent Antigravity ouvre le dossier de travail dans
  // son environnement persistant (asynchrone, jamais bloquant pour le cadrage).
  // Le résultat réel (succès/échec) est consigné dans mission.antigravity.milestones.
  openDossier(mission, saveMissions)
  appendAudit(mission, 'dossier.ouverture', {
    note: mission.antigravity?.lastError
      ? `Mémoire de mission désactivée : ${mission.antigravity.lastError}`
      : 'Ouverture du dossier de travail demandée à l\'agent Antigravity (Interactions API) — résultat consigné dans les jalons du dossier.',
  })
  missions.set(mission.id, mission)
  saveMissions()
  return mission
}

// ── Étape collecte : réception + tri physique des pièces sur disque ──────────
// L'agent d'intake organise réellement les fichiers dans data/uploads/<mission>/
// <thème>/ après pré-qualification — c'est le classement documentaire de
// l'avocat, tracé dans l'audit log.

function storeDocument(mission, input) {
  const name = String(input.name ?? 'document')
  const textLike = /^text\//.test(input.mimeType ?? '') || /\.(csv|txt|md|xml)$/i.test(name)
  const content = input.contentBase64
    ? Buffer.from(input.contentBase64, 'base64')
    : Buffer.from(String(input.content ?? ''), 'utf8')
  const doc = {
    id: input.id ?? randomUUID(),
    name,
    mimeType: input.mimeType ?? (textLike ? 'text/plain' : 'application/octet-stream'),
    sizeBytes: content.length,
    // Empreinte d'intégrité : SHA-256 du contenu complet.
    fingerprint: createHash('sha256').update(content).digest('hex'),
    receivedAt: nowISO(),
    textContent: textLike ? content.toString('utf8') : null,
    theme: 'a-classer',
    storageKey: null,
  }
  const storagePath = join(uploadsRoot, sanitize(mission.id), 'inbox', `${sanitize(doc.id)}-${sanitize(name)}`)
  mkdirSync(dirname(storagePath), { recursive: true })
  writeFileSync(storagePath, content)
  doc.storageKey = storagePath
  return doc
}

function fileDocumentByTheme(mission, doc, theme) {
  const targetPath = join(uploadsRoot, sanitize(mission.id), sanitize(theme), `${sanitize(doc.id)}-${sanitize(doc.name)}`)
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, readFileSync(doc.storageKey))
  doc.theme = theme
  doc.storageKey = targetPath
  return targetPath
}

// Jobs de tri en cours (progression consultée en polling par le front pour
// montrer l'agent organiser les pièces en direct). Non persisté : un job
// interrompu par un redémarrage se relance simplement.
const intakeJobs = new Map()

// Jobs d'analyse en cours : trail de preuve live pendant l'audit.
const analysisProgressJobs = new Map()

// Analyses en cours : verrou anti double-POST et anti-mutation concurrente.
const analysisJobs = new Set()

function busyGuard(mission, res) {
  if (intakeJobs.get(mission.id)?.running) {
    send(res, 409, { error: 'Tri en cours : attendez la fin du classement.' })
    return true
  }
  if (analysisJobs.has(mission.id)) {
    send(res, 409, { error: 'Analyse en cours : attendez la fin de l\'audit.' })
    return true
  }
  return false
}

function resetAnalysis(mission) {
  mission.intake = null
  mission.controls = []
  mission.findings = []
  mission.qaTracker = []
  mission.vehicleAnalyses = []
  mission.totals = null
  mission.riskScore = null
  mission.report = null
  mission.reportMarkdown = null
  intakeJobs.delete(mission.id)
}

// paceMs > 0 : tri "en direct" (une pièce déplacée à la fois, visible côté
// front) ; paceMs = 0 : tri immédiat (utilisé par analyze si non fait).
async function executeIntake(mission, { paceMs = 0 } = {}) {
  const job = { running: true, startedAt: nowISO(), total: mission.documents.length, events: [], error: null }
  intakeJobs.set(mission.id, job)
  try {
    appendProof(mission, {
      phase: 'intake',
      actor: 'gemini',
      action: 'Démarrage du tri documentaire',
      rationale: `${mission.documents.length} pièce(s) à classifier (nature, SIRET, force probante).`,
      status: 'active',
    })
    const intake = await classifyDocuments(mission, mission.documents)

    const moved = []
    for (const item of intake.qualified) {
      const doc = mission.documents.find((d) => d.id === item.docId)
      if (doc) {
        fileDocumentByTheme(mission, doc, item.theme)
        moved.push(`${doc.name} → ${item.theme}/`)
      }
      job.events.push({
        seq: job.events.length + 1,
        at: nowISO(),
        docId: item.docId,
        name: item.name,
        kind: item.kind,
        theme: item.theme,
        forceProbante: item.forceProbante,
        siretOk: item.siretOk,
        note: item.note,
      })
      appendProof(mission, {
        phase: 'intake',
        actor: intake.mode?.includes('Gemini') ? 'gemini' : 'systeme',
        action: `${item.name} → ${item.theme}`,
        rationale: `${item.kind} · force ${item.forceProbante}${item.note ? ` — ${item.note}` : ''}${item.siretOk ? '' : ' · SIRET hors périmètre'}`,
        refs: [item.name, item.kind],
        meta: { docId: item.docId, theme: item.theme },
      })
      if (paceMs) await new Promise((resolve) => setTimeout(resolve, paceMs))
    }

    const kindToPiece = {
      'listing-flotte': 'piece-flotte',
      'journal-paie': 'piece-paie',
      'politique-vehicule': 'piece-politique',
      avenant: 'piece-avenants',
      'carte-grise': 'piece-cartes-grises',
      'contrat-location': 'piece-contrats-location',
      'attestation-eco-score': 'piece-eco-score',
      dsn: 'piece-dsn',
    }
    const receivedKinds = new Set(intake.qualified.map((q) => q.kind))
    // Familles où la réception peut être incomplète (une pièce par véhicule/salarié) :
    // le moteur de contrôle tranchera « partiel » vs « complet » via les preuves croisées.
    const perVehiclePieces = ['piece-avenants', 'piece-cartes-grises', 'piece-contrats-location', 'piece-eco-score']
    for (const request of mission.requestList) {
      const kind = Object.entries(kindToPiece).find(([, pieceId]) => pieceId === request.id)?.[0]
      if (kind && receivedKinds.has(kind)) {
        request.status = perVehiclePieces.includes(request.id) ? 'partiel' : 'reçue'
      } else {
        request.status = 'manquante'
      }
    }

    mission.intake = intake
    mission.status = 'pieces-qualifiees'
    appendAudit(mission, 'intake.classement', {
      mode: intake.mode,
      documentCount: mission.documents.length,
      operations: moved,
      note: 'Pièces pré-qualifiées (nature, SIRET, force probante) et classées par thème sur le disque.',
    })
    saveMissions()
    return mission
  } catch (error) {
    job.error = error instanceof Error ? error.message : 'échec du tri'
    throw error
  } finally {
    job.running = false
  }
}

// ── Étape analyse : moteur de règles + contradiction + rapport ────────────────

async function runAnalysis(mission, liveJob = null) {
  const emit = (event) => appendProof(mission, event, liveJob)

  emit({
    phase: 'extraction',
    actor: 'gemini',
    action: 'Lecture des pièces et mapping de schéma',
    rationale: 'Le modèle identifie le rôle de chaque colonne ; le code parse toutes les lignes.',
    status: 'active',
  })
  saveMissions()

  const structured = await extractStructuredData(mission)
  if (structured.error) {
    appendAudit(mission, 'analyse.rejetee', { reason: structured.error })
    saveMissions()
    return { error: `Impossible de lancer l'analyse : ${structured.error}` }
  }

  appendAudit(mission, 'analyse.extraction', {
    mode: structured.mode,
    vehicles: structured.vehicles.length,
    payrollRows: structured.payroll.length,
    unmatchedPayrollRows: structured.unmatchedPayroll,
    droppedPayrollRows: structured.droppedPayroll,
    note: `Extraction : ${structured.mode}. ${structured.vehicles.length} véhicules, ${structured.payroll.length} lignes de paie rattachées${structured.unmatchedPayroll ? `, ${structured.unmatchedPayroll} ligne(s) non rattachable(s)` : ''}${structured.droppedPayroll ? `, ${structured.droppedPayroll} ligne(s) illisible(s)` : ''}.`,
  })
  emit({
    phase: 'extraction',
    actor: structured.mode?.includes('Gemini') ? 'gemini' : 'systeme',
    action: 'Extraction terminée',
    rationale: `${structured.vehicles.length} véhicule(s), ${structured.payroll.length} ligne(s) de paie rattachée(s)${structured.unmatchedPayroll ? `, ${structured.unmatchedPayroll} non rattachable(s)` : ''}.`,
    refs: [structured.fleetDocName, structured.payrollDocName].filter(Boolean),
    meta: { mode: structured.mode },
  })
  saveMissions()

  structured.missingEvidence = []
  const auditResult = runAudit({
    mission,
    structured,
    onProgress: (event) => {
      emit(event)
      if (liveJob && event.status === 'active') saveMissions()
    },
  })

  appendAudit(mission, 'analyse.controles', {
    findings: auditResult.findings.map((f) => `${f.id} (${f.severity})`),
    assietteEludee: auditResult.totals.assietteEludee,
    assiettePrescrite: auditResult.totals.assiettePrescrite,
    expositionBasse: auditResult.totals.exposure.low,
    expositionHaute: auditResult.totals.exposure.high,
    duplicatePayrollRows: auditResult.duplicatePayrollRows,
    note: `Contrôles exécutés règle par règle par le moteur déterministe (barèmes versionnés, prescription appliquée à partir de ${auditResult.totals.prescriptionStart}${auditResult.duplicatePayrollRows ? `, ${auditResult.duplicatePayrollRows} ligne(s) de paie dupliquée(s) sommée(s)` : ''}).`,
  })
  saveMissions()

  emit({
    phase: 'contradiction',
    actor: 'gemini',
    action: 'Contrôle croisé des conclusions',
    rationale: 'Un second agent challenge chaque constat (anti-ancrage) ; les chiffres restent ceux du moteur.',
    status: 'active',
  })
  saveMissions()

  const [contradiction, execSummary] = await Promise.all([
    contradictionAgent(mission, auditResult),
    draftingAgent(mission, auditResult),
  ])
  for (const finding of auditResult.findings) {
    finding.contradiction = contradiction.reviews.find((r) => r.findingId === finding.id) ?? null
    const review = finding.contradiction
    if (review) {
      emit({
        phase: 'contradiction',
        actor: contradiction.mode?.includes('Gemini') ? 'gemini' : 'systeme',
        action: `${finding.id} — ${review.verdict}`,
        rationale: review.note,
        refs: [finding.id],
        meta: { findingId: finding.id, verdict: review.verdict },
      })
    }
  }
  appendAudit(mission, 'analyse.contradiction', {
    mode: contradiction.mode,
    verdicts: contradiction.reviews.map((r) => `${r.findingId}: ${r.verdict}`),
    note: 'Contrôle croisé des conclusions (anti-ancrage) — les chiffres restent la propriété du moteur.',
  })
  saveMissions()

  emit({
    phase: 'rapport',
    actor: 'gemini',
    action: 'Assemblage du package décisionnel',
    rationale: 'Executive summary, risk register, clauses SPA et plan post-closing.',
    status: 'active',
  })

  const report = buildReport({ mission, auditResult, contradiction, execSummary, intake: mission.intake ?? { qualified: [] } })
  const markdown = reportToMarkdown(report, auditResult.vehicleAnalyses)

  mission.controls = auditResult.controls
  mission.findings = auditResult.findings
  mission.qaTracker = auditResult.qaTracker
  mission.vehicleAnalyses = auditResult.vehicleAnalyses
  mission.totals = auditResult.totals
  mission.riskScore = auditResult.riskScore
  mission.report = report
  mission.reportMarkdown = markdown
  mission.status = 'rapport-pret'

  const reportPath = join(uploadsRoot, sanitize(mission.id), 'rapport', 'rapport-dd-sociale-anv.md')
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(reportPath, markdown)

  appendAudit(mission, 'rapport.genere', {
    redaction: execSummary.mode,
    path: reportPath,
    findingCount: auditResult.findings.length,
    note: 'Package décisionnel généré : executive summary, risk register, fiches risque, SPA, Q&A, post-closing.',
  })
  // Jalon mémoire : conclusions du moteur consignées au dossier Antigravity
  // (chiffres transmis tels quels, jamais recalculés par l'agent).
  recordMilestone(mission, 'analyse.rapport', {
    constats: auditResult.findings.map((f) => ({ id: f.id, gravite: f.severity, titre: f.title, assietteEludee: f.assietteEludee })),
    totaux: auditResult.totals,
    scoreRisque: auditResult.riskScore,
    piecesManquantes: auditResult.qaTracker.map((q) => ({ id: q.id, piece: q.piece, urgence: q.urgency })),
  }, 'Le moteur déterministe du cabinet a rendu ses conclusions (chiffres à recopier tels quels, sans recalcul). Consigne les constats au journal et la liste des pièces manquantes dans dossier/pieces-manquantes.md — elle prépare la prochaine action de l\'opérateur computer use au VDR.', saveMissions)
  saveMissions()
  return { mission }
}

async function executeAnalysis(mission) {
  const job = { running: true, startedAt: nowISO(), events: [], error: null, phase: null, lastActor: null }
  analysisProgressJobs.set(mission.id, job)
  analysisJobs.add(mission.id)
  try {
    if (!mission.intake) {
      if (!mission.documents.length) {
        job.error = 'Aucune pièce reçue.'
        return
      }
      await executeIntake(mission, { paceMs: 0 })
    }
    const outcome = await runAnalysis(mission, job)
    if (outcome.error) job.error = outcome.error
  } catch (error) {
    job.error = error instanceof Error ? error.message : 'échec analyse'
  } finally {
    job.running = false
    analysisJobs.delete(mission.id)
    saveMissions()
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

function send(res, status, body, contentType = 'application/json; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': contentType,
    ...extraHeaders,
  })
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2))
}

// Accumulation en Buffers (pas de corruption UTF-8 aux frontières de chunks),
// limite de taille avec vrai rejet, gestion des erreurs de flux.
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 16_000_000) {
        reject(new MissionInputError('Payload trop volumineux (limite : 16 Mo).'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', (error) => reject(error))
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new MissionInputError('Corps de requête JSON invalide.'))
      }
    })
  })
}

function missionSummary(mission) {
  return {
    id: mission.id,
    target: mission.target,
    period: mission.period,
    convention: mission.convention,
    thematique: mission.thematique,
    status: mission.status,
    documentCount: mission.documents.length,
    findingCount: mission.findings.length,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
  }
}

// Le state complet sans le contenu texte des documents (payloads volumineux)
// ni les chemins disque du serveur.
function missionView(mission) {
  return {
    ...mission,
    documents: mission.documents.map(({ textContent, storageKey: _storageKey, ...doc }) => ({
      ...doc,
      preview: textContent ? textContent.slice(0, 400) : null,
    })),
  }
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const parts = url.pathname.split('/').filter(Boolean)

  try {
    // Portail VDR (vue vendeur) : salle de données consultation seule + Q&A.
    if (await handleVdr(req, res, url)) return

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, {
        ok: true,
        mode: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? 'gemini' : 'demo',
        model,
        thematique: 'Avantages en nature véhicules',
      })
    }

    // Cadrage de la cible fictive (parcours démo) : le front recopie ces
    // valeurs dans le formulaire — le préremplissage reste un geste explicite
    // de l'utilisateur, jamais un défaut silencieux du serveur.
    if (req.method === 'GET' && url.pathname === '/api/demo-cadrage') {
      const { period: _period, ...cadrage } = demoTarget
      return send(res, 200, cadrage)
    }

    if (req.method === 'POST' && url.pathname === '/api/missions') {
      return send(res, 201, missionView(createMission(await readJson(req))))
    }

    if (req.method === 'GET' && url.pathname === '/api/missions') {
      return send(res, 200, [...missions.values()].map(missionSummary))
    }

    if (parts[0] === 'api' && parts[1] === 'missions' && parts[2]) {
      const mission = missions.get(parts[2])
      if (!mission) return send(res, 404, { error: 'mission introuvable' })

      if (req.method === 'GET' && parts.length === 3) return send(res, 200, missionView(mission))

      // Recadrage en place : met à jour le périmètre sans toucher aux pièces.
      // Si la période change, l'analyse est invalidée (les contrôles dépendent
      // de la fenêtre auditée) mais les documents et le tri sont conservés.
      if (req.method === 'PATCH' && parts.length === 3) {
        if (busyGuard(mission, res)) return
        const cadrage = validateCadrage(await readJson(req))
        const periodChanged = cadrage.periodStart !== mission.periodStart || cadrage.periodEnd !== mission.periodEnd
        // Le périmètre d'entité conditionne le contrôle ANV-PER-001 : son
        // changement invalide l'analyse au même titre que la période.
        const perimeterChanged = cadrage.siren !== mission.siren || cadrage.siret !== mission.siret
        Object.assign(mission, cadrage)
        if ((periodChanged || perimeterChanged) && mission.findings.length) {
          mission.controls = []
          mission.findings = []
          mission.qaTracker = []
          mission.vehicleAnalyses = []
          mission.totals = null
          mission.riskScore = null
          mission.report = null
          mission.reportMarkdown = null
          mission.status = mission.intake ? 'pieces-qualifiees' : mission.documents.length ? 'pieces-recues' : 'cadrage'
        }
        appendAudit(mission, 'mission.recadrage', {
          target: mission.target, siren: mission.siren, period: mission.period,
          note: `Cadrage mis à jour sans perte des pièces reçues${(periodChanged || perimeterChanged) ? ' (période ou périmètre modifié : analyse à relancer)' : ''}.`,
        })
        saveMissions()
        return send(res, 200, missionView(mission))
      }

      if (req.method === 'GET' && parts[3] === 'documents' && parts[4] && parts[5] === 'source') {
        const doc = mission.documents.find((d) => d.id === parts[4])
        if (!doc) return send(res, 404, { error: 'document introuvable' })
        return send(res, 200, {
          document: { id: doc.id, name: doc.name, theme: doc.theme, mimeType: doc.mimeType, receivedAt: doc.receivedAt, fingerprint: doc.fingerprint },
          content: doc.textContent,
        })
      }

      if (req.method === 'POST' && parts[3] === 'documents') {
        if (busyGuard(mission, res)) return
        const body = await readJson(req)
        const existing = new Set(mission.documents.map((d) => `${d.fingerprint}:${d.name}`))
        const docs = (Array.isArray(body.documents) ? body.documents : [body])
          .map((input) => storeDocument(mission, input))
          .filter((doc) => !existing.has(`${doc.fingerprint}:${doc.name}`))
        mission.documents.push(...docs)
        resetAnalysis(mission)
        mission.status = 'pieces-recues'
        for (const doc of docs) {
          appendProof(mission, {
            phase: 'collecte',
            actor: 'systeme',
            action: `${doc.name} archivée`,
            rationale: `Empreinte SHA-256 ${doc.fingerprint.slice(0, 16)}… — ${doc.sizeBytes.toLocaleString('fr-FR')} octets.`,
            refs: [doc.name],
            meta: { fingerprint: doc.fingerprint, docId: doc.id },
          })
        }
        appendAudit(mission, 'collecte.reception', {
          documentCount: docs.length,
          fingerprints: docs.map((d) => d.fingerprint),
          note: `${docs.length} pièce(s) reçue(s) en inbox (doublons ignorés), en attente de tri.`,
        })
        saveMissions()
        return send(res, 200, missionView(mission))
      }

      // Collecte en computer use : l'agent opère le VDR au navigateur.
      if (req.method === 'POST' && parts[3] === 'vdr-collect') {
        if (busyGuard(mission, res)) return
        const evidenceDir = join(uploadsRoot, sanitize(mission.id), 'vdr-evidence')
        const live = startLiveSession(mission.id, 'collecte')
        const onProof = (event) => appendProof(mission, { phase: 'vdr', actor: 'operateur', ...event })
        try {
          const body = await readJson(req)
          const onlyFolders = Array.isArray(body.folders) && body.folders.length ? body.folders.map(String) : null
          const { documents: collected, evidence, mode, stats } = await collectFromVdr({
            vdrBase: `http://localhost:${port}/vdr`,
            evidenceDir,
            // Préfixe unique : une re-collecte ne doit pas écraser les preuves
            // de la collecte initiale (les entrées, elles, s'additionnent).
            prefix: onlyFolders ? `collecte-${Date.now().toString(36)}` : 'collecte',
            onlyFolders,
            live,
            onProof,
          })
          const collectedDocs = collected.map((input) => storeDocument(mission, input))
          for (const [index, doc] of collectedDocs.entries()) {
            doc.vdrFolder = collected[index].vdrFolder
            doc.vdrPath = collected[index].vdrPath
          }
          // Re-collecte ciblée : on remplace uniquement les pièces revisitées,
          // le reste du dossier de travail est conservé.
          const collectedNames = new Set(collectedDocs.map((d) => d.name))
          mission.documents = onlyFolders
            ? [...mission.documents.filter((d) => !collectedNames.has(d.name)), ...collectedDocs]
            : collectedDocs
          resetAnalysis(mission)
          mission.vdrEvidence = onlyFolders ? [...(mission.vdrEvidence ?? []), ...evidence] : evidence
          mission.status = 'pieces-recues'
          appendAudit(mission, 'vdr.collecte', {
            mode,
            cible: onlyFolders,
            documentCount: collectedDocs.length,
            evidenceCount: evidence.length,
            modelTurns: stats.modelTurns,
            actionsExecutees: stats.actions,
            fallbacks: stats.fallbacks,
            note: `Opérateur ${mode} : connexion, navigation et lecture en place de ${collectedDocs.length} pièces${onlyFolders ? ` (re-collecte ciblée : ${onlyFolders.join(', ')})` : ''} (consultation seule), ${evidence.length} captures horodatées${stats.modelTurns > 0 && !stats.fallbacks.length ? ' — chaque étape décidée par le modèle écran par écran' : ''}${stats.fallbacks.length ? ` ; reprise scriptée sur : ${stats.fallbacks.join(', ')}` : ''}.`,
          })
          // Jalon mémoire : l'agent Antigravity consigne l'inventaire collecté
          // dans le dossier de travail qu'il tient (fichiers persistants).
          recordMilestone(mission, 'collecte.vdr', {
            mode,
            recollecteCiblee: onlyFolders,
            pieces: mission.documents.map((d) => ({ nom: d.name, dossierVdr: d.vdrFolder, empreinte: d.fingerprint })),
          }, 'L\'opérateur computer use vient de lire en place ces pièces dans le VDR (consultation seule). Consigne l\'inventaire dans dossier/inventaire.md (nom, dossier VDR, empreinte) et journalise le jalon — signale les pièces déjà connues dont l\'empreinte a changé.', saveMissions)
          saveMissions()
          return send(res, 200, missionView(mission))
        } catch (error) {
          const message = error instanceof Error ? error.message : 'échec agent VDR'
          appendAudit(mission, 'vdr.erreur', { note: message })
          saveMissions()
          return send(res, 502, { error: `Agent VDR : ${message}` })
        } finally {
          live.end()
        }
      }

      // Dépôt de la request list dans le module Q&A du VDR (computer use).
      if (req.method === 'POST' && parts[3] === 'vdr-post-qa') {
        if (busyGuard(mission, res)) return
        const pending = mission.qaTracker.filter((item) => item.status === 'à demander')
        if (!pending.length) return send(res, 400, { error: 'Aucune demande en attente : lancez l\'analyse d\'abord.' })
        const evidenceDir = join(uploadsRoot, sanitize(mission.id), 'vdr-evidence')
        const live = startLiveSession(mission.id, 'qa')
        const onProof = (event) => appendProof(mission, { phase: 'vdr', actor: 'operateur', ...event })
        try {
          const { posted, evidence, mode, stats } = await postQaToVdr({
            vdrBase: `http://localhost:${port}/vdr`,
            evidenceDir,
            items: pending,
            prefix: `qa-${Date.now().toString(36)}`,
            live,
            onProof,
          })
          const markPosted = (list) => {
            for (const item of list ?? []) {
              if (posted.includes(item.id)) item.status = 'déposée au VDR'
            }
          }
          markPosted(mission.qaTracker)
          markPosted(mission.report?.qaTracker)
          mission.vdrEvidence = [...(mission.vdrEvidence ?? []), ...evidence]
          appendAudit(mission, 'vdr.qa_depot', {
            mode,
            posted,
            fallbacks: stats.fallbacks,
            note: `Opérateur ${mode} : ${posted.length} demande(s) de pièces déposée(s) au formulaire Q&A du portail vendeur, preuve à l'écran${stats.fallbacks.length ? ` ; reprise scriptée sur : ${stats.fallbacks.join(', ')}` : ''}.`,
          })
          // Jalon mémoire : le registre Q&A tenu par l'agent Antigravity.
          recordMilestone(mission, 'qa.depot', {
            mode,
            demandes: pending.map((item) => ({ id: item.id, piece: item.piece, question: item.question, urgence: item.urgency })),
          }, 'L\'opérateur computer use vient de déposer ces demandes au module Q&A du VDR vendeur. Consigne-les dans dossier/registre-qa.md avec la date, statut « déposée, en attente de réponse vendeur », et mets à jour dossier/pieces-manquantes.md.', saveMissions)
          saveMissions()
          return send(res, 200, missionView(mission))
        } catch (error) {
          const message = error instanceof Error ? error.message : 'échec agent VDR'
          appendAudit(mission, 'vdr.erreur', { note: message })
          saveMissions()
          return send(res, 502, { error: `Agent VDR : ${message}` })
        } finally {
          live.end()
        }
      }

      // Vue en direct : dernière frame JPEG (polling front, Safari-compatible)
      // + état structuré JSON + flux MJPEG legacy (Chrome).
      if (req.method === 'GET' && parts[3] === 'vdr-live' && parts[4] === 'frame') {
        serveLiveFrame(mission.id, res)
        return
      }

      if (req.method === 'GET' && parts[3] === 'vdr-live.mjpeg') {
        attachMjpegClient(mission.id, res)
        return
      }

      if (req.method === 'GET' && parts[3] === 'vdr-live') {
        return send(res, 200, liveStatus(mission.id))
      }

      // Preuves d'écran de l'agent VDR.
      if (req.method === 'GET' && parts[3] === 'vdr-evidence' && parts[4]) {
        try {
          const file = readFileSync(join(uploadsRoot, sanitize(mission.id), 'vdr-evidence', sanitize(decodeURIComponent(parts[4]))))
          res.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
          return res.end(file)
        } catch {
          return send(res, 404, { error: 'preuve introuvable' })
        }
      }

      if (req.method === 'POST' && parts[3] === 'demo-documents') {
        if (busyGuard(mission, res)) return
        const docs = demoDataRoom().map((input) => storeDocument(mission, input))
        mission.documents = docs
        resetAnalysis(mission)
        mission.status = 'pieces-recues'
        appendAudit(mission, 'collecte.reception', {
          documentCount: docs.length,
          note: 'Data room de démonstration chargée (cible fictive Novatech Services SAS).',
        })
        saveMissions()
        return send(res, 200, missionView(mission))
      }

      // Lance le tri en direct : répond immédiatement, la progression se suit
      // via GET intake-progress (le front montre l'agent classer pièce par pièce).
      if (req.method === 'POST' && parts[3] === 'intake') {
        if (!mission.documents.length) return send(res, 400, { error: 'Aucune pièce reçue : déposez la data room avant le tri.' })
        if (busyGuard(mission, res)) return
        executeIntake(mission, { paceMs: 420 }).catch(() => {})
        return send(res, 202, { started: true, total: mission.documents.length })
      }

      if (req.method === 'GET' && parts[3] === 'intake-progress') {
        const job = intakeJobs.get(mission.id)
        return send(res, 200, job
          ? {
              running: job.running,
              total: job.total,
              events: job.events,
              error: job.error,
              completed: !job.running && !job.error,
              proofTrail: mission.proofTrail?.slice(-40) ?? [],
            }
          : {
              running: false,
              total: 0,
              events: [],
              error: null,
              completed: Boolean(mission.intake),
              proofTrail: mission.proofTrail ?? [],
            })
      }

      if (req.method === 'POST' && parts[3] === 'analyze') {
        if (busyGuard(mission, res)) return
        if (!mission.documents.length) return send(res, 400, { error: 'Aucune pièce reçue.' })
        if (analysisProgressJobs.get(mission.id)?.running) {
          return send(res, 409, { error: 'Analyse déjà en cours.' })
        }
        void executeAnalysis(mission).catch(() => {})
        return send(res, 202, { started: true })
      }

      if (req.method === 'GET' && parts[3] === 'analysis-progress') {
        const job = analysisProgressJobs.get(mission.id)
        return send(res, 200, job
          ? {
              running: job.running,
              phase: job.phase ?? null,
              events: job.events,
              error: job.error,
              completed: !job.running && !job.error && Boolean(mission.report),
            }
          : {
              running: false,
              phase: null,
              events: mission.proofTrail ?? [],
              error: null,
              completed: Boolean(mission.report),
            })
      }

      if (req.method === 'GET' && parts[3] === 'report.md') {
        if (!mission.reportMarkdown) return send(res, 404, { error: 'rapport non généré' })
        // content-disposition : le clic télécharge au lieu de naviguer.
        return send(res, 200, mission.reportMarkdown, 'text/markdown; charset=utf-8', {
          'content-disposition': 'attachment; filename="rapport-dd-sociale-anv.md"',
        })
      }

      // Mémoire de mission : interroge le dossier tenu par l'agent Antigravity
      // (fil + environnement persistants — survit au redémarrage du serveur).
      if (req.method === 'POST' && parts[3] === 'dossier-recall') {
        const body = await readJson(req)
        const question = String(body.question ?? '').trim() ||
          'Fais le point : pièces collectées, constats consignés, demandes Q&A en attente, prochaines actions.'
        try {
          const { ok, reply } = await recallDossier(mission, question)
          if (ok) {
            appendAudit(mission, 'dossier.relecture', { question, note: reply.slice(0, 300) })
            saveMissions()
          }
          return send(res, ok ? 200 : 409, { ok, question, reply, antigravity: mission.antigravity })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'échec agent Antigravity'
          return send(res, 502, { ok: false, error: `Dossier Antigravity : ${message}` })
        }
      }
    }

    // Pipeline complet en un appel (démo / smoke test) : cadrage explicite
    // sur la cible fictive, jamais utilisé comme défaut ailleurs.
    if (req.method === 'POST' && url.pathname === '/api/run-diligence') {
      const body = await readJson(req)
      const mission = createMission({ ...demoTarget, ...body })
      mission.documents = demoDataRoom().map((input) => storeDocument(mission, input))
      mission.status = 'pieces-recues'
      appendAudit(mission, 'collecte.reception', { documentCount: mission.documents.length, note: 'Data room de démonstration chargée.' })
      await executeIntake(mission, { paceMs: 0 })
      const outcome = await runAnalysis(mission)
      if (outcome.error) return send(res, 400, { error: outcome.error })
      return send(res, 200, missionView(mission))
    }

    send(res, 404, { error: 'not found' })
  } catch (error) {
    if (error instanceof MissionInputError) return send(res, 400, { error: error.message })
    send(res, 500, { error: error instanceof Error ? error.message : 'internal error' })
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Legak API listening on http://localhost:${port}`)
})
