// Data room de démonstration : cible fictive "Novatech Services SAS" (CCN Syntec,
// 62 salariés), thématique auditée : avantages en nature véhicules, période
// 2024-01 → 2026-06. Les anomalies sont plantées dans les données ; le moteur de
// contrôle doit les retrouver par calcul, jamais par liste codée en dur.

export const demoTarget = {
  target: 'Novatech Services SAS',
  siren: '842306123',
  siret: '84230612300017',
  convention: 'Syntec IDCC 1486',
  effectif: 62,
  period: '2024-01 → 2026-06',
  periodStart: '2024-01',
  periodEnd: '2026-06',
}

// Flotte : 12 véhicules. Colonnes déclaratives remises par la cible.
// declaredMonthly = ce que la paie de la cible déclare réellement (source des anomalies).
const fleet = [
  { id: 'V-001', immat: 'GA-214-KX', modele: 'Peugeot 308', energie: 'thermique', mode: 'achat', cout: 28000, premiereImmat: '2021-06-15', mad: '2022-03-01', salarie: 'DUPONT Claire', fonction: 'Direction', carburant: false, declaredMonthly: 210 },
  { id: 'V-002', immat: 'FD-830-PL', modele: 'Renault Talisman', energie: 'thermique', mode: 'achat', cout: 35000, premiereImmat: '2017-06-01', mad: '2023-05-01', salarie: 'MARTIN Paul', fonction: 'Direction', carburant: false, declaredMonthly: 175 },
  { id: 'V-003', immat: 'GK-102-RS', modele: 'Renault Clio', energie: 'thermique', mode: 'location', coutAnnuel: 9600, mad: '2024-01-01', salarie: 'BERNARD Lucie', fonction: 'Consultante', carburant: false, declaredMonthly: 240 },
  // Anomalie : véhicule affecté, aucune ligne ANV en paie.
  { id: 'V-004', immat: 'GN-467-TT', modele: 'Peugeot 208', energie: 'thermique', mode: 'achat', cout: 24000, premiereImmat: '2023-04-20', mad: '2024-06-01', salarie: 'PETIT Hugo', fonction: 'Consultant', carburant: false, declaredMonthly: null },
  { id: 'V-005', immat: 'FT-556-MB', modele: 'Citroën C4', energie: 'thermique', mode: 'location', coutAnnuel: 8400, mad: '2022-11-01', salarie: 'MOREAU Emma', fonction: 'Commercial', carburant: true, declaredMonthly: 280 },
  // Anomalie : commercial avec carburant pris en charge, taux sans carburant appliqué.
  { id: 'V-006', immat: 'GH-909-AZ', modele: 'Volkswagen Passat', energie: 'thermique', mode: 'achat', cout: 26000, premiereImmat: '2022-09-05', mad: '2024-02-01', salarie: 'FOURNIER Léo', fonction: 'Commercial', carburant: true, declaredMonthly: 195 },
  // Anomalies barème 2025 : mises à disposition post-01/02/2025 valorisées à l'ancien barème.
  { id: 'V-007', immat: 'GW-118-JD', modele: 'Peugeot 3008', energie: 'thermique', mode: 'achat', cout: 32000, premiereImmat: '2024-12-05', mad: '2025-03-01', salarie: 'GIRARD Anna', fonction: 'Direction', carburant: false, declaredMonthly: 240, avenantManquant: true },
  { id: 'V-008', immat: 'GX-330-LM', modele: 'Renault Mégane', energie: 'thermique', mode: 'location', coutAnnuel: 10800, mad: '2025-04-01', salarie: 'LAMBERT Tom', fonction: 'Consultant', carburant: false, declaredMonthly: 270, avenantManquant: true },
  { id: 'V-009', immat: 'GY-742-QQ', modele: 'BMW Série 1', energie: 'thermique', mode: 'location', coutAnnuel: 12000, mad: '2025-06-01', salarie: 'ROUSSEAU Zoé', fonction: 'Commercial', carburant: true, declaredMonthly: 400, avenantManquant: true, contratLocationManquant: true },
  // Anomalie probatoire : carte grise manquante, âge du véhicule non prouvé.
  { id: 'V-010', immat: 'HA-005-BC', modele: 'Peugeot 2008', energie: 'thermique', mode: 'achat', cout: 21000, premiereImmat: null, mad: '2025-09-01', salarie: 'VINCENT Max', fonction: 'Consultant', carburant: false, declaredMonthly: 175, carteGriseManquante: true },
  // Anomalie : électrique post-02/2025, abattement 70 % appliqué sans justificatif d'éco-score.
  { id: 'V-011', immat: 'GZ-661-EE', modele: 'Tesla Model 3', energie: 'electrique', mode: 'achat', cout: 45000, premiereImmat: '2025-04-10', mad: '2025-05-01', salarie: 'HENRY Jade', fonction: 'Direction', carburant: false, declaredMonthly: 168.75, ecoScoreNonJustifie: true },
  // Anomalie subtile : véhicule 2020 réattribué le 15/02/2025 → bascule sur barème 2025.
  { id: 'V-012', immat: 'FY-284-HN', modele: 'Audi A3', energie: 'thermique', mode: 'achat', cout: 27000, premiereImmat: '2021-10-01', mad: '2025-02-15', salarie: 'NOEL Sam', fonction: 'Consultant', carburant: false, declaredMonthly: 202.5, priorAssignment: { salarie: 'DURAND Alex', mad: '2021-11-15', restitution: '2025-01-31', declaredMonthly: 202.5 } },
]

const PERIOD_START = '2024-01'
const PERIOD_END = '2026-06'

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

function firstPayrollMonth(madDate) {
  const [y, m, d] = madDate.split('-').map(Number)
  let month = m
  let year = y
  if (d > 1) {
    month += 1
    if (month > 12) { month = 1; year += 1 }
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

function maxMonth(a, b) { return a >= b ? a : b }
function minMonth(a, b) { return a <= b ? a : b }

function payrollRows() {
  const rows = []
  for (const v of fleet) {
    const assignments = []
    if (v.priorAssignment) {
      assignments.push({
        salarie: v.priorAssignment.salarie,
        start: maxMonth(PERIOD_START, firstPayrollMonth(v.priorAssignment.mad)),
        end: minMonth(PERIOD_END, v.priorAssignment.restitution.slice(0, 7)),
        monthly: v.priorAssignment.declaredMonthly,
      })
    }
    if (v.declaredMonthly !== null) {
      assignments.push({
        salarie: v.salarie,
        start: maxMonth(PERIOD_START, firstPayrollMonth(v.mad)),
        end: PERIOD_END,
        monthly: v.declaredMonthly,
      })
    }
    for (const a of assignments) {
      for (const month of monthsBetween(a.start, a.end)) {
        rows.push([month, a.salarie, v.id, a.monthly.toFixed(2), demoTarget.siret])
      }
    }
  }
  return rows.sort((r1, r2) => (r1[0] + r1[1]).localeCompare(r2[0] + r2[1]))
}

function fleetCsv() {
  const header = 'vehicule_id;immatriculation;modele;energie;mode;cout_achat_ttc;cout_global_annuel_location_ttc;date_premiere_immatriculation;date_mise_a_disposition;salarie;fonction;carburant_pris_en_charge;siret'
  const lines = fleet.map((v) => [
    v.id, v.immat, v.modele, v.energie, v.mode,
    v.mode === 'achat' ? v.cout : '',
    v.mode === 'location' ? v.coutAnnuel : '',
    v.premiereImmat ?? '',
    v.mad, v.salarie, v.fonction,
    v.carburant ? 'oui' : 'non',
    demoTarget.siret,
  ].join(';'))
  const prior = fleet.filter((v) => v.priorAssignment).map((v) =>
    `# Réattribution : ${v.id} précédemment affecté à ${v.priorAssignment.salarie} du ${v.priorAssignment.mad} au ${v.priorAssignment.restitution}`)
  return [header, ...lines, ...prior].join('\n')
}

function payrollCsv() {
  const header = 'mois;salarie;vehicule_id;anv_vehicule_declare_eur;siret'
  return [header, ...payrollRows().map((r) => r.join(';'))].join('\n')
}

function policyMd() {
  return `# Politique véhicules de fonction — Novatech Services SAS
SIRET : ${demoTarget.siret} — mise à jour : janvier 2024

1. L'avantage en nature véhicule est évalué selon la méthode du forfait annuel.
2. Les salariés exerçant une fonction commerciale bénéficient de la prise en
   charge du carburant pour leurs déplacements personnels.
3. Les véhicules sont attribués par avenant au contrat de travail précisant la
   date de mise à disposition.
4. La flotte est gérée par la direction administrative et financière ;
   le paramétrage de paie est assuré par le prestataire externe PAYCORP.
`
}

function avenant(salarie, vehiculeId, mad) {
  return `AVENANT AU CONTRAT DE TRAVAIL — ${salarie}
Société : Novatech Services SAS — SIRET ${demoTarget.siret}
Objet : mise à disposition d'un véhicule de fonction (${vehiculeId})
Date d'attribution : ${mad}
Le véhicule est mis à disposition pour un usage professionnel et personnel.
L'avantage en nature correspondant est soumis à cotisations conformément à la
réglementation en vigueur. Fait en deux exemplaires.
`
}

function contexteMd() {
  return `# Note de contexte cible — Projet Atlas
Cible : ${demoTarget.target} (SIREN ${demoTarget.siren}, SIRET siège ${demoTarget.siret})
Convention collective : ${demoTarget.convention}
Effectif : ${demoTarget.effectif} salariés
Paie externalisée : PAYCORP — DSN mensuelles par établissement
Période de due diligence : ${demoTarget.period}
Flotte : 12 véhicules de fonction (achat et LLD), gestion DAF.
`
}

export function demoDataRoom() {
  const docs = [
    { name: 'contexte_cible.md', mimeType: 'text/markdown', content: contexteMd() },
    { name: 'flotte_vehicules_2024_2026.csv', mimeType: 'text/csv', content: fleetCsv() },
    { name: 'journal_paie_anv_2024_2026.csv', mimeType: 'text/csv', content: payrollCsv() },
    { name: 'politique_vehicules.md', mimeType: 'text/markdown', content: policyMd() },
  ]
  for (const v of fleet) {
    if (!v.avenantManquant && v.declaredMonthly !== null) {
      docs.push({
        name: `avenant_${v.salarie.split(' ')[0].toLowerCase()}_${v.id}.txt`,
        mimeType: 'text/plain',
        content: avenant(v.salarie, v.id, v.mad),
      })
    }
    if (v.priorAssignment) {
      docs.push({
        name: `avenant_${v.priorAssignment.salarie.split(' ')[0].toLowerCase()}_${v.id}.txt`,
        mimeType: 'text/plain',
        content: avenant(v.priorAssignment.salarie, v.id, v.priorAssignment.mad),
      })
    }
    if (!v.carteGriseManquante && v.premiereImmat) {
      docs.push({
        name: `carte_grise_${v.id}.txt`,
        mimeType: 'text/plain',
        content: `CERTIFICAT D'IMMATRICULATION ${v.immat}\nVéhicule : ${v.modele} (${v.energie})\nDate de première immatriculation : ${v.premiereImmat}\nTitulaire : ${demoTarget.target} — SIRET ${demoTarget.siret}\n`,
      })
    }
    if (v.mode === 'location' && !v.contratLocationManquant) {
      docs.push({
        name: `contrat_lld_${v.id}.txt`,
        mimeType: 'text/plain',
        content: `CONTRAT DE LOCATION LONGUE DURÉE — ${v.id} (${v.modele})\nPreneur : ${demoTarget.target} — SIRET ${demoTarget.siret}\nCoût global annuel TTC (loyers, entretien, assurance) : ${v.coutAnnuel.toFixed(2)} EUR\nDate de mise à disposition prévue : ${v.mad}\n`,
      })
    }
  }
  return docs
}
