// Génère demo-data-room-variant/ : les MÊMES données que demo-data-room/ dans
// des formats entièrement différents (fichiers renommés, colonnes renommées et
// réordonnées, dates DD/MM/YYYY, montants « 28 000 » / « 202,50 », pièces
// libres reformulées). Sert de preuve que l'extraction lit les documents au
// lieu de reconnaître des formats canoniques. Régénérer les deux jeux ensemble
// après toute modification de server/anv/demo-data.mjs.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { demoDataRoom, demoTarget } from '../server/anv/demo-data.mjs'

const outDir = fileURLToPath(new URL('../demo-data-room-variant', import.meta.url))
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const frDate = (iso) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
const frAmount = (value) => Number(value).toFixed(2).replace('.', ',')
const spacedInt = (value) => Math.round(Number(value)).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')

const docs = demoDataRoom()
const byName = (name) => docs.find((doc) => doc.name === name)
const write = (name, content) => writeFileSync(join(outDir, name), content)

// ── Flotte → parc_auto.csv ───────────────────────────────────────────────────
{
  const source = byName('flotte_vehicules_2024_2026.csv').content.split('\n')
  const rows = source.filter((line) => line && !line.startsWith('#'))
  const comment = source.find((line) => line.startsWith('#')) ?? ''
  const header = rows[0].split(';')
  const idx = Object.fromEntries(header.map((cell, i) => [cell, i]))
  const out = ['collaborateur;poste;ref_vehicule;plaque;vehicule;motorisation;mode_detention;premiere_immat;date_attribution;prix_achat_ttc_eur;loyer_annuel_ttc_eur;carburant_employeur;siret_etablissement']
  for (const line of rows.slice(1)) {
    const cells = line.split(';')
    const get = (key) => cells[idx[key]] ?? ''
    out.push([
      get('salarie'), get('fonction'), get('vehicule_id'), get('immatriculation'), get('modele'),
      get('energie'),
      get('mode') === 'achat' ? 'Achat' : 'LLD',
      get('date_premiere_immatriculation') ? frDate(get('date_premiere_immatriculation')) : '',
      frDate(get('date_mise_a_disposition')),
      get('cout_achat_ttc') ? spacedInt(get('cout_achat_ttc')) : '',
      get('cout_global_annuel_location_ttc') ? spacedInt(get('cout_global_annuel_location_ttc')) : '',
      get('carburant_pris_en_charge') === 'oui' ? 'OUI' : 'NON',
      get('siret'),
    ].join(';'))
  }
  const match = comment.match(/(V-\d+) précédemment affecté à (.+) du (\S+) au (\S+)/)
  if (match) {
    out.push(`NB : le véhicule ${match[1]} était attribué à ${match[2]} du ${frDate(match[3])} au ${frDate(match[4])} avant sa réattribution au titulaire actuel.`)
  }
  write('parc_auto.csv', out.join('\n'))
}

// ── Paie → export_paie_anv.csv ──────────────────────────────────────────────
{
  const rows = byName('journal_paie_anv_2024_2026.csv').content.split('\n').filter(Boolean)
  const out = ['collaborateur;periode;ref_vehicule;montant_anv_eur;siret_etablissement']
  for (const line of rows.slice(1)) {
    const [mois, salarie, vehiculeId, montant, siret] = line.split(';')
    const [y, m] = mois.split('-')
    out.push([salarie, `${m}/${y}`, vehiculeId, frAmount(montant), siret].join(';'))
  }
  write('export_paie_anv.csv', out.join('\n'))
}

// ── Avenants → attribution_vehicule_*.txt ───────────────────────────────────
for (const doc of docs.filter((d) => d.name.startsWith('avenant_'))) {
  const salarie = doc.content.match(/— (.+)\n/)[1]
  const vid = doc.content.match(/\((V-\d+)\)/)[1]
  const date = doc.content.match(/Date d'attribution : (\S+)/)[1]
  const last = doc.name.split('_')[1]
  write(`attribution_vehicule_${last}_${vid}.txt`,
    `NOTE D'ATTRIBUTION - VEHICULE DE FONCTION\n`
    + `Collaborateur concerné : ${salarie}\n`
    + `Employeur : ${demoTarget.target} (SIRET ${demoTarget.siret})\n`
    + `Véhicule attribué : référence parc ${vid}\n`
    + `Prise d'effet de la mise à disposition : le ${frDate(date)}\n`
    + `L'avantage en nature correspondant sera soumis à cotisations sociales\n`
    + `conformément à la réglementation applicable.\n`)
}

// ── Cartes grises → certificat_immat_*.txt ──────────────────────────────────
for (const doc of docs.filter((d) => d.name.startsWith('carte_grise_'))) {
  const immat = doc.content.match(/IMMATRICULATION (\S+)/)[1]
  const [, modele, energie] = doc.content.match(/Véhicule : (.+) \((\w+)\)/)
  const date = doc.content.match(/première immatriculation : (\S+)/)[1]
  const vid = doc.name.replace('carte_grise_', '').replace('.txt', '')
  write(`certificat_immat_${vid}.txt`,
    `CERTIFICAT D'IMMATRICULATION (extrait)\n`
    + `(A) Numéro d'immatriculation : ${immat}\n`
    + `(B) Date de première immatriculation : ${frDate(date)}\n`
    + `(D.2) Marque et modèle : ${modele}\n`
    + `(P.3) Source d'énergie : ${energie === 'electrique' ? 'ELECTRIQUE' : 'ESSENCE'}\n`
    + `(C.1) Titulaire : ${demoTarget.target.toUpperCase()} - SIRET ${demoTarget.siret}\n`)
}

// ── Contrats LLD → contrat_leasing_*.txt ────────────────────────────────────
for (const doc of docs.filter((d) => d.name.startsWith('contrat_lld_'))) {
  const [, vid, modele] = doc.content.match(/— (V-\d+) \((.+)\)/)
  const cost = doc.content.match(/assurance\) : ([\d.]+)/)[1]
  const date = doc.content.match(/prévue : (\S+)/)[1]
  write(`contrat_leasing_${vid}.txt`,
    `CONTRAT DE LOCATION LONGUE DUREE N° LLD-${vid}\n`
    + `Preneur : ${demoTarget.target} (SIRET ${demoTarget.siret})\n`
    + `Véhicule loué : ${modele} — référence parc ${vid}\n`
    + `Loyer annuel TTC, maintenance et assurance incluses : ${frAmount(cost)} EUR\n`
    + `Mise à disposition prévue le ${frDate(date)}\n`)
}

// ── Politique → car_policy.md ────────────────────────────────────────────────
write('car_policy.md',
  `# Car policy - ${demoTarget.target}\n`
  + `Direction administrative et financière (SIRET ${demoTarget.siret}), révision janvier 2024\n\n`
  + `La valorisation de l'avantage en nature des véhicules de fonction retient la\n`
  + `méthode de l'évaluation forfaitaire annuelle.\n\n`
  + `La population commerciale bénéficie de la prise en charge par l'employeur du\n`
  + `carburant, y compris pour l'usage privé du véhicule.\n\n`
  + `Toute attribution de véhicule fait l'objet d'un écrit (note d'attribution\n`
  + `annexée au contrat de travail) mentionnant la date de prise d'effet.\n\n`
  + `La paie est externalisée auprès d'un prestataire.\n`)

// ── Contexte → note_contexte.md ──────────────────────────────────────────────
write('note_contexte.md',
  `# Projet Atlas - fiche cible\n`
  + `Société visée : ${demoTarget.target}, SIREN ${demoTarget.siren} (siège : SIRET ${demoTarget.siret})\n`
  + `CCN : Bureaux d'études techniques (Syntec, IDCC 1486)\n`
  + `${demoTarget.effectif} collaborateurs. Paie externalisée.\n`
  + `Revue demandée : avantages en nature véhicules, ${demoTarget.period}.\n`
  + `Parc : 12 véhicules de fonction (mixte achat / LLD).\n`)

console.log(`Variante écrite dans ${outDir}`)
