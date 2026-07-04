// Trail de preuve horodaté : chaque décision (modèle, moteur déterministe,
// opérateur VDR) est consignée avec son acteur, sa justification et ses
// références croisées (pièces, contrôles, constats). Persisté sur la mission
// et dupliqué dans les jobs live (intake / analyse) pour le polling front.

const MAX_TRAIL = 240

export function appendProof(mission, event, liveJob = null) {
  const entry = {
    seq: (mission.proofTrail?.length ?? 0) + 1,
    at: new Date().toISOString(),
    phase: event.phase,
    actor: event.actor,
    action: event.action,
    rationale: event.rationale,
    refs: event.refs ?? [],
    status: event.status ?? 'done',
    meta: event.meta ?? {},
  }
  mission.proofTrail = [...(mission.proofTrail ?? []), entry].slice(-MAX_TRAIL)
  if (liveJob) {
    liveJob.events.push(entry)
    liveJob.phase = event.phase
    liveJob.lastActor = event.actor
  }
  return entry
}

export function proofFromAudit(mission, auditEvent, detail = {}) {
  const map = {
    'mission.cadrage': { phase: 'cadrage', actor: 'systeme', action: 'Mission cadrée', rationale: detail.note },
    'dossier.ouverture': { phase: 'cadrage', actor: 'systeme', action: 'Dossier de travail ouvert', rationale: detail.note },
    'mission.recadrage': { phase: 'cadrage', actor: 'systeme', action: 'Cadrage mis à jour', rationale: detail.note },
    'collecte.reception': { phase: 'collecte', actor: 'systeme', action: 'Pièces reçues', rationale: detail.note },
    'intake.classement': { phase: 'intake', actor: detail.mode?.includes('Gemini') ? 'gemini' : 'systeme', action: 'Tri et qualification terminés', rationale: detail.note },
    'vdr.collecte': { phase: 'vdr', actor: 'operateur', action: 'Collecte VDR terminée', rationale: detail.note },
    'vdr.qa_depot': { phase: 'vdr', actor: 'operateur', action: 'Request list déposée au Q&A', rationale: detail.note },
    'vdr.erreur': { phase: 'vdr', actor: 'operateur', action: 'Incident agent VDR', rationale: detail.note },
    'analyse.extraction': { phase: 'extraction', actor: detail.mode?.includes('Gemini') ? 'gemini' : 'systeme', action: 'Données extraites', rationale: detail.note },
    'analyse.controles': { phase: 'controle', actor: 'moteur', action: 'Contrôles exécutés', rationale: detail.note },
    'analyse.contradiction': { phase: 'contradiction', actor: detail.mode?.includes('Gemini') ? 'gemini' : 'systeme', action: 'Contrôle croisé terminé', rationale: detail.note },
    'analyse.rejetee': { phase: 'extraction', actor: 'systeme', action: 'Analyse rejetée', rationale: detail.reason },
    'rapport.genere': { phase: 'rapport', actor: detail.redaction?.includes('Gemini') ? 'gemini' : 'systeme', action: 'Package décisionnel généré', rationale: detail.note },
    'dossier.relecture': { phase: 'rapport', actor: 'gemini', action: 'Relecture du dossier', rationale: detail.note },
  }
  const base = map[auditEvent]
  if (!base) return null
  return appendProof(mission, {
    ...base,
    refs: detail.refs ?? [],
    meta: { auditEvent, ...detail },
  })
}
