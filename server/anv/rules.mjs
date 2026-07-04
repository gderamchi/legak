// Référentiel de règles "Avantage en nature véhicule" (ANV), versionné dans le temps.
// Sources : arrêté du 10 décembre 2002 (ancien barème), arrêté du 25 février 2025
// (nouveau barème, mises à disposition à compter du 1er février 2025), BOSS rubrique
// "Avantages en nature" §§ 640-800.

export const NEW_SCALE_EFFECTIVE = '2025-02-01'

// Barèmes forfaitaires annuels, exprimés en fraction du coût d'achat TTC (achat)
// ou du coût global annuel TTC (location / LOA).
export const baremes = [
  {
    id: 'bareme-2002',
    source: 'Arrêté du 10 décembre 2002, art. 3',
    appliesTo: 'Mise à disposition du véhicule au salarié avant le 2025-02-01',
    validUntil: '2025-01-31',
    achat: { recent: 0.09, ancien: 0.06 },
    achatCarburant: { recent: 0.12, ancien: 0.09 },
    location: 0.30,
    locationCarburant: 0.40,
    electrique: { abattement: 0.50, plafondAnnuel: 2000.30, conditionEcoScore: false },
  },
  {
    id: 'bareme-2025',
    source: 'Arrêté du 25 février 2025 (JO 27 février 2025)',
    appliesTo: 'Mise à disposition du véhicule au salarié à compter du 2025-02-01',
    validFrom: '2025-02-01',
    achat: { recent: 0.15, ancien: 0.10 },
    achatCarburant: { recent: 0.20, ancien: 0.15 },
    location: 0.50,
    locationCarburant: 0.67,
    electrique: { abattement: 0.70, plafondAnnuel: 4582, conditionEcoScore: true },
  },
]

// Point de doctrine clé (BOSS, mise à jour mars 2025) : le barème applicable dépend
// de la date d'attribution du véhicule AU salarié, pas de la date d'achat du
// véhicule. Un véhicule acquis en 2021 mais réattribué à un autre salarié en avril
// 2025 bascule sur le barème 2025.
export function baremeFor(miseADispositionDate) {
  return miseADispositionDate >= NEW_SCALE_EFFECTIVE ? baremes[1] : baremes[0]
}

export function isRecentVehicle(firstRegistrationDate, atDate) {
  if (!firstRegistrationDate) return null
  const age = (new Date(atDate) - new Date(firstRegistrationDate)) / (365.25 * 24 * 3600 * 1000)
  return age <= 5
}

// Évaluation forfaitaire annuelle attendue pour un véhicule à une date donnée.
// Retourne { annual, monthly, basis, assumptions[] } ou { indeterminate, reason }.
export function expectedAnnualANV(vehicle, atDate) {
  const bareme = baremeFor(vehicle.miseADisposition)
  const assumptions = []

  if (vehicle.mode === 'location') {
    if (!Number.isFinite(vehicle.coutGlobalAnnuel)) {
      return { indeterminate: true, reason: 'Coût global annuel de location non justifié (contrat de location manquant).' }
    }
    const rate = vehicle.carburant ? bareme.locationCarburant : bareme.location
    const annual = round2(vehicle.coutGlobalAnnuel * rate)
    return {
      annual,
      monthly: round2(annual / 12),
      basis: `${pct(rate)} du coût global annuel TTC (${bareme.source})`,
      assumptions,
    }
  }

  // Achat
  if (!Number.isFinite(vehicle.coutAchat)) {
    return { indeterminate: true, reason: "Coût d'achat TTC non renseigné au listing et non justifié par une pièce : l'évaluation forfaitaire ne peut pas être reconstituée." }
  }
  const recent = isRecentVehicle(vehicle.premiereImmatriculation, atDate)
  if (recent === null) {
    return {
      indeterminate: true,
      reason: 'Âge du véhicule non prouvé (carte grise manquante) : impossible de trancher entre le taux véhicule récent et le taux véhicule de plus de 5 ans.',
      candidates: buildAchatCandidates(vehicle, bareme),
    }
  }
  const table = vehicle.carburant ? bareme.achatCarburant : bareme.achat
  const rate = recent ? table.recent : table.ancien
  let annual = vehicle.coutAchat * rate

  if (vehicle.energie === 'electrique') {
    const elec = bareme.electrique
    if (elec.conditionEcoScore && !vehicle.ecoScoreProuve) {
      return {
        indeterminate: true,
        reason: "Abattement véhicule électrique subordonné à un éco-score minimal : attestation non produite, l'abattement ne peut pas être sécurisé.",
        candidates: {
          sansAbattement: round2(annual),
          avecAbattement: round2(Math.max(annual - Math.min(annual * elec.abattement, elec.plafondAnnuel), 0)),
        },
      }
    }
    const abattement = Math.min(annual * elec.abattement, elec.plafondAnnuel)
    annual -= abattement
    assumptions.push(`Abattement électrique de ${pct(elec.abattement)} plafonné à ${elec.plafondAnnuel.toFixed(2)} €/an appliqué (${bareme.source}).`)
  }

  return {
    annual: round2(annual),
    monthly: round2(annual / 12),
    basis: `${pct(rate)} du coût d'achat TTC (${bareme.source})`,
    assumptions,
  }
}

function buildAchatCandidates(vehicle, bareme) {
  const table = vehicle.carburant ? bareme.achatCarburant : bareme.achat
  return {
    siRecent: round2(vehicle.coutAchat * table.recent),
    siAncien: round2(vehicle.coutAchat * table.ancien),
  }
}

// Hypothèses de chiffrage du redressement (documentées dans l'annexe du rapport).
export const exposureAssumptions = {
  tauxCotisationsBas: 0.40,
  tauxCotisationsHaut: 0.50,
  majorationsRetard: 0.10,
  note: "Cotisations et contributions patronales et salariales éludées estimées entre 40 % et 50 % de l'assiette reconstituée (taux moyen toutes cotisations sur ANV), majorations de retard estimées à 10 % (art. R. 243-18 CSS). L'exposition est chiffrée sur la seule assiette non prescrite : 3 années civiles précédentes plus l'année en cours (art. L. 244-3 CSS) ; l'assiette antérieure est présentée pour information.",
}

// Fenêtre non prescrite (art. L. 244-3 CSS) : les 3 années civiles précédant
// l'année en cours, appréciée à la date de l'audit.
export function prescriptionStartMonth(now = new Date()) {
  return `${now.getFullYear() - 3}-01`
}

export function exposureFromAssiette(assiette) {
  const low = assiette * exposureAssumptions.tauxCotisationsBas
  const high = assiette * exposureAssumptions.tauxCotisationsHaut * (1 + exposureAssumptions.majorationsRetard)
  return { low: Math.round(low), high: Math.round(high) }
}

// Catalogue des contrôles élémentaires (adaptation buy-side M&A du process d'audit
// URSSAF : périmètre / règle / preuve / calcul / cohérence / qualification).
export const controlCatalog = [
  {
    id: 'ANV-PER-001',
    kind: 'perimetre',
    title: 'Rattachement des pièces à la bonne entité et à la bonne période',
    legalBasis: 'Méthodologie de contrôle URSSAF — identification du redevable (SIREN/SIRET) et de la période contrôlable.',
    expects: 'Chaque pièce mentionne le SIRET de la cible et couvre la période auditée.',
  },
  {
    id: 'ANV-DOC-001',
    kind: 'preuve',
    title: 'Complétude du dossier probatoire ANV véhicules',
    legalBasis: "Charge de la preuve de l'employeur en cas de contrôle (art. R. 243-59 CSS) : listing flotte, cartes grises, contrats de location, politique véhicule, journal de paie, avenants.",
    expects: 'Toutes les pièces de la liste de collecte sont produites et exploitables.',
  },
  {
    id: 'ANV-REG-001',
    kind: 'regle',
    title: "Méthode d'évaluation retenue et option documentée (réel vs forfait)",
    legalBasis: "Arrêté du 10 décembre 2002, art. 3 ; BOSS Avantages en nature §§ 640 s. — l'option pour le forfait doit être identifiable et cohérente.",
    expects: "La politique véhicule ou la paie révèle une méthode d'évaluation unique et assumée.",
  },
  {
    id: 'ANV-CAL-001',
    kind: 'calcul',
    title: 'Application du barème en vigueur à la date de mise à disposition (time-travel)',
    legalBasis: "Arrêté du 25 février 2025 : barème majoré pour toute mise à disposition à compter du 1er février 2025, y compris en cas de réattribution d'un véhicule ancien.",
    expects: 'Les ANV en paie correspondent au barème daté correct, véhicule par véhicule.',
  },
  {
    id: 'ANV-CAL-002',
    kind: 'calcul',
    title: 'Prise en compte de la prise en charge du carburant',
    legalBasis: 'Barèmes majorés carburant (12 %/9 % puis 20 %/15 % achat ; 40 % puis 67 % location).',
    expects: 'Si la politique véhicule prévoit la prise en charge du carburant, la paie applique le taux majoré.',
  },
  {
    id: 'ANV-CAL-003',
    kind: 'calcul',
    title: 'Abattement véhicules électriques : taux, plafond et éco-score',
    legalBasis: "Arrêté du 25 février 2025 : abattement de 70 % plafonné à 4 582 €/an, subordonné à un éco-score minimal, pour les mises à disposition du 01/02/2025 au 31/12/2027.",
    expects: "L'abattement appliqué correspond au barème daté et l'éco-score est justifié.",
  },
  {
    id: 'ANV-COH-001',
    kind: 'coherence',
    title: 'Cohérence flotte ↔ paie : tout véhicule affecté génère un ANV en paie',
    legalBasis: "Assiette des cotisations (art. L. 242-1 CSS) : tout avantage en nature doit être réintégré dans l'assiette.",
    expects: 'Chaque affectation du listing flotte a des lignes ANV en paie sur toute la période.',
  },
  {
    id: 'ANV-PRE-001',
    kind: 'preuve',
    title: "Force probante des mises à disposition (avenant ou accord écrit daté)",
    legalBasis: "BOSS mars 2025 : le barème dépend de la date d'attribution fixée par l'accord employeur/salarié — sans écrit daté, la date (donc le barème) n'est pas opposable.",
    expects: 'Chaque affectation est adossée à un avenant ou accord écrit mentionnant la date d’attribution.',
  },
]

export function round2(value) {
  return Math.round(value * 100) / 100
}

function pct(rate) {
  return `${Math.round(rate * 100)} %`
}
