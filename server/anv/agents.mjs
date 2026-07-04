// Agents de contrôle et de restitution. Jamais source de vérité sur les
// chiffres : le contradicteur challenge les conclusions du moteur
// (anti-ancrage), le rédacteur met en forme la synthèse. La classification et
// l'extraction documentaires vivent dans extract.mjs. Chaque rôle a un repli
// déterministe et honnête si Gemini est indisponible.

import { geminiCall } from './gemini.mjs'

// ── Agent contradicteur : contrôle croisé des conclusions ───────────────────
// Reçoit les findings du moteur et cherche les failles : versionning, conditions
// oubliées, conclusions trop affirmatives, statuts probatoires mal qualifiés.

export async function contradictionAgent(mission, auditResult) {
  const fallback = {
    mode: 'non exécutée (Gemini indisponible)',
    reviews: auditResult.findings.map((f) => ({
      findingId: f.id,
      verdict: 'non contredit',
      note: 'Contradiction croisée non exécutée : conclusion du moteur non challengée par un second regard. À faire arbitrer par l\'avocat signataire.',
    })),
  }
  try {
    const reviews = await geminiCall([{
      text: [
        'Tu es l\'avocat contradicteur d\'une due diligence sociale M&A française. On te soumet les conclusions d\'un premier analyste sur les avantages en nature véhicules.',
        'Ton rôle : chercher les failles. Vérifie notamment : (1) versionning des barèmes (ancien barème vs arrêté du 25 février 2025, applicable aux mises à disposition à compter du 01/02/2025, y compris réattributions) ; (2) conclusions trop affirmatives quand une pièce manque (l\'absence de preuve n\'est pas la preuve de conformité) ; (3) statuts probatoires ; (4) qualification de la gravité au regard de l\'impact deal.',
        'Ne recalcule pas les montants : le chiffrage est produit par un moteur déterministe. Concentre-toi sur le raisonnement juridique et la prudence des formulations.',
        'Réponds en JSON strict : [{"findingId":"SOC-ANV-001","verdict":"confirmé|à nuancer|contesté","note":"2 phrases max, en français"}]',
        JSON.stringify({
          mission: { target: mission.target, period: mission.period, convention: mission.convention ?? 'non renseignée' },
          findings: auditResult.findings.map((f) => ({
            id: f.id, severity: f.severity, title: f.title, facts: f.facts, rule: f.rule,
            assietteEludee: f.assietteEludee, confidence: f.confidence, probability: f.probability,
          })),
          controls: auditResult.controls.map((c) => ({ id: c.id, status: c.status })),
        }),
      ].join('\n'),
    }], { label: 'contradiction' })
    if (!Array.isArray(reviews)) return fallback
    return {
      mode: 'Gemini (contradiction croisée)',
      reviews: auditResult.findings.map((f) => {
        const review = reviews.find((r) => r.findingId === f.id)
        return review
          ? { findingId: f.id, verdict: review.verdict ?? 'confirmé', note: String(review.note ?? '').slice(0, 400) }
          : { findingId: f.id, verdict: 'non contredit', note: 'Constat non couvert par la revue croisée : à faire arbitrer par l\'avocat signataire.' }
      }),
    }
  } catch (error) {
    return { ...fallback, error: error instanceof Error ? error.message : 'contradiction failed' }
  }
}

// ── Agent rédacteur : executive summary ─────────────────────────────────────
// Met en forme, sans jamais modifier les chiffres ni les conclusions.

export async function draftingAgent(mission, auditResult) {
  const { totals, riskScore, findings } = auditResult
  const profil = [mission.effectif ? `${mission.effectif} salariés` : null, mission.convention].filter(Boolean).join(', ')
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`
  const fallbackParts = [
    `La revue des avantages en nature véhicules de ${mission.target}${profil ? ` (${profil})` : ''} sur la période ${mission.period} identifie ${plural(findings.length, 'constat')}, dont ${plural(riskScore.critiques, 'critique')}.`,
  ]
  if (totals.assietteEludee > 0) {
    fallbackParts.push(`L'assiette de cotisations éludée reconstituée sur la période non prescrite s'élève à ${fmt(totals.assietteEludee)}, soit une exposition URSSAF estimée entre ${fmt(totals.exposure.low)} et ${fmt(totals.exposure.high)} (cotisations et majorations)${totals.exposureConditional ? `, à laquelle s'ajoute une exposition conditionnelle de ${fmt(totals.exposureConditional.low)} à ${fmt(totals.exposureConditional.high)} si les pièces manquantes ne sont pas produites` : ''}.`)
  } else if (findings.length) {
    fallbackParts.push('Aucune assiette éludée ferme n\'est chiffrée à ce stade ; les constats portent sur des zones non prouvées ou à instruire.')
  }
  const hasExposure = totals.exposure.high > 0 || Boolean(totals.exposureConditional)
  fallbackParts.push(riskScore.closingBlocker
    ? `Point bloquant : ${riskScore.note}`
    : !findings.length
      ? 'Aucun constat au vu des pièces produites ; les limites de mission et pièces manquantes restent listées au suivi Q&A.'
      : hasExposure
        ? 'Le passif identifié est chiffrable et se traite par indemnité spécifique, production des pièces manquantes avant signing et plan de remédiation paie post-closing.'
        : 'Les constats ne sont pas chiffrables en l\'état : ils se traitent par la production des pièces demandées au suivi Q&A avant signing.')
  const fallback = fallbackParts.join(' ')

  try {
    const text = await geminiCall([{
      text: [
        'Tu es l\'avocat rédacteur d\'un rapport de due diligence sociale M&A buy-side (red flag report). Rédige l\'executive summary en français, 4 à 6 phrases, ton factuel de cabinet.',
        'INTERDIT : modifier un chiffre, ajouter un constat, adoucir une conclusion. Tu mets en forme, rien d\'autre. Pas de Markdown.',
        'RÈGLES DE VOCABULAIRE STRICTES : (1) le nombre indiceConformite est un indice de conformité (100 = dossier propre) — ne l\'appelle JAMAIS « score de risque » ; s\'il apparaît, écris « indice de conformité de X/100 ». (2) N\'appelle jamais « assiette » une fourchette d\'exposition : reprends les grandeurs chiffrées EXACTEMENT comme formulées dans phrasesChiffrees, sans reformuler leurs libellés. (3) Écris les montants avec le symbole « € », jamais « EUR ».',
        JSON.stringify({
          cible: mission.target, periode: mission.period, convention: mission.convention ?? 'non renseignée', effectif: mission.effectif ?? 'non renseigné',
          indiceConformite: { valeur: riskScore.score, legende: '100 = dossier conforme' },
          constatsCritiques: riskScore.critiques, constatsEleves: riskScore.eleves, closingBlocker: riskScore.closingBlocker,
          phrasesChiffrees: fallbackParts,
          constats: findings.map((f) => ({ id: f.id, gravite: f.severity, titre: f.title, expositionBasse: f.exposure?.low ?? 0, expositionHaute: f.exposure?.high ?? 0, impactDeal: f.dealImpact })),
        }),
      ].join('\n'),
    }], { label: 'redaction', json: false })
    return { text: text?.trim() || fallback, mode: text ? 'Gemini (rédaction)' : 'repli déterministe' }
  } catch {
    return { text: fallback, mode: 'repli déterministe (Gemini indisponible)' }
  }
}

function fmt(value) {
  return `${Math.round(value).toLocaleString('fr-FR')} €`
}
