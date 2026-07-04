// Moteur de restitution : assemble le package décisionnel M&A (red flag report)
// et son export Markdown. Structure : limites de mission, executive summary,
// deal risk score, risk register, fiches risque, recommandations SPA, Q&A
// tracker, plan post-closing, annexe chiffrée, méthodologie.

const spaTreatments = [
  ['Risque connu et chiffrable', 'Specific indemnity (hors basket, hors cap)'],
  ['Risque incertain mais matériel', 'Garantie déclarative renforcée'],
  ['Risque de documentation incomplète', 'Disclosure schedule + production de pièce avant closing'],
  ['Risque post-closing corrigeable', 'Covenant de remédiation'],
]

export function buildReport({ mission, auditResult, contradiction, execSummary, intake }) {
  const { findings, controls, qaTracker, totals, riskScore } = auditResult

  const riskRegister = findings.map((f) => ({
    id: f.id,
    sujet: f.title,
    gravite: f.severity,
    score: { critique: 5, 'élevé': 4, moyen: 3, faible: 2 }[f.severity],
    probabilite: f.probability,
    expositionBasse: f.exposure?.low ?? 0,
    expositionHaute: f.exposure?.high ?? 0,
    expositionConditionnelle: f.conditionalExposure ? `${fmt(f.conditionalExposure.low)} – ${fmt(f.conditionalExposure.high)}` : null,
    impactDeal: f.dealImpact,
    traitementSpa: f.recoSpa,
    confiance: f.confidence,
    contradiction: contradiction.reviews.find((r) => r.findingId === f.id) ?? null,
  }))

  return {
    title: `${mission.target} — Due diligence sociale (thématique : avantages en nature véhicules)`,
    generatedAt: new Date().toISOString(),
    missionScope: {
      client: 'Acquéreur (buy-side)',
      cible: mission.target,
      siren: mission.siren,
      convention: mission.convention,
      effectif: mission.effectif,
      periode: mission.period,
      thematique: 'Avantages en nature véhicules (URSSAF)',
      documentsRevus: intake.qualified.map((q) => q.name),
      limites: [
        'Rapport préparé pour le seul acquéreur, dans le contexte de la transaction, sur la base des pièces communiquées en data room.',
        'Le contrôle de cohérence paie ↔ DSN ↔ bordereaux URSSAF est hors périmètre de la présente version (cf. suivi Q&A).',
        'L\'ANV est réputé dû à compter du premier mois civil complet de mise à disposition (pas de prorata du mois entamé) : hypothèse prudente qui peut minorer légèrement l\'assiette reconstituée.',
        'La couverture temporelle pièce par pièce n\'est pas contrôlée dans cette version (le rattachement d\'entité SIRET/SIREN l\'est).',
        'Ne constitue pas une opinion juridique exhaustive ; les conclusions sont conditionnées à la production des pièces listées comme manquantes.',
        'Rapport préparé par un agent sous supervision : les conclusions doivent être relues et validées par l\'avocat signataire avant toute utilisation.',
        `Hypothèses de chiffrage : ${auditResult.totals.assumptions.note}`,
      ],
    },
    executiveSummary: execSummary.text,
    dealRiskScore: riskScore,
    totals,
    riskRegister,
    findings,
    controls,
    spaRecommendations: {
      grille: spaTreatments,
      clauses: findings.map((f) => ({ risque: f.id, titre: f.title, clause: f.recoSpa })),
    },
    qaTracker,
    postClosingPlan: buildPostClosingPlan(findings),
    contradictionMode: contradiction.mode,
    redactionMode: execSummary.mode,
  }
}

function buildPostClosingPlan(findings) {
  const horizon = (text) => (/30 jours/.test(text) ? 'J+30' : /60 jours/.test(text) ? 'J+60' : 'J+90')
  // L'horizon est extrait du libellé puis retiré de l'action pour ne pas
  // apparaître deux fois sur la même ligne du plan.
  const stripHorizon = (text) => text.replace(/\s+à \d+ jours\.?$/, '.').replace(/\.\.$/, '.')
  return findings
    .map((f) => ({
      horizon: horizon(f.postClosing),
      action: stripHorizon(f.postClosing),
      risque: f.id,
      responsable: /paie|paramétrage|DSN/i.test(f.postClosing) ? 'DAF + prestataire paie' : 'RH',
    }))
    .sort((a, b) => a.horizon.localeCompare(b.horizon))
}

export function reportToMarkdown(report, vehicleAnalyses) {
  const lines = []
  const push = (...items) => lines.push(...items, '')

  push(`# ${report.title}`, `_Généré le ${report.generatedAt.slice(0, 10)} — rapport red flag buy-side, à valider par l'avocat signataire._`)

  push('## 1. Périmètre et limites de mission',
    `- Cible : ${report.missionScope.cible}${report.missionScope.siren ? ` (SIREN ${report.missionScope.siren})` : ''}${report.missionScope.effectif ? ` — ${report.missionScope.effectif} salariés` : ''}${report.missionScope.convention ? `, ${report.missionScope.convention}` : ''}`,
    `- Période auditée : ${report.missionScope.periode}`,
    `- Thématique : ${report.missionScope.thematique}`,
    `- Pièces revues : ${report.missionScope.documentsRevus.length} documents`,
    ...report.missionScope.limites.map((l) => `- ${l}`))

  push('## 2. Executive summary', report.executiveSummary)

  push('## 3. Indice de conformité thématique',
    `- Indice : **${report.dealRiskScore.score}/100** (100 = dossier conforme)`,
    `- Constats critiques : ${report.dealRiskScore.critiques} — élevés : ${report.dealRiskScore.eleves}`,
    `- Exposition ferme : **${fmt(report.totals.exposure.low)} – ${fmt(report.totals.exposure.high)}** (assiette éludée non prescrite ${fmt(report.totals.assietteEludee)})`,
    report.totals.exposureConditional
      ? `- Exposition conditionnelle : ${fmt(report.totals.exposureConditional.low)} – ${fmt(report.totals.exposureConditional.high)} (pièces manquantes)`
      : '- Pas d\'exposition conditionnelle.',
    report.totals.assiettePrescrite > 0
      ? `- Assiette antérieure à ${report.totals.prescriptionStart} (prescrite, pour information) : ${fmt(report.totals.assiettePrescrite)} — non chiffrée en exposition.`
      : null,
    `- Closing blocker : ${report.dealRiskScore.closingBlocker ? 'OUI' : 'non'} — ${report.dealRiskScore.note}`)

  push('## 4. Registre des risques',
    '| # | Sujet | Gravité | Probabilité | Exposition | Impact deal | Traitement SPA |',
    '|---|-------|---------|-------------|------------|-------------|----------------|',
    ...report.riskRegister.map((r) =>
      `| ${r.id} | ${r.sujet} | ${r.gravite} (${r.score}/5) | ${r.probabilite} | ${r.expositionHaute ? `${fmt(r.expositionBasse)} – ${fmt(r.expositionHaute)}` : r.expositionConditionnelle ? `conditionnelle : ${r.expositionConditionnelle}` : 'non chiffrable'} | ${r.impactDeal} | ${r.traitementSpa} |`))

  push('## 5. Fiches risque')
  for (const f of report.findings) {
    const contradiction = report.riskRegister.find((r) => r.id === f.id)?.contradiction
    push(`### ${f.id} — ${f.title}`,
      `- **Gravité** : ${f.severity} — **Probabilité** : ${f.probability} — **Confiance** : ${f.confidence}`,
      `- **Sources documentaires** : ${f.sources.join(', ')}`,
      `- **Faits constatés** : ${f.facts}`,
      `- **Règle applicable** : ${f.rule}`,
      `- **Période exposée** : ${f.period} — **Population** : ${f.population.join(', ')}`,
      `- **Assiette éludée (non prescrite)** : ${fmt(f.assietteEludee)}${f.assietteConditionnelle ? ` (+ ${fmt(f.assietteConditionnelle)} conditionnelle)` : ''}${f.assiettePrescrite ? ` — assiette antérieure prescrite : ${fmt(f.assiettePrescrite)} (information)` : ''}`,
      `- **Exposition estimée** : ${f.exposure ? `${fmt(f.exposure.low)} – ${fmt(f.exposure.high)}` : 'non chiffrable en l\'état'}${f.conditionalExposure ? ` (+ ${fmt(f.conditionalExposure.low)} – ${fmt(f.conditionalExposure.high)} si pièces non produites)` : ''}`,
      `- **Impact deal** : ${f.dealImpact}`,
      `- **Recommandation pré-closing** : ${f.recoPreClosing}`,
      `- **Recommandation SPA** : ${f.recoSpa}`,
      `- **Action post-closing** : ${f.postClosing}`,
      contradiction ? `- **Contrôle croisé** (${report.contradictionMode}) : ${contradiction.verdict} — ${contradiction.note}` : null)
  }

  push('## 6. Matrice des contrôles exécutés',
    '| Contrôle | Intitulé | Statut | Détail |',
    '|----------|----------|--------|--------|',
    ...report.controls.map((c) => `| ${c.id} | ${c.title} | ${c.status} | ${c.details.join(' · ') || '—'} |`))

  push('## 7. Recommandations SPA',
    '| Risque | Clause recommandée |',
    '|--------|--------------------|',
    ...report.spaRecommendations.clauses.map((c) => `| ${c.risque} — ${c.titre} | ${c.clause} |`))

  push('## 8. Suivi Q&A (pièces à demander à la cible)',
    '| # | Demande | Urgence | Impact si non fourni |',
    '|---|---------|---------|----------------------|',
    ...report.qaTracker.map((q) => `| ${q.id} | ${q.question} | ${q.urgency} | ${q.impactSiNonFourni} |`))

  push('## 9. Plan post-closing (30/60/90 jours)',
    '| Horizon | Action | Risque | Responsable |',
    '|---------|--------|--------|-------------|',
    ...report.postClosingPlan.map((p) => `| ${p.horizon} | ${p.action} | ${p.risque} | ${p.responsable} |`))

  push('## 10. Annexe chiffrée — détail par véhicule',
    '| Véhicule | Salarié | Barème | Statut | ANV déclaré (période) | ANV attendu | Assiette éludée | Conditionnelle |',
    '|----------|---------|--------|--------|-----------------------|-------------|-----------------|----------------|',
    ...vehicleAnalyses.map((v) =>
      `| ${v.vehicleId} (${v.modele}) | ${v.salarie} | ${v.bareme} | ${v.statut} | ${fmt(v.declaredTotal)} | ${v.expectedTotal ? fmt(v.expectedTotal) : 'indéterminé'} | ${fmt(v.assietteDelta)} | ${v.conditionalDelta ? fmt(v.conditionalDelta) : '—'} |`))

  push('## 11. Méthodologie',
    '- Contrôles exécutés par un moteur de règles déterministe (barèmes versionnés : arrêté du 10 décembre 2002, arrêté du 25 février 2025 ; BOSS Avantages en nature).',
    '- Le barème est sélectionné selon la date d\'attribution du véhicule au salarié (réattributions incluses).',
    `- Contrôle croisé des conclusions : ${report.contradictionMode}. Rédaction : ${report.redactionMode}.`,
    '- Chaque constat est rattaché à ses pièces sources ; les statuts probatoires distinguent non-conformité, absence de preuve, preuve partielle et pièce déclarative.',
    `- ${report.totals.assumptions.note}`)

  return lines.filter((line) => line !== null).join('\n')
}

function fmt(value) {
  return `${Math.round(value).toLocaleString('fr-FR')} €`
}
