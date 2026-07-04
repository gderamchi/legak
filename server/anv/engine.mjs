// Moteur de contrôle ANV véhicules : exécute le référentiel de règles sur les
// données structurées (flotte, paie, preuves). Aucun verdict n'est codé en dur :
// chaque constat, chaque montant et chaque phrase de fiche risque sont dérivés
// des données. L'assiette est ventilée par cause (pas de double comptage) et
// par fenêtre de prescription (art. L. 244-3 CSS).

import {
  baremeFor,
  expectedAnnualANV,
  exposureFromAssiette,
  exposureAssumptions,
  controlCatalog,
  round2,
  NEW_SCALE_EFFECTIVE,
  prescriptionStartMonth,
} from './rules.mjs'
import { normalizeName } from './normalize.mjs'

const TOLERANCE = 1 // €/mois : écart déclaré/attendu considéré comme conforme

function monthsBetween(startMonth, endMonth) {
  const out = []
  let [y, m] = startMonth.split('-').map(Number)
  const [ey, em] = endMonth.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

// Hypothèse documentée : l'ANV est dû à partir du premier mois civil complet de
// mise à disposition (pas de prorata du mois entamé).
function firstPayrollMonth(madDate) {
  const [y, m, d] = madDate.split('-').map(Number)
  if (!y || !m) return null
  let month = m; let year = y
  if ((d ?? 1) > 1) { month += 1; if (month > 12) { month = 1; year += 1 } }
  return `${year}-${String(month).padStart(2, '0')}`
}

const maxMonth = (a, b) => (a >= b ? a : b)
const minMonth = (a, b) => (a <= b ? a : b)

function nextMonth(month) {
  let [y, m] = month.split('-').map(Number)
  m += 1
  if (m > 12) { m = 1; y += 1 }
  return `${y}-${String(m).padStart(2, '0')}`
}

function assignments(vehicle, periodStart, periodEnd) {
  const list = []
  if (vehicle.reassignment?.from && vehicle.reassignment?.to) {
    const start = firstPayrollMonth(vehicle.reassignment.from)
    if (start) {
      list.push({
        salarie: vehicle.reassignment.salarie,
        miseADisposition: vehicle.reassignment.from,
        start: maxMonth(periodStart, start),
        end: minMonth(periodEnd, vehicle.reassignment.to.slice(0, 7)),
      })
    }
  }
  const start = firstPayrollMonth(vehicle.miseADisposition)
  if (start) {
    const prior = list[0]
    // Garde anti-chevauchement : un même mois ne peut pas être contrôlé deux
    // fois (le déclaré serait compté en double).
    const clampedStart = prior && maxMonth(periodStart, start) <= prior.end
      ? nextMonth(prior.end)
      : maxMonth(periodStart, start)
    if (clampedStart <= periodEnd) {
      list.push({
        salarie: vehicle.salarie,
        miseADisposition: vehicle.miseADisposition,
        start: clampedStart,
        end: periodEnd,
      })
    }
  }
  return list
}

function emptyBucket() {
  return { firm: 0, cond: 0, prescribed: 0, months: [] }
}

function analyzeVehicle(vehicle, payrollIndex, unmatchedSalaries, periodStart, periodEnd, prescriptionStart) {
  const analysis = {
    vehicleId: vehicle.id,
    modele: vehicle.modele,
    mode: vehicle.mode,
    energie: vehicle.energie,
    salarie: vehicle.salarie,
    miseADisposition: vehicle.miseADisposition,
    bareme: baremeFor(vehicle.miseADisposition).id,
    forceProbanteMiseADispo: vehicle.forceProbanteMiseADispo,
    preuves: vehicle.preuves,
    reassigned: Boolean(vehicle.reassignment),
    months: 0,
    monthsAbsent: 0,
    declaredTotal: 0,
    expectedTotal: 0,
    deltas: {},
    causes: [],
    lastMonthOpenCauses: [],
    payrollUnresolved: false,
    elecStats: null,
    ageStats: null,
    notes: [],
    statut: 'conforme',
  }
  const bucket = (cause) => (analysis.deltas[cause] ??= emptyBucket())
  const add = (cause, month, { firm = 0, cond = 0 }) => {
    const b = bucket(cause)
    if (month >= prescriptionStart) {
      b.firm += firm
      b.cond += cond
    } else {
      b.prescribed += firm + cond
    }
    b.months.push(month)
    if (!analysis.causes.includes(cause)) analysis.causes.push(cause)
    if (month === periodEnd && (firm > 0 || cond > 0) && !analysis.lastMonthOpenCauses.includes(cause)) {
      analysis.lastMonthOpenCauses.push(cause)
    }
  }

  for (const assignment of assignments(vehicle, periodStart, periodEnd)) {
    if (!assignment.start || assignment.start > assignment.end) continue
    const assignedVehicle = { ...vehicle, miseADisposition: assignment.miseADisposition }
    for (const month of monthsBetween(assignment.start, assignment.end)) {
      const declared = payrollIndex.get(`${vehicle.id}:${month}`) ?? null
      const expected = expectedAnnualANV(assignedVehicle, `${month}-01`)
      analysis.months += 1
      analysis.declaredTotal += declared ?? 0

      if (expected.indeterminate) {
        handleIndeterminateMonth(analysis, assignedVehicle, expected, declared, month, add)
        continue
      }

      analysis.expectedTotal += expected.monthly
      if (declared === null) {
        analysis.monthsAbsent += 1
        if (unmatchedSalaries.has(normalizeName(assignment.salarie))) {
          // Des lignes de paie existent pour ce salarié mais n'ont pas pu être
          // rattachées à un véhicule : on instruit au lieu de conclure.
          analysis.payrollUnresolved = true
          pushNote(analysis, `Lignes de paie du salarié non rattachables à un véhicule : rattachement à instruire avant de conclure sur ${month}.`)
        } else {
          add('absent-paie', month, { firm: expected.monthly })
        }
        continue
      }
      const delta = expected.monthly - declared
      if (delta > TOLERANCE) {
        add(classifyGap(assignedVehicle, declared), month, { firm: delta })
      } else if (delta < -TOLERANCE) {
        add('sur-declaration', month, {})
      }
    }
  }

  for (const cause of Object.keys(analysis.deltas)) {
    const b = analysis.deltas[cause]
    b.firm = round2(b.firm)
    b.cond = round2(b.cond)
    b.prescribed = round2(b.prescribed)
  }
  analysis.declaredTotal = round2(analysis.declaredTotal)
  analysis.expectedTotal = round2(analysis.expectedTotal)
  // Totaux véhicule = somme de toutes les causes (annexe réconciliée avec le
  // risk register : la part ferme de l'abattement électrique en fait partie).
  const buckets = Object.values(analysis.deltas)
  analysis.assietteDelta = round2(buckets.reduce((acc, b) => acc + b.firm, 0))
  analysis.conditionalDelta = round2(buckets.reduce((acc, b) => acc + b.cond, 0))
  analysis.prescribedDelta = round2(buckets.reduce((acc, b) => acc + b.prescribed, 0))
  analysis.statut = vehicleStatus(analysis)
  return analysis
}

function handleIndeterminateMonth(analysis, vehicle, expected, declared, month, add) {
  if (vehicle.energie === 'electrique' && expected.candidates) {
    const floorMonthly = expected.candidates.avecAbattement / 12
    const fullMonthly = expected.candidates.sansAbattement / 12
    const base = declared ?? 0
    const firm = floorMonthly - base > TOLERANCE ? floorMonthly - base : 0
    const cond = Math.max(0, fullMonthly - Math.max(base, floorMonthly))
    add('abattement-electrique', month, { firm, cond })
    analysis.elecStats ??= { declaredMonthly: declared, floorMonthly: round2(floorMonthly), fullMonthly: round2(fullMonthly) }
    pushNote(analysis, expected.reason)
    return
  }
  if (expected.candidates) {
    const highMonthly = expected.candidates.siRecent / 12
    const lowMonthly = expected.candidates.siAncien / 12
    const base = declared ?? 0
    const cond = highMonthly - base > TOLERANCE ? highMonthly - base : 0
    add('age-indetermine', month, { cond })
    analysis.ageStats ??= {
      declaredMonthly: declared,
      siRecentMonthly: round2(highMonthly),
      siAncienMonthly: round2(lowMonthly),
      matchesAncien: declared !== null && Math.abs(lowMonthly - declared) <= TOLERANCE,
    }
    pushNote(analysis, expected.reason)
    return
  }
  add('cout-non-justifie', month, {})
  pushNote(analysis, expected.reason)
}

function classifyGap(vehicle, declared) {
  if (vehicle.miseADisposition >= NEW_SCALE_EFFECTIVE) {
    const oldScale = expectedAnnualANV(
      { ...vehicle, miseADisposition: '2024-01-01' },
      `${NEW_SCALE_EFFECTIVE.slice(0, 7)}-01`,
    )
    if (!oldScale.indeterminate && Math.abs(oldScale.monthly - declared) <= TOLERANCE) {
      return 'bareme-2025'
    }
  }
  if (vehicle.carburant) {
    const sansCarburant = expectedAnnualANV({ ...vehicle, carburant: false }, `${vehicle.miseADisposition.slice(0, 7)}-01`)
    if (!sansCarburant.indeterminate && Math.abs(sansCarburant.monthly - declared) <= TOLERANCE) {
      return 'carburant'
    }
  }
  return 'ecart-inexplique'
}

function pushNote(analysis, note) {
  if (note && !analysis.notes.includes(note)) analysis.notes.push(note)
}

function vehicleStatus(analysis) {
  if (analysis.causes.some((cause) => ['absent-paie', 'bareme-2025', 'carburant'].includes(cause))) return 'non conforme'
  if (analysis.causes.includes('abattement-electrique')) return 'conformité non démontrable'
  if (analysis.causes.includes('cout-non-justifie')) return 'conformité non démontrable'
  if (analysis.causes.includes('age-indetermine')) return 'indéterminé'
  if (analysis.causes.includes('ecart-inexplique')) return 'probablement non conforme'
  if (analysis.payrollUnresolved) return 'à instruire (rattachement paie)'
  if (analysis.causes.includes('sur-declaration')) return 'sur-déclaré (à instruire)'
  if (analysis.forceProbanteMiseADispo !== 'probante') return 'à confirmer'
  return 'conforme'
}

const severityRank = { critique: 4, 'élevé': 3, moyen: 2, faible: 1 }

function sumCause(vehicles, cause, key) {
  return round2(vehicles.reduce((acc, v) => acc + (v.deltas[cause]?.[key] ?? 0), 0))
}

function causeWindow(vehicles, cause) {
  const months = vehicles.flatMap((v) => v.deltas[cause]?.months ?? [])
  if (!months.length) return null
  months.sort()
  return `${months[0]} → ${months[months.length - 1]}`
}

// Confiance calculée : complétude probatoire des véhicules concernés.
function confidenceFromProofs(vehicles) {
  const probantes = vehicles.filter((v) => v.forceProbanteMiseADispo === 'probante').length
  if (probantes === vehicles.length) return 'élevée'
  if (probantes > 0) return 'moyenne'
  return 'faible'
}

function fmtEur(value) {
  return `${Math.round(value).toLocaleString('fr-FR')} €`
}

function buildFindings(vehicleAnalyses, mission, structured) {
  const findings = []
  const byCause = (cause) => vehicleAnalyses.filter((v) => v.causes.includes(cause))
  const policy = structured.policyFact ?? null
  const sourceDocs = [structured.fleetDocName, structured.payrollDocName].filter(Boolean)

  const bareme = byCause('bareme-2025')
  if (bareme.length) {
    const reassigned = bareme.filter((v) => v.reassigned && v.miseADisposition >= NEW_SCALE_EFFECTIVE)
    findings.push(makeFinding({
      id: 'SOC-ANV-001',
      severity: 'critique',
      title: 'Barème ANV 2025 non appliqué aux mises à disposition postérieures au 1er février 2025',
      controlId: 'ANV-CAL-001',
      cause: 'bareme-2025',
      vehicles: bareme,
      sourceDocs,
      facts: `${bareme.length} véhicule${bareme.length > 1 ? 's' : ''} mis à disposition à compter du 01/02/2025 (${bareme.map((v) => v.vehicleId).join(', ')}) présentent un ANV déclaré correspondant à l'ancien barème (9 % achat / 30–40 % location) au lieu du barème de l'arrêté du 25 février 2025 (15 % / 50–67 %).${reassigned.length ? ` Le cas ${reassigned.map((v) => v.vehicleId).join(', ')} (véhicule réattribué à un nouveau salarié après le 01/02/2025) révèle une erreur de doctrine sur la date d'attribution.` : ''}`,
      rule: "Arrêté du 25 février 2025 ; BOSS Avantages en nature (mise à jour mars 2025) : le barème dépend de la date d'attribution du véhicule au salarié.",
      probability: 'élevée',
      dealImpact: `Indemnité spécifique URSSAF sur les ANV véhicules${bareme.some((v) => v.lastMonthOpenCauses.includes('bareme-2025')) ? " ; l'écart persiste sur le dernier mois audité : le passif continue de courir jusqu'à correction du paramétrage" : ''}.`,
      recoPreClosing: 'Recalcul complet des ANV depuis février 2025 ; demander le paramétrage du prestataire de paie et la DSN pour confirmer l\'assiette.',
      recoSpa: 'Specific indemnity (hors basket, hors cap) couvrant tout redressement URSSAF au titre des ANV véhicules sur la période non prescrite.',
      postClosing: 'Correction du paramétrage de paie et régularisation DSN à 30 jours.',
      mission,
    }))
  }

  const carburant = byCause('carburant')
  if (carburant.length) {
    findings.push(makeFinding({
      id: 'SOC-ANV-002',
      severity: 'élevé',
      title: 'Prise en charge du carburant non intégrée à l\'évaluation forfaitaire',
      controlId: 'ANV-CAL-002',
      cause: 'carburant',
      vehicles: carburant,
      sourceDocs,
      facts: `${carburant.length} véhicule${carburant.length > 1 ? 's' : ''} (${carburant.map((v) => v.vehicleId).join(', ')}) sont déclarés au listing flotte avec prise en charge du carburant par l'employeur mais valorisés en paie au taux « sans carburant ».${policy?.carburantCommerciaux ? ' La politique véhicule confirme la prise en charge du carburant pour les fonctions commerciales.' : ''}`,
      rule: 'Barèmes majorés carburant : 12 %/9 % puis 20 %/15 % (achat), 40 % puis 67 % (location).',
      probability: 'élevée',
      dealImpact: 'Assiette éludée récurrente, facilement détectée en contrôle URSSAF par simple rapprochement flotte / paie.',
      recoPreClosing: 'Obtenir les relevés de cartes carburant pour confirmer le périmètre des bénéficiaires réels.',
      recoSpa: 'Rattacher à la specific indemnity URSSAF ANV (même fait générateur).',
      postClosing: 'Recalcul paie et alignement politique véhicule / paie à 60 jours.',
      mission,
    }))
  }

  const absent = byCause('absent-paie')
  if (absent.length) {
    findings.push(makeFinding({
      id: 'SOC-ANV-003',
      severity: 'élevé',
      title: 'Véhicule affecté sans avantage en nature en paie',
      controlId: 'ANV-COH-001',
      cause: 'absent-paie',
      vehicles: absent,
      sourceDocs,
      facts: absent.map((v) => {
        const missing = v.deltas['absent-paie']?.months.length ?? 0
        const scope = missing === v.months ? `aucune ligne ANV en paie sur les ${v.months} mois contrôlés` : `${missing} mois sans ligne ANV sur ${v.months} contrôlés`
        return `${v.vehicleId} (${v.salarie}) : ${scope}`
      }).join(' ; ') + '.',
      rule: 'Art. L. 242-1 CSS : tout avantage en nature doit être réintégré dans l\'assiette des cotisations.',
      probability: 'élevée',
      dealImpact: 'Omission d\'assiette : redressement quasi certain en cas de contrôle sur la période non prescrite.',
      recoPreClosing: 'Confirmer l\'usage personnel du véhicule (carnet de bord, politique) et obtenir les bulletins du salarié concerné.',
      recoSpa: 'Specific indemnity URSSAF ANV ; mention en disclosure schedule.',
      postClosing: 'Régularisation de paie rétroactive dans la limite de la prescription à 30 jours.',
      mission,
    }))
  }

  const electrique = byCause('abattement-electrique')
  if (electrique.length) {
    findings.push(makeFinding({
      id: 'SOC-ANV-004',
      severity: 'élevé',
      title: 'Abattement véhicule électrique non sécurisé (éco-score et plafond)',
      controlId: 'ANV-CAL-003',
      cause: 'abattement-electrique',
      vehicles: electrique,
      sourceDocs,
      facts: electrique.map((v) => {
        const stats = v.elecStats
        if (!stats || stats.declaredMonthly === null) return `${v.vehicleId} : aucune valorisation en paie et abattement non justifiable en l'état.`
        const posture = stats.declaredMonthly < stats.floorMonthly - TOLERANCE
          ? `ANV déclaré ${fmtEur(stats.declaredMonthly)}/mois, inférieur au minimum plafonné de ${fmtEur(stats.floorMonthly)}/mois (abattement appliqué au-delà du plafond de 4 582 €/an)`
          : `ANV déclaré ${fmtEur(stats.declaredMonthly)}/mois, cohérent avec l'abattement plafonné (${fmtEur(stats.floorMonthly)}/mois)`
        return `${v.vehicleId} : ${posture} ; sans attestation d'éco-score, l'abattement n'est pas sécurisé (réintégration possible jusqu'à ${fmtEur(stats.fullMonthly)}/mois).`
      }).join(' '),
      rule: 'Arrêté du 25 février 2025 : abattement 70 % plafonné à 4 582 €/an, subordonné à un éco-score minimal, pour les mises à disposition à compter du 01/02/2025.',
      probability: 'moyenne',
      dealImpact: 'Si l\'éco-score ne peut pas être justifié, l\'abattement tombe et l\'assiette est réintégrée en totalité.',
      recoPreClosing: 'Demander l\'attestation d\'éco-score du constructeur et recalculer l\'ANV plafonné.',
      recoSpa: 'Garantie déclarative renforcée sur la conformité des ANV véhicules électriques.',
      postClosing: 'Collecte des attestations éco-score et correction du plafonnement à 30 jours.',
      confidenceOverride: 'moyenne',
      mission,
    }))
  }

  const age = byCause('age-indetermine')
  if (age.length) {
    findings.push(makeFinding({
      id: 'SOC-ANV-005',
      severity: 'moyen',
      title: 'Âge du véhicule non prouvé : taux forfaitaire invérifiable',
      controlId: 'ANV-DOC-001',
      cause: 'age-indetermine',
      vehicles: age,
      sourceDocs,
      facts: age.map((v) => {
        const stats = v.ageStats
        const posture = stats?.matchesAncien
          ? `l'ANV déclaré (${fmtEur(stats.declaredMonthly)}/mois) correspond au taux « plus de 5 ans » (${fmtEur(stats.siAncienMonthly)}/mois) sans carte grise pour le prouver`
          : stats?.declaredMonthly !== null && stats !== null
            ? `l'ANV déclaré (${fmtEur(stats.declaredMonthly)}/mois) ne correspond à aucun des deux taux candidats (${fmtEur(stats.siAncienMonthly)} / ${fmtEur(stats.siRecentMonthly)})`
            : 'aucune valorisation vérifiable'
        return `${v.vehicleId} : carte grise absente du dossier ; ${posture}. Conformité non démontrable en l'état.`
      }).join(' '),
      rule: 'Charge de la preuve de l\'employeur (art. R. 243-59 CSS) : l\'absence de preuve n\'est pas la preuve de conformité.',
      probability: 'moyenne',
      dealImpact: 'Exposition conditionnelle si le véhicule a moins de 5 ans ; point de data room à purger avant signing.',
      recoPreClosing: 'Exiger la carte grise via la Q&A data room avant signing.',
      recoSpa: 'Disclosure schedule + condition de production de la pièce avant closing.',
      postClosing: 'Compléter le dossier flotte (cartes grises systématiques) à 90 jours.',
      confidenceOverride: 'élevée',
      mission,
    }))
  }

  const declaratives = vehicleAnalyses.filter((v) => v.forceProbanteMiseADispo !== 'probante')
  if (declaratives.length) {
    findings.push(makeFinding({
      id: 'SOC-ANV-006',
      severity: 'moyen',
      title: 'Mises à disposition sans avenant : date d\'attribution non opposable',
      controlId: 'ANV-PRE-001',
      cause: null,
      vehicles: declaratives,
      sourceDocs,
      facts: `${declaratives.map((v) => `${v.vehicleId} (${v.salarie})`).join(', ')} : aucun accord écrit daté de mise à disposition dans le dossier${policy?.avenantPrevu ? ', alors que la politique véhicule prévoit un avenant systématique' : ''}. Or le barème applicable dépend précisément de la date d'attribution.`,
      rule: 'BOSS mars 2025 : la date de mise à disposition est celle fixée par l\'accord employeur/salarié.',
      probability: 'moyenne',
      dealImpact: 'Fragilité probatoire transverse : sans écrit, la cible ne peut pas défendre le barème appliqué en cas de contrôle.',
      recoPreClosing: 'Demander les avenants manquants ; à défaut, tout document daté (email d\'attribution, PV de remise).',
      recoSpa: 'Covenant de remédiation : régularisation des avenants dans les 60 jours du closing.',
      postClosing: 'Signature des avenants manquants et procédure d\'attribution formalisée à 60 jours.',
      confidenceOverride: 'élevée',
      mission,
    }))
  }

  const inexplique = byCause('ecart-inexplique')
  if (inexplique.length) {
    findings.push(makeFinding({
      id: 'SOC-ANV-007',
      severity: 'moyen',
      title: 'Écarts de valorisation inexpliqués entre flotte et paie',
      controlId: 'ANV-CAL-001',
      cause: 'ecart-inexplique',
      vehicles: inexplique,
      sourceDocs,
      facts: `${inexplique.map((v) => v.vehicleId).join(', ')} : l'ANV déclaré ne correspond ni au barème daté attendu ni à une cause identifiable (ancien barème, carburant).`,
      rule: 'Contrôle de calcul générique : assiette, taux, plafonds.',
      probability: 'moyenne',
      dealImpact: 'Écart à instruire avant signing.',
      recoPreClosing: 'Demander le détail de calcul du prestataire de paie pour ces véhicules.',
      recoSpa: 'Garantie déclarative renforcée dans l\'attente d\'explication.',
      postClosing: 'Revue du paramétrage à 60 jours.',
      confidenceOverride: 'faible',
      mission,
    }))
  }

  const coutNonJustifie = byCause('cout-non-justifie')
  if (coutNonJustifie.length) {
    findings.push(makeFinding({
      id: 'SOC-ANV-009',
      severity: 'moyen',
      title: 'Coût du véhicule non justifié : évaluation forfaitaire non reconstituable',
      controlId: 'ANV-DOC-001',
      cause: 'cout-non-justifie',
      vehicles: coutNonJustifie,
      sourceDocs,
      facts: `${coutNonJustifie.map((v) => `${v.vehicleId} (${v.salarie})`).join(', ')} : ni le listing flotte ni les pièces produites ne justifient le coût du véhicule (coût d'achat TTC ou coût global annuel de location). Le forfait attendu ne peut pas être reconstitué : conformité non démontrable, exposition non chiffrable en l'état.`,
      rule: 'Charge de la preuve de l\'employeur (art. R. 243-59 CSS) : l\'assiette du forfait doit être justifiable.',
      probability: 'indéterminée',
      dealImpact: 'Zone non chiffrée du contrôle : à purger avant signing par la production des pièces de coût.',
      recoPreClosing: 'Demander la facture d\'achat ou le contrat de location du véhicule concerné.',
      recoSpa: 'Disclosure schedule + production de la pièce avant closing.',
      postClosing: 'Compléter le dossier flotte (justificatifs de coût systématiques) à 90 jours.',
      confidenceOverride: 'élevée',
      mission,
    }))
  }

  const unresolved = vehicleAnalyses.filter((v) => v.payrollUnresolved)
  if (unresolved.length) {
    findings.push(makeFinding({
      id: 'SOC-ANV-008',
      severity: 'moyen',
      title: 'Rattachement paie ↔ véhicule à instruire',
      controlId: 'ANV-COH-001',
      cause: null,
      vehicles: unresolved,
      sourceDocs,
      facts: `${unresolved.map((v) => `${v.vehicleId} (${v.salarie})`).join(', ')} : des lignes de paie existent pour le(s) salarié(s) mais n'ont pas pu être rattachées à un véhicule précis (référence absente ou ambiguë). Aucune conclusion de conformité ou de non-conformité n'est posée sur ces mois.`,
      rule: 'Contrôle de cohérence inter-documents : un rapprochement fiable est un préalable à toute conclusion.',
      probability: 'indéterminée',
      dealImpact: 'Zone non conclue du contrôle : à purger avant signing.',
      recoPreClosing: 'Demander un export de paie avec la référence du véhicule par ligne.',
      recoSpa: 'Aucune clause tant que le rapprochement n\'est pas instruit.',
      postClosing: 'Fiabiliser la référence véhicule dans la paie à 60 jours.',
      confidenceOverride: 'élevée',
      mission,
    }))
  }

  return findings.sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
}

function makeFinding(input) {
  const vehicles = input.vehicles
  const assiette = input.cause ? sumCause(vehicles, input.cause, 'firm') : 0
  const conditional = input.cause ? sumCause(vehicles, input.cause, 'cond') : 0
  const prescribed = input.cause ? sumCause(vehicles, input.cause, 'prescribed') : 0
  const window = input.cause ? causeWindow(vehicles, input.cause) : null
  const exposure = assiette > 0 ? exposureFromAssiette(assiette) : null
  const conditionalExposure = conditional > 0 ? exposureFromAssiette(conditional) : null
  return {
    id: input.id,
    severity: input.severity,
    title: input.title,
    controlId: input.controlId,
    control: controlCatalog.find((c) => c.id === input.controlId) ?? null,
    sources: [
      ...input.sourceDocs,
      ...vehicles.flatMap((v) => [v.preuves?.avenant?.name, v.preuves?.carteGrise?.name, v.preuves?.contratLocation?.name]).filter(Boolean),
    ].filter((name, i, arr) => name && arr.indexOf(name) === i),
    vehicles: vehicles.map((v) => ({
      vehicleId: v.vehicleId,
      salarie: v.salarie,
      statut: v.statut,
      assietteDelta: input.cause ? round2(v.deltas[input.cause]?.firm ?? 0) : 0,
      conditionalDelta: input.cause ? round2(v.deltas[input.cause]?.cond ?? 0) : 0,
    })),
    facts: input.facts,
    rule: input.rule,
    period: window ?? input.mission.period,
    population: vehicles.map((v) => v.salarie).filter((s, i, arr) => s && arr.indexOf(s) === i),
    assietteEludee: assiette,
    assietteConditionnelle: conditional,
    assiettePrescrite: prescribed,
    exposure,
    conditionalExposure,
    probability: input.probability,
    dealImpact: input.dealImpact,
    recoPreClosing: input.recoPreClosing,
    recoSpa: input.recoSpa,
    postClosing: input.postClosing,
    confidence: input.confidenceOverride ?? confidenceFromProofs(vehicles),
    review: 'needs-review',
    contradiction: null,
  }
}

function buildControls(vehicleAnalyses, structured, mission, findings) {
  const results = new Map(controlCatalog.map((c) => [c.id, { ...c, status: 'conforme', details: [] }]))

  // ANV-PER-001 : rattachement à la bonne entité (SIRET/SIREN uniquement —
  // le contrôle de couverture temporelle des pièces n'est pas implémenté).
  const per = results.get('ANV-PER-001')
  const perimeterRef = mission.siret ?? mission.siren ?? null
  const outOfScope = (siret) => Boolean(siret) && Boolean(perimeterRef) && (
    mission.siret ? siret !== mission.siret : !String(siret).startsWith(mission.siren)
  )
  const wrongSiret = structured.documentFacts.filter((f) => outOfScope(f.siret))
  if (!perimeterRef) {
    per.status = 'à confirmer'
    per.details = ['Ni SIREN ni SIRET renseignés au cadrage : le rattachement des pièces à la bonne entité ne peut pas être vérifié.']
  } else if (wrongSiret.length) {
    per.status = 'non conforme'
    per.details = wrongSiret.map((f) => `${f.name} : SIRET ${f.siret} hors périmètre (référence : ${perimeterRef})`)
  } else {
    per.details = [`Les pièces porteuses d'un SIRET se rattachent à ${perimeterRef}. La couverture temporelle pièce par pièce n'est pas contrôlée dans cette version.`]
  }

  // ANV-DOC-001 : complétude probatoire
  const doc = results.get('ANV-DOC-001')
  const docDetails = structured.missingEvidence.map((m) => `${m.piece} — ${m.reason}`)
  if (structured.droppedVehicles > 0) {
    docDetails.push(`${structured.droppedVehicles} ligne(s) du listing flotte écartée(s) faute de date de mise à disposition ou de salarié : périmètre potentiellement incomplet.`)
  }
  if (docDetails.length) {
    doc.status = 'incomplet'
    doc.details = docDetails
  }

  // ANV-REG-001 : méthode d'évaluation documentée
  const reg = results.get('ANV-REG-001')
  const policy = structured.policyFact
  if (!policy) {
    reg.status = 'non démontré faute de pièce'
    reg.details = ['Aucune politique véhicule produite : méthode d\'évaluation non documentée.']
  } else if (policy.methodeForfait) {
    reg.details = [`Politique véhicule produite : méthode forfaitaire documentée${policy.carburantCommerciaux ? ', prise en charge du carburant pour les fonctions commerciales' : ''}.`]
  } else {
    reg.status = 'à confirmer'
    reg.details = ['Politique véhicule produite mais la méthode d\'évaluation (réel vs forfait) n\'y est pas clairement documentée.']
  }

  const setFromFindings = (controlId, status) => {
    const control = results.get(controlId)
    const related = findings.filter((f) => f.controlId === controlId)
    if (related.length) {
      control.status = status
      control.details = related.map((f) => `${f.id} — ${f.title}`)
    }
  }
  setFromFindings('ANV-CAL-001', 'non conforme')
  setFromFindings('ANV-CAL-002', 'non conforme')
  setFromFindings('ANV-CAL-003', 'conformité non démontrable')
  setFromFindings('ANV-COH-001', 'non conforme')
  setFromFindings('ANV-PRE-001', 'à confirmer')

  // Divergences date listing ↔ date avenant : la date écrite prévaut, la
  // divergence est signalée (la barème dépend de cette date).
  const pre = results.get('ANV-PRE-001')
  const discrepancies = structured.vehicles.filter((v) => v.dateDiscrepancy)
  if (discrepancies.length) {
    pre.status = pre.status === 'conforme' ? 'à confirmer' : pre.status
    pre.details = [
      ...pre.details,
      ...discrepancies.map((v) => `${v.id} : date d'attribution divergente — listing ${v.dateDiscrepancy.listing} vs avenant ${v.dateDiscrepancy.avenant} (la date écrite de l'avenant a été retenue pour le barème).`),
    ]
  }

  return [...results.values()]
}

function buildQaTracker(structured) {
  return structured.missingEvidence.map((m, index) => ({
    id: `QA-${String(index + 1).padStart(2, '0')}`,
    question: m.question,
    piece: m.piece,
    reason: m.reason,
    urgency: m.urgency,
    status: 'à demander',
    impactSiNonFourni: m.impact,
  }))
}

function missingEvidence(vehicles, documentFacts, structured) {
  const missing = []
  for (const v of vehicles) {
    if (!v.preuves.carteGrise && v.mode === 'achat') {
      missing.push({
        piece: `Carte grise ${v.id}${v.immatriculation ? ` (${v.immatriculation})` : ''}`,
        question: `Produire le certificat d'immatriculation du véhicule ${v.id}${v.immatriculation ? ` (${v.immatriculation})` : ''}.`,
        reason: 'Nécessaire pour prouver l\'âge du véhicule et donc le taux forfaitaire applicable.',
        urgency: 'haute',
        impact: 'Taux récent vs ancien invérifiable : exposition conditionnelle maintenue au risk register.',
      })
    }
    if (!v.preuves.contratLocation && v.mode === 'location') {
      missing.push({
        piece: `Contrat de location ${v.id}`,
        question: `Produire le contrat LLD/LOA du véhicule ${v.id} avec le coût global annuel (loyers, entretien, assurance).`,
        reason: 'Le coût global annuel est l\'assiette du forfait location : le listing seul est déclaratif.',
        urgency: 'haute',
        impact: 'Chiffrage fondé sur le listing flotte, confiance dégradée.',
      })
    }
    if (v.mode === 'achat' && !Number.isFinite(v.coutAchat)) {
      missing.push({
        piece: `Justificatif du coût d'achat ${v.id}`,
        question: `Produire la facture d'achat TTC du véhicule ${v.id} : aucun coût n'est justifié, le forfait ne peut pas être reconstitué.`,
        reason: 'Le coût d\'achat TTC est l\'assiette du forfait achat.',
        urgency: 'haute',
        impact: 'Évaluation forfaitaire non reconstituable : conformité non démontrable.',
      })
    }
    if (!v.preuves.avenant) {
      missing.push({
        piece: `Avenant de mise à disposition ${v.id} (${v.salarie})`,
        question: `Produire l'avenant ou l'accord écrit d'attribution du véhicule ${v.id} à ${v.salarie}.`,
        reason: 'La date d\'attribution détermine le barème applicable (ancien vs arrêté du 25/02/2025).',
        urgency: 'moyenne',
        impact: 'Date de mise à disposition non opposable : barème contestable dans les deux sens.',
      })
    }
    if (v.energie === 'electrique' && !v.ecoScoreProuve) {
      missing.push({
        piece: `Attestation éco-score ${v.id}`,
        question: `Produire l'attestation d'éco-score du véhicule électrique ${v.id}.`,
        reason: 'L\'abattement de 70 % est subordonné à un éco-score minimal pour les mises à disposition depuis le 01/02/2025.',
        urgency: 'haute',
        impact: 'Abattement électrique non sécurisé : réintégration totale possible.',
      })
    }
  }
  if (structured.unmatchedPayroll > 0) {
    missing.push({
      piece: 'Export de paie avec référence véhicule',
      question: `Produire un export de paie rattachant chaque ligne d'ANV à un véhicule (référence ou immatriculation) : ${structured.unmatchedPayroll} ligne(s) n'ont pas pu être rattachées.`,
      reason: 'Le rapprochement paie ↔ véhicule est un préalable au contrôle de calcul.',
      urgency: 'haute',
      impact: 'Zones non conclues dans le contrôle de cohérence.',
    })
  }
  if (!documentFacts.some((f) => f.kind === 'journal-paie')) {
    missing.push({
      piece: 'Journal de paie ANV',
      question: 'Produire le journal de paie détaillant les lignes ANV véhicule par salarié et par mois.',
      reason: 'Matériau de base du contrôle de calcul.',
      urgency: 'haute',
      impact: 'Aucun contrôle de calcul possible.',
    })
  }
  if (!documentFacts.some((f) => f.kind === 'dsn')) {
    missing.push({
      piece: 'DSN mensuelles (période auditée)',
      question: 'Produire les DSN mensuelles par établissement pour recouper paie et déclaratif.',
      reason: 'Contrôle de cohérence paie ↔ DSN ↔ bordereaux (non réalisable sur le seul journal de paie).',
      urgency: 'moyenne',
      impact: 'Le contrôle déclaratif reste hors périmètre du présent rapport (limitation de mission).',
    })
  }
  return missing
}

function dealRiskScore(findings) {
  // Indice de conformité de la thématique (100 = dossier propre). Ne prétend pas
  // noter le deal entier : une seule verticale est auditée.
  const penalty = { critique: 18, 'élevé': 8, moyen: 3, faible: 1 }
  const score = Math.max(5, 100 - findings.reduce((acc, f) => acc + penalty[f.severity], 0))
  const critiques = findings.filter((f) => f.severity === 'critique')
  const unquantifiedCritical = critiques.filter((f) => !f.exposure && !f.conditionalExposure)
  const closingBlocker = unquantifiedCritical.length > 0
  const hasExposure = findings.some((f) => f.exposure || f.conditionalExposure)
  const note = closingBlocker
    ? `${unquantifiedCritical.map((f) => f.id).join(', ')} : constat critique non chiffrable en l'état — à purger avant signing.`
    : !findings.length
      ? 'Aucun constat sur la thématique ANV au vu des pièces produites.'
      : hasExposure
        ? 'Passif chiffrable sur la thématique ANV : traitable par indemnité spécifique et production des pièces manquantes, sans blocage du closing.'
        : 'Constats non chiffrables en l\'état (zones de preuve à purger) : à traiter par la production des pièces demandées avant signing.'
  return {
    score,
    critiques: critiques.length,
    eleves: findings.filter((f) => f.severity === 'élevé').length,
    closingBlocker,
    note,
  }
}

export function runAudit({ mission, structured, onProgress = null }) {
  const emit = (event) => onProgress?.(event)

  emit({
    phase: 'controle',
    actor: 'moteur',
    action: 'Indexation des lignes de paie',
    rationale: `${structured.payroll.length} ligne(s) à rapprocher véhicule/mois ; les doublons seront sommés.`,
    status: 'active',
    refs: structured.payrollDocName ? [structured.payrollDocName] : [],
  })

  // Lignes de paie : sommées par véhicule/mois (les doublons — régularisations,
  // lignes correctives — s'additionnent au lieu de s'écraser).
  const payrollIndex = new Map()
  let duplicatePayrollRows = 0
  for (const row of structured.payroll) {
    const key = `${row.vehicleId}:${row.month}`
    if (payrollIndex.has(key)) {
      duplicatePayrollRows += 1
      payrollIndex.set(key, round2(payrollIndex.get(key) + row.declared))
    } else {
      payrollIndex.set(key, row.declared)
    }
  }

  if (duplicatePayrollRows) {
    emit({
      phase: 'controle',
      actor: 'moteur',
      action: 'Doublons de paie détectés',
      rationale: `${duplicatePayrollRows} ligne(s) dupliquée(s) sommée(s) par véhicule/mois (régularisations).`,
      refs: structured.payrollDocName ? [structured.payrollDocName] : [],
    })
  }

  const unmatchedSalaries = new Set((structured.unmatchedPayrollSalaries ?? []).map(normalizeName))
  const prescriptionStart = prescriptionStartMonth()

  emit({
    phase: 'controle',
    actor: 'moteur',
    action: 'Contrôle véhicule par véhicule',
    rationale: `Barème daté à la mise à disposition ; prescription appliquée à partir de ${prescriptionStart}.`,
    status: 'active',
    refs: structured.fleetDocName ? [structured.fleetDocName] : [],
  })

  const vehicleAnalyses = []
  for (const v of structured.vehicles) {
    const analysis = analyzeVehicle(v, payrollIndex, unmatchedSalaries, mission.periodStart, mission.periodEnd, prescriptionStart)
    vehicleAnalyses.push(analysis)
    const bareme = baremeFor(v.miseADisposition)
    emit({
      phase: 'controle',
      actor: 'moteur',
      action: `${v.id} — ${analysis.statut}`,
      rationale: analysis.causes.length
        ? `Causes : ${analysis.causes.join(', ')}. Barème ${bareme.id} appliqué à partir du ${v.miseADisposition}.`
        : `Conforme au barème ${bareme.id} (${analysis.months} mois contrôlés).`,
      refs: [v.id, ...(analysis.preuves?.avenant?.name ? [analysis.preuves.avenant.name] : [])],
      meta: {
        vehicleId: v.id,
        statut: analysis.statut,
        assietteDelta: analysis.assietteDelta,
        conditionalDelta: analysis.conditionalDelta,
        causes: analysis.causes,
      },
    })
  }

  structured.missingEvidence = missingEvidence(structured.vehicles, structured.documentFacts, structured)

  const findings = buildFindings(vehicleAnalyses, mission, structured)
  for (const finding of findings) {
    emit({
      phase: 'controle',
      actor: 'moteur',
      action: `Constat ${finding.id} (${finding.severity})`,
      rationale: `${finding.title}. Assiette éludée : ${finding.assietteEludee} €${finding.assietteConditionnelle ? ` ; conditionnelle : ${finding.assietteConditionnelle} €` : ''}.`,
      refs: [finding.id, finding.controlId, ...finding.sources.slice(0, 4)],
      meta: { findingId: finding.id, severity: finding.severity, controlId: finding.controlId },
    })
  }

  const controls = buildControls(vehicleAnalyses, structured, mission, findings)
  for (const control of controls) {
    emit({
      phase: 'controle',
      actor: 'moteur',
      action: `${control.id} — ${control.status}`,
      rationale: control.details[0] ?? control.expects,
      refs: [control.id],
      meta: { controlId: control.id, status: control.status },
    })
  }
  const qaTracker = buildQaTracker(structured)

  const totalAssiette = round2(findings.reduce((acc, f) => acc + f.assietteEludee, 0))
  const totalConditional = round2(findings.reduce((acc, f) => acc + f.assietteConditionnelle, 0))
  const totalPrescribed = round2(findings.reduce((acc, f) => acc + f.assiettePrescrite, 0))

  return {
    vehicleAnalyses,
    findings,
    controls,
    qaTracker,
    duplicatePayrollRows,
    totals: {
      assietteEludee: totalAssiette,
      assietteConditionnelle: totalConditional,
      assiettePrescrite: totalPrescribed,
      prescriptionStart,
      exposure: exposureFromAssiette(totalAssiette),
      exposureConditional: totalConditional > 0 ? exposureFromAssiette(totalConditional) : null,
      assumptions: exposureAssumptions,
    },
    riskScore: dealRiskScore(findings),
  }
}
