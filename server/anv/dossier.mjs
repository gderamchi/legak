// Dossier de travail tenu par l'agent Antigravity (Interactions API).
//
// Une due diligence n'est pas un snapshot : elle dure des jours (collecte,
// analyse, request list, retours du vendeur, re-collecte). La mémoire de la
// mission est tenue par un agent géré côté Gemini : un fil d'interaction
// (previous_interaction_id) + un bac à sable persistant (environment_id) où
// l'agent maintient de vrais fichiers (inventaire, pièces manquantes, registre
// Q&A, journal). On peut couper le serveur local et reprendre le lendemain :
// l'état vit dans l'environnement Antigravity, pas dans la session.
//
// Couplage voulu avec la première primitive : chaque jalon n'existe que parce
// que l'opérateur computer use a collecté/déposé quelque chose au navigateur —
// et la relecture du dossier prépare la re-collecte ciblée suivante.
//
// Les chiffres restent la propriété du moteur déterministe : l'agent tient le
// greffe de la mission (ce qui a été vu, ce qui manque, ce qui a été demandé),
// il ne recalcule rien.

import { hasGeminiKey } from './gemini.mjs'

const AGENT_ID = process.env.GEMINI_AGENT_ID ?? 'antigravity-preview-05-2026'
const CALL_TIMEOUT_MS = 240_000

// Chaîne d'appels par mission : un fil previous_interaction_id est strictement
// séquentiel, chaque jalon attend le précédent.
const queues = new Map()

function enqueue(missionId, task) {
  const previous = queues.get(missionId) ?? Promise.resolve()
  const next = previous.then(task, task)
  queues.set(missionId, next.catch(() => {}))
  return next
}

async function agentCall(mission, input) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })
  const state = mission.antigravity ?? {}
  const request = ai.interactions.create({
    agent: AGENT_ID,
    store: true,
    // Premier appel : création d'un environnement distant ({ type: 'remote' }) ;
    // appels suivants : réutilisation de l'environnement existant par son id.
    environment: state.environmentId ?? { type: 'remote' },
    ...(state.interactionId ? { previous_interaction_id: state.interactionId } : {}),
    input,
  })
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`agent Antigravity : timeout après ${CALL_TIMEOUT_MS / 1000}s`)), CALL_TIMEOUT_MS))
  const interaction = await Promise.race([request, timeout])
  return {
    interactionId: interaction.id,
    environmentId: interaction.environment_id ?? state.environmentId ?? null,
    text: String(interaction.output_text ?? '').trim(),
  }
}

function baseState() {
  return {
    agent: AGENT_ID,
    interactionId: null,
    environmentId: null,
    openedAt: null,
    lastMilestoneAt: null,
    milestones: [],
    lastError: null,
  }
}

function pushMilestone(mission, entry) {
  mission.antigravity.milestones = [...(mission.antigravity.milestones ?? []), entry].slice(-40)
  mission.antigravity.lastMilestoneAt = entry.at
}

// Ouverture du dossier : l'agent crée sa structure de fichiers dans son bac à
// sable. Fire-and-forget (la mission n'attend pas Google pour exister).
export function openDossier(mission, persist) {
  if (!hasGeminiKey()) {
    mission.antigravity = { ...baseState(), lastError: 'Gemini indisponible (pas de clé) : mémoire de mission désactivée.' }
    return
  }
  mission.antigravity = { ...baseState(), openedAt: new Date().toISOString() }
  enqueue(mission.id, async () => {
    try {
      const result = await agentCall(mission, [
        'Tu es le greffier d\'une due diligence sociale M&A buy-side (thématique : avantages en nature véhicules, URSSAF). Tu tiens le dossier de travail de la mission dans ton environnement, sous forme de fichiers que tu mets à jour à chaque jalon. Tu ne calcules jamais de montants : les chiffres appartiennent au moteur d\'analyse du cabinet.',
        'Crée maintenant la structure du dossier : dossier/mission.md (cadrage ci-dessous), dossier/inventaire.md (vide, à remplir à la collecte), dossier/pieces-manquantes.md, dossier/registre-qa.md, dossier/journal.md (journal daté des jalons).',
        `Cadrage : ${JSON.stringify({
          cible: mission.target, siren: mission.siren, siret: mission.siret,
          convention: mission.convention, effectif: mission.effectif,
          periode: mission.period, thematique: mission.thematique, missionId: mission.id,
        })}`,
        'Réponds en 2 phrases maximum : confirmation d\'ouverture du dossier et fichiers créés.',
      ].join('\n\n'))
      mission.antigravity.interactionId = result.interactionId
      mission.antigravity.environmentId = result.environmentId
      mission.antigravity.lastError = null
      pushMilestone(mission, { at: new Date().toISOString(), event: 'dossier.ouvert', note: result.text.slice(0, 400) })
    } catch (error) {
      mission.antigravity.lastError = String(error?.message ?? error).slice(0, 300)
      pushMilestone(mission, { at: new Date().toISOString(), event: 'dossier.erreur', note: mission.antigravity.lastError })
    }
    persist?.()
  })
}

// Jalon : l'agent met à jour ses fichiers avec ce que le pipeline vient de
// produire (collecte computer use, analyse du moteur, dépôt Q&A…).
export function recordMilestone(mission, event, payload, instruction, persist) {
  if (!hasGeminiKey()) return
  if (!mission.antigravity) openDossier(mission, persist)
  enqueue(mission.id, async () => {
    try {
      const result = await agentCall(mission, [
        `Jalon de mission « ${event} ». ${instruction}`,
        `Données du jalon : ${JSON.stringify(payload)}`,
        'Mets à jour les fichiers du dossier en conséquence (inventaire, pièces manquantes, registre Q&A, journal daté). Réponds en 3 phrases maximum : ce que tu as consigné et l\'état de complétude du dossier.',
      ].join('\n\n'))
      mission.antigravity.interactionId = result.interactionId
      mission.antigravity.environmentId = result.environmentId ?? mission.antigravity.environmentId
      mission.antigravity.lastError = null
      pushMilestone(mission, { at: new Date().toISOString(), event, note: result.text.slice(0, 400) })
    } catch (error) {
      mission.antigravity.lastError = String(error?.message ?? error).slice(0, 300)
      pushMilestone(mission, { at: new Date().toISOString(), event: `${event}.erreur`, note: mission.antigravity.lastError })
    }
    persist?.()
  })
}

// Relecture : interroge la mémoire tenue par l'agent (bloquant — c'est le
// moment démo « l'agent se souvient », y compris après redémarrage local).
export async function recallDossier(mission, question) {
  if (!hasGeminiKey()) {
    return { ok: false, reply: 'Gemini indisponible (pas de clé) : mémoire de mission désactivée.' }
  }
  if (!mission.antigravity) {
    return { ok: false, reply: 'Le dossier Antigravity n\'est pas encore ouvert pour cette mission.' }
  }
  return enqueue(mission.id, async () => {
    // Testé après la file : les jalons en cours ont fini de poser interactionId.
    if (!mission.antigravity.interactionId) {
      return { ok: false, reply: `L'ouverture du dossier Antigravity a échoué${mission.antigravity.lastError ? ` (${mission.antigravity.lastError})` : ''}.` }
    }
    const result = await agentCall(mission, [
      'Question du conseil sur l\'état du dossier de mission. Appuie-toi sur les fichiers de ton environnement (relis-les si nécessaire) et sur l\'historique de la mission. Ne recalcule aucun montant : cite ceux consignés par le moteur, tels quels.',
      `Question : ${question}`,
      'Réponds en français, 6 phrases maximum, factuel.',
    ].join('\n\n'))
    mission.antigravity.interactionId = result.interactionId
    mission.antigravity.environmentId = result.environmentId ?? mission.antigravity.environmentId
    return { ok: true, reply: result.text }
  })
}

export function dossierAgentId() {
  return AGENT_ID
}
