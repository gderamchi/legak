import type { FormEvent, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type RequestItem = { id: string; label: string; why: string; status: string }

type AppDocument = {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  fingerprint: string
  receivedAt: string
  theme: string
  preview: string | null
}

type IntakeItem = {
  docId: string
  name: string
  kind: string
  theme: string
  forceProbante: string
  note: string
  status: string
}

type ControlItem = {
  id: string
  kind: string
  title: string
  legalBasis: string
  expects: string
  status: string
  details: string[]
}

type Exposure = { low: number; high: number } | null

type Finding = {
  id: string
  severity: 'critique' | 'élevé' | 'moyen' | 'faible'
  title: string
  controlId: string
  sources: string[]
  facts: string
  rule: string
  period: string
  population: string[]
  assietteEludee: number
  assietteConditionnelle: number
  exposure: Exposure
  conditionalExposure: Exposure
  probability: string
  dealImpact: string
  recoPreClosing: string
  recoSpa: string
  postClosing: string
  confidence: string
  contradiction: { verdict: string; note: string } | null
}

type QaItem = {
  id: string
  question: string
  piece: string
  urgency: string
  status: string
  impactSiNonFourni: string
}

type VehicleAnalysis = {
  vehicleId: string
  modele: string
  salarie: string
  bareme: string
  statut: string
  declaredTotal: number
  expectedTotal: number
  assietteDelta: number
  conditionalDelta: number
}

type AuditEvent = { at: string; event: string; note?: string; [key: string]: unknown }

type ProofEvent = {
  seq: number
  at: string
  phase: string
  actor: string
  action: string
  rationale: string
  refs: string[]
  status: string
  meta?: Record<string, unknown>
}

type VdrEvidence = {
  seq: number
  at: string
  action: string
  caption: string
  url: string
  screenshot: string
}

type IntakeEvent = {
  seq: number
  at: string
  docId: string
  name: string
  kind: string
  theme: string
  forceProbante: string
  siretOk: boolean
  note: string
}

type IntakeProgress = {
  running: boolean
  total: number
  events: IntakeEvent[]
  error: string | null
  completed: boolean
  proofTrail?: ProofEvent[]
}

type AnalysisProgress = {
  running: boolean
  phase: string | null
  events: ProofEvent[]
  error: string | null
  completed: boolean
}

type Report = {
  title: string
  executiveSummary: string
  contradictionMode: string
  redactionMode: string
  missionScope: { limites: string[]; documentsRevus: string[] }
  postClosingPlan: { horizon: string; action: string; risque: string; responsable: string }[]
  spaRecommendations: { clauses: { risque: string; titre: string; clause: string }[] }
}

/* Cadrage de la cible fictive renvoyé par /api/demo-cadrage : sert au
   préremplissage explicite du formulaire pour dérouler la démo sans saisie. */
type DemoCadrage = {
  target: string
  siren: string
  siret: string
  convention: string
  effectif: number
  periodStart: string
  periodEnd: string
}

type Mission = {
  id: string
  target: string
  siren: string | null
  siret: string | null
  convention: string | null
  effectif: number | null
  period: string
  periodStart: string
  periodEnd: string
  thematique: string
  status: string
  requestList: RequestItem[]
  documents: AppDocument[]
  intake: { qualified: IntakeItem[]; mode: string } | null
  controls: ControlItem[]
  findings: Finding[]
  qaTracker: QaItem[]
  vehicleAnalyses: VehicleAnalysis[]
  totals: {
    assietteEludee: number
    assietteConditionnelle: number
    exposure: { low: number; high: number }
    exposureConditional: { low: number; high: number } | null
  } | null
  riskScore: { score: number; critiques: number; eleves: number; closingBlocker: boolean; note: string } | null
  report: Report | null
  vdrEvidence: VdrEvidence[]
  auditLog: AuditEvent[]
  proofTrail: ProofEvent[]
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787'

/* État de la vue en direct de l'agent computer use (polling /vdr-live). */
type VdrLiveStatus = {
  running: boolean
  kind: 'collecte' | 'qa' | null
  phase?: string | null
  lastAction?: string | null
  lastIntent?: string | null
  decidedBy?: string | null
  actions?: number
  modelTurns?: number
  fallbacks?: string[]
  hasFrame?: boolean
}

const themeLabels: Record<string, string> = {
  contexte: 'Contexte',
  flotte: 'Flotte',
  paie: 'Paie',
  politique: 'Politiques',
  'preuves-attribution': 'Avenants',
  'preuves-vehicule': 'Preuves véhicule',
  'a-classer': 'À qualifier',
}

const severityClass: Record<Finding['severity'], string> = {
  critique: 'sev-critique',
  'élevé': 'sev-eleve',
  moyen: 'sev-moyen',
  faible: 'sev-faible',
}

/* Libellés français des états machine (le moteur garde ses slugs). */
const missionStatusLabels: Record<string, string> = {
  cadrage: 'Cadrée',
  'pieces-recues': 'Pièces reçues',
  'pieces-qualifiees': 'Pièces qualifiées',
  'rapport-pret': 'Rapport prêt',
}

const auditEventLabels: Record<string, string> = {
  'mission.cadrage': 'Mission cadrée',
  'collecte.reception': 'Pièces reçues',
  'intake.classement': 'Pièces triées et qualifiées',
  'vdr.collecte': 'Collecte dans le VDR par l’agent',
  'vdr.qa_depot': 'Request list déposée au Q&A du VDR',
  'vdr.erreur': 'Incident agent VDR',
  'analyse.extraction': 'Données extraites et normalisées',
  'analyse.controles': 'Contrôles exécutés',
  'analyse.contradiction': 'Conclusions contredites',
  'analyse.rejetee': 'Analyse rejetée',
  'rapport.genere': 'Rapport généré',
}

const proofPhaseLabels: Record<string, string> = {
  cadrage: 'Cadrage',
  collecte: 'Collecte',
  intake: 'Tri',
  extraction: 'Extraction',
  controle: 'Contrôles',
  contradiction: 'Contradiction',
  rapport: 'Rapport',
  vdr: 'Agent VDR',
}

const proofActorLabels: Record<string, string> = {
  systeme: 'Système',
  gemini: 'Gemini',
  moteur: 'Moteur',
  operateur: 'Opérateur VDR',
}

const baremeLabels: Record<string, string> = {
  'bareme-2002': 'Arrêté du 10/12/2002',
  'bareme-2025': 'Arrêté du 25/02/2025',
}

function eur(value: number) {
  // U+00A0 plutôt que la fine U+202F : la fine est quasi invisible hors Plex Mono.
  return `${Math.round(value).toLocaleString('fr-FR').replace(/[\u202f\s]/g, '\u00a0')}\u00a0€`
}

function eurRange(range: { low: number; high: number }) {
  return `${eur(range.low)}\u00a0–\u00a0${eur(range.high)}`
}

/* Micro-typographie française sur les textes venus du moteur :
   apostrophes courbes, « EUR » → €, plages en demi-cadratin, jargon retiré. */
function fr(text: string) {
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  return (
    text
      .replace(/ \(time-travel\)/g, '')
      .replace(/(\p{L})'/gu, '$1’')
      .replace(/(\d(?:[\d\u00a0\u202f\s.,]*\d)?)\s?EUR\b/g, (_, n: string) => `${n.replace(/[\u202f\s]/g, '\u00a0')}\u00a0€`)
      .replace(/(\d)\s?%/g, '$1\u00a0%')
      .replace(/(\d)-(\d+\u00a0%)/g, '$1–$2')
      .replace(/\b1er\b/g, '1ᵉʳ')
      // U+2060 (word joiner) : U+2011 reste sécable dans Chromium.
      .replace(/\bV-(\d)/g, 'V\u2060-\u2060$1')
      // Dates numériques du moteur en toutes lettres, comme les titres.
      .replace(/(\d{2})\/(\d{2})\/(\d{4})/g, (m, d: string, mo: string, y: string) => {
        const month = months[Number(mo) - 1]
        if (!month) return m
        const day = Number(d)
        return `${day === 1 ? '1ᵉʳ' : day}\u00a0${month}\u00a0${y}`
      })
  )
}

function hhmmss(at: string) {
  // Heure locale, pas l'heure UTC de l'ISO brut.
  return new Date(at).toLocaleTimeString('fr-FR', { hour12: false })
}

const monthShort = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/* « 2024-01 → 2026-06 » devient « janv. 2024 → juin 2026 ». */
function frPeriod(period: string) {
  return period.replace(/(\d{4})-(\d{2})/g, (m, y: string, mo: string) => {
    const label = monthShort[Number(mo) - 1]
    return label ? `${label}\u00a0${y}` : m
  })
}

/* Libellés d'affichage des statuts de familles de pièces (accord au pluriel). */
function requestStatusLabel(status: string, count: number) {
  const map: Record<string, [string, string]> = {
    'reçue': ['reçue', 'reçues'],
    partiel: ['partielle', 'partielles'],
    manquante: ['manquante', 'manquantes'],
    'à demander': ['attendue', 'attendues'],
  }
  const forms = map[status]
  if (!forms) return status
  return count > 1 ? forms[1] : forms[0]
}

function tagClass(status: string) {
  if (['conforme', 'reçue', 'déposée au VDR'].includes(status)) return 'tag is-ok'
  if (['non conforme', 'manquante'].includes(status)) return 'tag is-bad'
  if (['partiel', 'incomplet', 'à confirmer', 'à demander', 'haute'].includes(status)) return 'tag is-warn'
  if (['conformité non démontrable', 'indéterminé', 'non démontré faute de pièce', 'moyenne'].includes(status))
    return 'tag is-open'
  return 'tag'
}

function forceClass(force: string) {
  const map: Record<string, string> = {
    probante: 'force-probante',
    'déclarative': 'force-declarative',
    informative: 'force-informative',
    'à qualifier': 'force-a-qualifier',
  }
  return map[force] ?? ''
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <svg viewBox="0 0 40 40" role="img">
        <path d="M5 7h19l11 11v15H5z" fill="var(--ink)" />
        <path d="M24 7v11h11" fill="none" stroke="var(--mint)" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M12 25h12M12 18h7" fill="none" stroke="var(--paper)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M27 27l3 3 5-7" fill="none" stroke="var(--mint)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function Header({ path }: { path: string }) {
  return (
    <header className="site-nav">
      <a className="brand" href="/" aria-label="Legak — accueil">
        <Logo />
        <span>legak</span>
      </a>
      <nav aria-label="Navigation principale">
        <a href="/#produit">Produit</a>
        <a href="/#methode">Méthode</a>
        <a href="/pricing" data-keep aria-current={path === '/pricing' ? 'page' : undefined}>
          Tarifs
        </a>
      </nav>
      <a className="btn btn-primary" href="/app">
        Ouvrir le produit
      </a>
    </header>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="band-inner">
        <a className="brand" href="/" aria-label="Legak — accueil">
          <Logo />
          <span>legak</span>
        </a>
        <nav aria-label="Navigation pied de page">
          <a href="/#produit">Produit</a>
          <a href="/#methode">Méthode</a>
          <a href="/pricing">Tarifs</a>
          <a href="mailto:team@legak.ai">team@legak.ai</a>
        </nav>
        <span>Due diligence sociale M&A — verticale ANV véhicules</span>
      </div>
    </footer>
  )
}

/* Contenu réel du produit : familles de pièces consommées et contrôles exécutés. */
const heroFiles = [
  { folio: '01', name: 'Avenants d’attribution', role: 'preuve' },
  { folio: '02', name: 'Cartes grises, contrats LLD', role: 'preuve' },
  { folio: '03', name: 'Journal de paie ANV', role: 'calcul' },
  { folio: '04', name: 'Listing flotte', role: 'déclaratif' },
]

const heroControls = [
  ['ANV-CAL-001', 'barème daté à l’attribution'],
  ['ANV-COH-001', 'cohérence flotte ↔ paie'],
  ['ANV-PRE-001', 'force probante des avenants'],
]

const workflowSteps = [
  'Cadrer la mission et lister les pièces attendues',
  'Collecter, trier et qualifier la data room',
  'Extraire les données (modèle) et les normaliser (code)',
  'Exécuter les contrôles datés, règle par règle',
  'Contredire les conclusions (contrôle croisé)',
  'Livrer le package décisionnel M&A',
]

const verticals = [
  { folio: 'V1', name: 'Avantages en nature véhicules', detail: 'Barèmes 2002 et 2025, abattement électrique', status: 'couverte' },
  { folio: 'V2', name: 'Protection sociale complémentaire', detail: 'Contrats frais de santé et prévoyance', status: 'ensuite' },
  { folio: 'V3', name: 'Frais professionnels', detail: 'Indemnités, barèmes kilométriques', status: 'ensuite' },
  { folio: 'V4', name: 'Réduction générale de cotisations', detail: 'Paramètres et coefficients', status: 'ensuite' },
]

function HomePage() {
  return (
    <main id="main" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Due diligence sociale M&A — buy-side</p>
          <h1 id="hero-title">
            Une data room sociale entre. Un risk register chiffré sort. <em>L’avocat signe.</em>
          </h1>
          <p className="hero-lede">
            Legak instruit la thématique des avantages en nature véhicules comme
            le ferait l’avocat M&A social de l’acquéreur : il réclame les pièces,
            trie la data room, exécute des contrôles URSSAF datés véhicule par
            véhicule, fait contredire ses conclusions — puis livre un red flag
            report défendable.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="/app">
              Lancer un audit sur vos pièces
            </a>
            <a className="btn btn-ghost" href="/pricing">
              Voir les tarifs
            </a>
          </div>
          <ul className="hero-proof">
            <li>Barèmes versionnés dans le temps</li>
            <li>Statuts probatoires nuancés</li>
            <li>Aucune conclusion sans pièce</li>
          </ul>
        </div>

        <div className="dossier" aria-label="Le dossier que l’agent instruit" role="img">
          <span className="dossier-stamp" aria-hidden="true">
            Aucune conclusion sans pièce
          </span>
          <div className="dossier-folder">
            <span className="dossier-tab">
              Dossier <strong>ANV véhicules</strong>
            </span>
            <div className="dossier-body">
              <ul className="dossier-files">
                {heroFiles.map((file) => (
                  <li key={file.folio} data-role={file.role === 'preuve' ? 'preuve' : undefined}>
                    <span className="folio">{file.folio}</span>
                    <strong>{file.name}</strong>
                    <small>{file.role}</small>
                  </li>
                ))}
              </ul>
              <div className="dossier-agent">
                <span className="dossier-agent-label">L’agent instruit</span>
                {heroControls.map(([ref, label]) => (
                  <small key={ref}>
                    <b>{ref}</b> {label}
                  </small>
                ))}
                <p className="dossier-baremes">
                  Barèmes encodés : arrêté du 10 décembre 2002, arrêté du
                  25 février 2025.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="produit" className="band" aria-labelledby="produit-title">
        <div className="band-inner">
          <p className="eyebrow">Le produit</p>
          <h2 id="produit-title">Construit comme un audit d’avocat, pas comme un chat.</h2>
          <p className="band-lede">
            Le modèle lit, classe et contredit. Le code possède les barèmes
            datés, les calculs, les statuts probatoires et le verdict final.
            L’expert arbitre et signe.
          </p>
          <div className="pillars">
            <article>
              <span className="folio">01</span>
              <h3>Moteur de règles versionné</h3>
              <p>
                Ancien barème contre arrêté du 25 février 2025 : le bon taux à
                la bonne date d’attribution, réattributions comprises.
              </p>
            </article>
            <article>
              <span className="folio">02</span>
              <h3>Moteur de preuve</h3>
              <p>
                Chaque conclusion est rattachée à ses pièces sources.
                L’absence de preuve n’est jamais la preuve de conformité.
              </p>
            </article>
            <article>
              <span className="folio">03</span>
              <h3>Package décisionnel</h3>
              <p>
                Registre des risques scoré, fiches risque chiffrées, clauses
                SPA, suivi Q&A et plan post-closing 30/60/90.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="methode" className="band night" aria-labelledby="methode-title">
        <div className="band-inner">
          <div className="method-head">
            <div>
              <p className="eyebrow">La méthode</p>
              <h2 id="methode-title">Six étapes, exécutées par des agents supervisés.</h2>
            </div>
            <a className="btn btn-primary" href="/app">
              Dérouler sur un dossier
            </a>
          </div>
          <div className="method-grid">
            <ol className="method-steps">
              {workflowSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <aside className="method-aside">
              <h3>Ce que contient chaque fiche risque</h3>
              <p>
                Faits constatés et pièces sources, règle applicable avec sa
                version datée, population concernée, assiette éludée recalculée
                mois par mois, exposition ferme et conditionnelle, impact deal,
                recommandation pré-closing, clause SPA, action post-closing,
                verdict du contradicteur.
              </p>
              <div className="method-guarantee">
                <span>Garde-fou</span>
                <strong>
                  Les montants sont calculés par le moteur déterministe — jamais
                  par le modèle.
                </strong>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="band teaser" aria-labelledby="teaser-title">
        <div className="band-inner teaser-grid">
          <div className="teaser-copy">
            <p className="eyebrow">La suite</p>
            <h2 id="teaser-title">Une verticale d’abord, à fond.</h2>
            <p className="band-lede">
              Le même moteur — collecte ciblée, règles datées, statuts
              probatoires, contradiction — s’applique verticale après
              verticale.
            </p>
            <a className="btn btn-primary" href="/pricing">
              Voir les tarifs
            </a>
          </div>
          <ul className="teaser-verticals">
            {verticals.map((v) => (
              <li key={v.folio}>
                <span className="folio">{v.folio}</span>
                <div>
                  <strong>{v.name}</strong>
                  <small>{v.detail}</small>
                </div>
                <span className={v.status === 'couverte' ? 'tag is-ok' : 'tag'}>{v.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  )
}

function PricingPage() {
  const plans = [
    {
      name: 'Une thématique',
      price: '2 500 €',
      per: 'par cible',
      description: 'Une verticale (ANV véhicules) sur une cible, rapport red flag signable.',
      cta: 'Auditer un dossier',
      features: ['Liste de pièces ciblée', 'Contrôles datés', 'Fiches risque chiffrées', 'Suivi Q&A'],
    },
    {
      name: 'Deal complet',
      price: '4 000 €',
      per: 'par deal',
      description: 'Pour les fonds et cabinets qui négocient sur la base du rapport.',
      cta: 'Préparer un deal',
      features: ['Registre des risques scoré', 'Recommandations SPA', 'Plan post-closing 30/60/90', 'Restitution en visio'],
    },
    {
      name: 'Plateforme',
      price: 'Sur mesure',
      per: '',
      description: 'Acquéreurs récurrents, Transaction Services, assureurs W&I.',
      cta: 'Devenir design partner',
      features: ['Multi-thématiques', 'Traçabilité opposable', 'File de revue expert', 'Référentiels de règles dédiés'],
    },
  ]
  return (
    <main id="main" tabIndex={-1}>
      <section className="pricing-hero">
        <p className="eyebrow">Tarifs</p>
        <h1>Payer le livrable de décision, pas le temps passé.</h1>
        <p>
          Une revue manuelle se compte typiquement en semaines et en milliers
          d’euros. Ici : un package décisionnel chiffré en heures, que
          l’avocat signataire relit au lieu de le fabriquer.
        </p>
      </section>

      <section className="plan-grid" aria-label="Offres Legak">
        {plans.map((plan, index) => (
          <article className={index === 1 ? 'plan is-featured' : 'plan'} key={plan.name}>
            {index === 1 && <span className="plan-flag">Recommandé</span>}
            <h2 className="plan-name">{plan.name}</h2>
            <p className="plan-price">
              {plan.price}
              {plan.per && <small> {plan.per}</small>}
            </p>
            <p className="plan-desc">{plan.description}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <a className={index === 1 ? 'btn btn-primary' : 'btn btn-ghost'} href="mailto:team@legak.ai">
              {plan.cta}
            </a>
          </article>
        ))}
      </section>

      <section className="pricing-notes" aria-label="Périmètre des offres">
        <article>
          <h2>Ce qui est inclus</h2>
          <p>
            Collecte ciblée, pré-qualification probatoire, contrôles URSSAF
            datés, chiffrage de l’exposition, recommandations SPA et plan
            post-closing.
          </p>
        </article>
        <article>
          <h2>Ce qui reste humain</h2>
          <p>
            Le jugement juridique, l’arbitrage des points sensibles et la
            signature. Legak prépare le dossier ; l’avocat garde la
            responsabilité.
          </p>
        </article>
      </section>
    </main>
  )
}

/* ── Produit /app ─────────────────────────────────────────────────────────── */

const steps = [
  { id: 'cadrage', label: 'Cadrage', hint: 'Périmètre et pièces attendues' },
  { id: 'collecte', label: 'Collecte', hint: 'Data room triée et qualifiée' },
  { id: 'analyse', label: 'Analyse', hint: 'Contrôles datés et contradiction' },
  { id: 'rapport', label: 'Rapport', hint: 'Package décisionnel signable' },
] as const

type StepId = (typeof steps)[number]['id']

const auditPhases = [
  { id: 'extraction', title: 'Extraction des données structurées', detail: 'Le modèle identifie le rôle de chaque colonne ; le code parse toutes les lignes.' },
  { id: 'controle', title: 'Contrôles datés règle par règle', detail: 'Huit contrôles élémentaires ; barème daté à l’attribution de chaque véhicule.' },
  { id: 'contradiction', title: 'Contradiction croisée', detail: 'Un second agent challenge chaque conclusion ; les chiffres restent ceux du moteur.' },
  { id: 'rapport', title: 'Assemblage du package décisionnel', detail: 'Executive summary, risk register, clauses SPA, plan post-closing.' },
]

type Notice = { text: string; ctaLabel?: string; ctaStep?: StepId } | null

function ProductApp() {
  const [mission, setMission] = useState<Mission | null>(null)
  const [activeTab, setActiveTab] = useState<StepId>('cadrage')
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [sourceDoc, setSourceDoc] = useState<{ name: string; content: string } | null>(null)
  const [evidenceView, setEvidenceView] = useState<VdrEvidence | null>(null)
  const [intakeLive, setIntakeLive] = useState<{ running: boolean; events: IntakeEvent[]; proofTrail?: ProofEvent[] } | null>(null)
  const [analysisLive, setAnalysisLive] = useState<{ running: boolean; phase: string | null; events: ProofEvent[] } | null>(null)
  const [vdrLive, setVdrLive] = useState<{ streamKey: number; status: VdrLiveStatus } | null>(null)
  const [vdrLiveFrameUrl, setVdrLiveFrameUrl] = useState<string | null>(null)
  const [demoPrefill, setDemoPrefill] = useState<DemoCadrage | null>(null)
  const [expandedControls, setExpandedControls] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const aliveRef = useRef(true)
  const busyRef = useRef(false)
  const lastActionRef = useRef<{ label: string; action: () => Promise<void> } | null>(null)
  const alertRef = useRef<HTMLDivElement | null>(null)
  const [busySeconds, setBusySeconds] = useState(0)

  useEffect(() => {
    if (!busy) {
      setBusySeconds(0)
      return
    }
    const started = Date.now()
    const timer = window.setInterval(() => setBusySeconds(Math.round((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [busy])

  // L'alerte d'erreur peut apparaître hors viewport (actions en bas de page).
  useEffect(() => {
    if (error) alertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [error])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // Restauration de la dernière mission après un rechargement de page.
  useEffect(() => {
    const lastId = window.localStorage.getItem('legak:lastMission')
    if (!lastId) return
    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/missions/${lastId}`)
        if (!response.ok) throw new Error('mission introuvable')
        const restored = (await response.json()) as Mission
        if (!aliveRef.current) return
        setMission(restored)
        setActiveTab(restored.report ? 'rapport' : restored.documents.length ? 'collecte' : 'cadrage')
      } catch {
        window.localStorage.removeItem('legak:lastMission')
      }
    })()
  }, [])

  useEffect(() => {
    if (mission) window.localStorage.setItem('legak:lastMission', mission.id)
  }, [mission])

  // Vue en direct : polling de la dernière frame JPEG (~450 ms). Le MJPEG
  // multipart ne fonctionne pas dans Safari via <img src> — ce polling marche
  // partout et donne le même effet « vidéo live ».
  const vdrLiveActive = vdrLive !== null
  const missionIdForLive = mission?.id
  useEffect(() => {
    if (!vdrLiveActive || !missionIdForLive) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`${API_BASE}/api/missions/${missionIdForLive}/vdr-live`)
          if (!response.ok) return
          const status = (await response.json()) as VdrLiveStatus
          if (!cancelled) setVdrLive((prev) => (prev ? { ...prev, status } : prev))
        } catch {
          /* serveur occupé par la boucle agent : on garde le dernier état */
        }
      })()
    }, 900)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [vdrLiveActive, missionIdForLive])

  // Pendant la collecte VDR, le trail de preuve se remplit côté serveur.
  useEffect(() => {
    if (!vdrLiveActive || !missionIdForLive) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`${API_BASE}/api/missions/${missionIdForLive}`)
          if (!response.ok || cancelled) return
          const next = (await response.json()) as Mission
          if (!cancelled) setMission((prev) => (prev?.id === next.id ? { ...prev, proofTrail: next.proofTrail ?? [] } : prev))
        } catch {
          /* serveur occupé */
        }
      })()
    }, 1100)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [vdrLiveActive, missionIdForLive])

  useEffect(() => {
    if (!vdrLiveActive || !missionIdForLive) {
      setVdrLiveFrameUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    let cancelled = false
    const pullFrame = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/missions/${missionIdForLive}/vdr-live/frame?t=${Date.now()}`,
        )
        if (response.status === 204 || !response.ok) return
        const blob = await response.blob()
        if (cancelled || !blob.size) return
        const url = URL.createObjectURL(blob)
        setVdrLiveFrameUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch {
        /* pas encore de frame : le navigateur de l'agent démarre */
      }
    }
    void pullFrame()
    const timer = window.setInterval(() => void pullFrame(), 450)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      setVdrLiveFrameUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [vdrLiveActive, missionIdForLive])

  const selectedFinding = useMemo(
    () => mission?.findings.find((f) => f.id === selectedFindingId) ?? mission?.findings[0],
    [mission, selectedFindingId],
  )

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
      ...options,
    })
    const raw = await response.text()
    if (!response.ok) {
      let message = raw
      try {
        message = (JSON.parse(raw) as { error?: string }).error ?? raw
      } catch {
        /* le corps n'était pas du JSON : on garde le texte brut */
      }
      throw new Error(message || `Erreur ${response.status}`)
    }
    return JSON.parse(raw) as T
  }

  async function run(label: string, action: () => Promise<void>) {
    if (busyRef.current) return // single-flight : une opération à la fois
    busyRef.current = true
    lastActionRef.current = { label, action }
    setBusy(true)
    setBusyLabel(label)
    setError('')
    setNotice(null)
    try {
      await action()
    } catch (caught) {
      if (aliveRef.current) {
        const message = caught instanceof Error ? caught.message : 'Erreur inattendue'
        setError(/failed to fetch|networkerror|load failed/i.test(message)
          ? 'API injoignable — vérifiez que le serveur est lancé (npm run api).'
          : message)
      }
    } finally {
      busyRef.current = false
      if (aliveRef.current) {
        setBusy(false)
        setBusyLabel('')
      }
    }
  }

  function retryLastAction() {
    const last = lastActionRef.current
    if (last) void run(last.label, last.action)
  }

  function collectSummary(m: Mission) {
    const counts = { reçue: 0, partiel: 0, manquante: 0, 'à demander': 0 } as Record<string, number>
    for (const item of m.requestList) counts[item.status] = (counts[item.status] ?? 0) + 1
    return counts
  }

  function createMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = JSON.stringify({
      target: form.get('target'),
      siren: form.get('siren') || null,
      siret: form.get('siret') || null,
      periodStart: form.get('periodStart'),
      periodEnd: form.get('periodEnd'),
      convention: form.get('convention') || null,
      effectif: form.get('effectif') ? Number(form.get('effectif')) : null,
    })
    if (mission) {
      // Recadrage en place : les pièces reçues et le tri sont conservés.
      void run('Mise à jour du cadrage…', async () => {
        const hadReport = Boolean(mission.report)
        const next = await api<Mission>(`/api/missions/${mission.id}`, { method: 'PATCH', body: payload })
        setMission(next)
        setNotice({
          text: hadReport && !next.report
            ? 'Cadrage mis à jour — pièces conservées ; la période a changé, l’analyse est invalidée : relancez l’audit.'
            : 'Cadrage mis à jour — pièces et analyse conservées.',
          ...(hadReport && !next.report ? { ctaLabel: 'Relancer l’audit', ctaStep: 'analyse' as StepId } : {}),
        })
      })
      return
    }
    void run('Cadrage de la mission — génération de la liste de pièces…', async () => {
      const next = await api<Mission>('/api/missions', { method: 'POST', body: payload })
      setIntakeLive(null)
      setMission(next)
      setActiveTab('collecte')
      setNotice({
        text: `Mission ouverte sur ${next.target} — ${next.requestList.length} familles de pièces attendues.`,
      })
    })
  }

  function prefillDemoCadrage() {
    void run('Chargement du cadrage de démonstration…', async () => {
      const cadrage = await api<DemoCadrage>('/api/demo-cadrage')
      setDemoPrefill(cadrage)
      setNotice({
        text: `Formulaire prérempli avec la cible fictive ${cadrage.target} — vérifiez les champs puis ouvrez la mission.`,
      })
    })
  }

  function loadDemoDataRoom() {
    if (!mission) return
    if (mission.documents.length && !window.confirm(`Le jeu de démonstration remplacera les ${mission.documents.length} pièce(s) déjà reçues. Continuer ?`)) return
    void run('Réception de la data room de démonstration…', async () => {
      const next = await api<Mission>(`/api/missions/${mission.id}/demo-documents`, { method: 'POST', body: '{}' })
      setIntakeLive(null)
      setMission(next)
      setNotice({
        text: `${next.documents.length} pièces reçues en boîte de réception — lancez le tri pour les qualifier.`,
      })
    })
  }

  function collectFromVdr() {
    if (!mission) return
    if (mission.documents.length && !window.confirm(`La collecte VDR remplacera les ${mission.documents.length} pièce(s) déjà reçues. Continuer ?`)) return
    void run(
      'Gemini Computer Use opère le portail VDR — chaque action est décidée par le modèle, écran par écran, en direct ci-dessous…',
      async () => {
        setVdrLive({ streamKey: Date.now(), status: { running: true, kind: 'collecte' } })
        try {
          const next = await api<Mission>(`/api/missions/${mission.id}/vdr-collect`, { method: 'POST', body: '{}' })
          setIntakeLive(null)
          setMission(next)
          setNotice({
            text: `Collecte VDR terminée — ${next.documents.length} pièces lues en place, ${next.vdrEvidence.length} captures de preuve horodatées.`,
          })
        } finally {
          setVdrLive(null)
        }
      },
    )
  }

  function postQaToVdr() {
    if (!mission) return
    void run('Gemini Computer Use dépose la request list dans le module Q&A du vendeur — formulaire rempli à l’écran, en direct ci-dessous…', async () => {
      setVdrLive({ streamKey: Date.now(), status: { running: true, kind: 'qa' } })
      try {
        const next = await api<Mission>(`/api/missions/${mission.id}/vdr-post-qa`, { method: 'POST', body: '{}' })
        setMission(next)
        const posted = next.qaTracker.filter((qa) => qa.status === 'déposée au VDR').length
        setNotice({ text: `${posted} demande(s) déposée(s) dans le module Q&A du VDR, preuve d’écran à l’appui.` })
      } finally {
        setVdrLive(null)
      }
    })
  }

  function uploadFiles(fileList: FileList | null) {
    if (!mission || !fileList?.length) return
    void run(`Réception de ${fileList.length} pièce(s) — archivage et empreinte SHA-256…`, async () => {
      const documents = await Promise.all(Array.from(fileList).map(readUpload))
      const next = await api<Mission>(`/api/missions/${mission.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({ documents }),
      })
      setIntakeLive(null)
      setMission(next)
    })
  }

  function runIntake() {
    if (!mission) return
    void run('L’agent trie et qualifie les pièces dans son atelier…', async () => {
      try {
        await api(`/api/missions/${mission.id}/intake`, { method: 'POST', body: '{}' })
        setIntakeLive({ running: true, events: [] })
        // Polling borné (~4 min) : au-delà, le tri est considéré en échec.
        let completed = false
        for (let attempt = 0; attempt < 600; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 400))
          if (!aliveRef.current) return
          const progress = await api<IntakeProgress>(`/api/missions/${mission.id}/intake-progress`)
          if (!aliveRef.current) return
          setIntakeLive({
            running: progress.running,
            events: progress.events,
            proofTrail: progress.proofTrail,
          })
          if (progress.proofTrail?.length) {
            setMission((prev) => (prev ? { ...prev, proofTrail: progress.proofTrail! } : prev))
          }
          if (progress.error) throw new Error(progress.error)
          if (!progress.running) {
            completed = true
            break
          }
        }
        if (!completed) throw new Error('Le tri ne s’est pas terminé dans le temps imparti : rechargez la page et relancez.')
        const next = await api<Mission>(`/api/missions/${mission.id}`)
        if (!aliveRef.current) return
        setMission(next)
        if (!next.intake) throw new Error('Le tri s’est interrompu (serveur redémarré ?) : relancez-le.')
        const counts = collectSummary(next)
        setNotice({
          text: `Tri terminé — ${next.documents.length} pièces classées et qualifiées. ${counts['reçue'] ?? 0} familles reçues, ${counts.partiel ?? 0} partielles, ${counts.manquante ?? 0} manquantes.`,
          ctaLabel: 'Passer à l’analyse',
          ctaStep: 'analyse',
        })
      } catch (caught) {
        if (aliveRef.current) setIntakeLive(null)
        throw caught
      }
    })
  }

  function runAnalysis() {
    if (!mission) return
    void run('L’agent exécute les contrôles datés règle par règle, puis fait contredire les conclusions…', async () => {
      try {
        await api(`/api/missions/${mission.id}/analyze`, { method: 'POST', body: '{}' })
        setAnalysisLive({ running: true, phase: 'extraction', events: [] })
        let completed = false
        for (let attempt = 0; attempt < 600; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 400))
          if (!aliveRef.current) return
          const progress = await api<AnalysisProgress>(`/api/missions/${mission.id}/analysis-progress`)
          if (!aliveRef.current) return
          setAnalysisLive({
            running: progress.running,
            phase: progress.phase,
            events: progress.events,
          })
          if (progress.error) throw new Error(progress.error)
          if (!progress.running && progress.completed) {
            completed = true
            break
          }
        }
        if (!completed) throw new Error('L’audit ne s’est pas terminé dans le temps imparti : rechargez la page et relancez.')
        const next = await api<Mission>(`/api/missions/${mission.id}`)
        if (!aliveRef.current) return
        setMission(next)
        setAnalysisLive(null)
        setSelectedFindingId(next.findings[0]?.id ?? null)
        setActiveTab('rapport')
        setNotice({
          text: `Audit terminé — ${next.findings.length} constat${next.findings.length > 1 ? 's' : ''}, exposition ferme ${next.totals ? eurRange(next.totals.exposure) : '—'}.`,
        })
      } catch (caught) {
        if (aliveRef.current) setAnalysisLive(null)
        throw caught
      }
    })
  }

  function openSource(name: string) {
    if (!mission) return
    const doc = mission.documents.find((d) => d.name === name)
    if (!doc) return
    void run('Ouverture de la pièce…', async () => {
      const payload = await api<{ document: { name: string }; content: string | null }>(
        `/api/missions/${mission.id}/documents/${doc.id}/source`,
      )
      setSourceDoc({ name: payload.document.name, content: payload.content ?? '(contenu binaire)' })
    })
  }

  function toggleControlDetails(id: string) {
    setExpandedControls((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const done: Record<StepId, boolean> = {
    cadrage: Boolean(mission),
    collecte: Boolean(mission && mission.documents.length > 0 && mission.intake),
    analyse: Boolean(mission && mission.controls.length > 0),
    rapport: Boolean(mission?.report),
  }

  const locked: Record<StepId, string | null> = {
    cadrage: null,
    collecte: mission ? null : 'Disponible après le cadrage',
    analyse: mission?.documents.length ? null : 'Disponible après la collecte',
    rapport: mission?.report ? null : 'Disponible après l’audit',
  }

  const missionFacts = mission
    ? [
        mission.siren ? `SIREN ${mission.siren}` : null,
        mission.convention,
        mission.effectif ? `${mission.effectif} salariés` : null,
        `période ${frPeriod(mission.period)}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  const intakeRunning = Boolean(intakeLive?.running)
  const analysisRunning = Boolean(analysisLive?.running)

  const liveProofTrail = analysisLive?.events.length
    ? analysisLive.events
    : intakeLive?.proofTrail?.length
      ? intakeLive.proofTrail
      : mission?.proofTrail ?? []

  const findingProofTrail = useMemo(() => {
    if (!selectedFinding || !mission?.proofTrail?.length) return []
    return mission.proofTrail.filter(
      (event) =>
        event.refs.includes(selectedFinding.id) ||
        event.refs.includes(selectedFinding.controlId) ||
        event.meta?.findingId === selectedFinding.id,
    )
  }, [mission?.proofTrail, selectedFinding])

  return (
    <div className="app">
      <aside className="app-rail">
        <a className="brand" href="/" aria-label="Legak — accueil">
          <Logo />
          <span>legak</span>
        </a>

        <div>
          <p className="stepper-caption" id="stepper-caption">
            Parcours de mission
          </p>
          <nav className="stepper" aria-labelledby="stepper-caption">
            {steps.map((step, index) => (
              <button
                key={step.id}
                aria-current={activeTab === step.id ? 'step' : undefined}
                className={[done[step.id] ? 'step is-done' : 'step', locked[step.id] ? 'is-locked' : '']
                  .join(' ')
                  .trim()}
                title={locked[step.id] ?? undefined}
                type="button"
                onClick={() => setActiveTab(step.id)}
              >
                <span className="step-index" aria-hidden="true">
                  {done[step.id] ? '✓' : index + 1}
                </span>
                <span className="step-label">
                  <strong>{step.label}</strong>
                  <small>{step.hint}</small>
                </span>
              </button>
            ))}
          </nav>
        </div>

        {mission && (
          <div className="rail-mission">
            <span className="rail-mission-caption">Mission en cours</span>
            <strong>{mission.target}</strong>
            <dl>
              <div>
                <dt>Période</dt>
                <dd>{frPeriod(mission.period)}</dd>
              </div>
              {mission.siren && (
                <div>
                  <dt>SIREN</dt>
                  <dd>{mission.siren}</dd>
                </div>
              )}
              <div>
                <dt>Statut</dt>
                <dd className="is-plain">{missionStatusLabels[mission.status] ?? mission.status}</dd>
              </div>
            </dl>
          </div>
        )}

        {mission && (
          <ProofTrailPanel
            events={liveProofTrail}
            running={intakeRunning || analysisRunning || Boolean(vdrLive?.status.running)}
            activePhase={analysisLive?.phase ?? (intakeRunning ? 'intake' : vdrLive?.status.running ? 'vdr' : null)}
          />
        )}

        <p className="rail-foot">
          Thématique couverte : avantages en nature véhicules (URSSAF).
          Rapport à relire et signer par l’avocat.
        </p>
      </aside>

      <main id="main" tabIndex={-1} className="app-main">
        <div className="app-bar">
          <div className="app-bar-id">
            <p className="eyebrow">Due diligence sociale — ANV véhicules</p>
            <h1>{mission ? mission.target : 'Nouvelle mission buy-side'}</h1>
            <p className="app-context">
              {mission
                ? missionFacts
                : 'Cadrage, collecte, contrôles datés, contradiction, rapport signable : le pipeline suit le workflow d’un avocat M&A social.'}
            </p>
          </div>
          <dl className="app-stats">
            <div>
              <dt>Pièces</dt>
              <dd>{mission ? mission.documents.length : '—'}</dd>
            </div>
            <div>
              <dt>Constats</dt>
              <dd>{mission?.controls.length ? mission.findings.length : <small>après audit</small>}</dd>
            </div>
            <div>
              <dt>Exposition ferme</dt>
              <dd>{mission?.totals ? eurRange(mission.totals.exposure) : <small>après audit</small>}</dd>
            </div>
          </dl>
        </div>

        {busy && !intakeRunning && !analysisRunning && (
          <div className="busy" role="status">
            <span className="busy-spinner" aria-hidden="true" />
            {busyLabel}
            {busySeconds >= 3 && <span className="busy-elapsed">{busySeconds}s</span>}
          </div>
        )}
        {vdrLive && mission && (
          <section className="panel vdr-live" aria-label="Agent computer use en direct">
            <div className="vdr-live-head">
              <span className="vdr-live-dot" aria-hidden="true" />
              <strong>
                {vdrLive.status.kind === 'qa'
                  ? 'Gemini Computer Use dépose la request list — en direct'
                  : 'Gemini Computer Use opère la salle de données — en direct'}
              </strong>
              <span className="vdr-live-counters">
                {vdrLive.status.modelTurns ?? 0} tour(s) modèle · {vdrLive.status.actions ?? 0} action(s)
              </span>
            </div>
            <div className="vdr-live-screen">
              {vdrLiveFrameUrl ? (
                <img
                  className="vdr-live-frame"
                  src={vdrLiveFrameUrl}
                  alt="Écran du navigateur piloté par le modèle, retransmis en direct"
                />
              ) : (
                <div className="vdr-live-wait" aria-live="polite">
                  <span className="busy-spinner" aria-hidden="true" />
                  Connexion au navigateur de l’agent…
                </div>
              )}
            </div>
            <div className="vdr-live-caption">
              <span className="vdr-live-phase">{vdrLive.status.phase ?? 'démarrage du navigateur…'}</span>
              {vdrLive.status.lastIntent && (
                <span className="vdr-live-intent">Intention du modèle : « {vdrLive.status.lastIntent} »</span>
              )}
            </div>
            <p className="vdr-live-note">
              Curseur rouge animé : il se déplace vers la cible, double onde au clic, bulle d’intention
              du modèle. Chaque action est archivée en capture PNG au trail de preuve.
            </p>
          </section>
        )}
        {error && (
          <div className="alert" role="alert" ref={alertRef}>
            <span className="alert-text">L’opération a échoué : {error}</span>
            <span className="alert-actions">
              <button type="button" onClick={retryLastAction}>
                Réessayer
              </button>
              <button type="button" onClick={() => setError('')}>
                Fermer
              </button>
            </span>
          </div>
        )}
        {notice && !busy && !error && (
          <div className="notice" role="status">
            <span className="notice-text">{notice.text}</span>
            {notice.ctaLabel && notice.ctaStep && (
              <button
                className="btn btn-small"
                type="button"
                onClick={() => {
                  setActiveTab(notice.ctaStep as StepId)
                  setNotice(null)
                }}
              >
                {notice.ctaLabel}
              </button>
            )}
            <button className="notice-dismiss" type="button" onClick={() => setNotice(null)}>
              Fermer
            </button>
          </div>
        )}

        {activeTab === 'cadrage' && (
          <section className="panel" aria-labelledby="cadrage-title">
            <div className="panel-head">
              <div className="panel-title-group">
                <h2 id="cadrage-title">Cadrage de mission</h2>
                <p className="panel-sub">
                  Le périmètre conditionne tout : mauvaise entité, mauvaise
                  période ou mauvaise population, et l’analyse entière est
                  fausse. Le cadrage génère la liste de pièces attendues.
                </p>
              </div>
              {!mission && (
                <div className="panel-head-actions">
                  <button className="btn btn-ghost" type="button" onClick={prefillDemoCadrage} disabled={busy}>
                    Pré-remplir avec la cible de démonstration
                  </button>
                  <small>Cible fictive de la data room de démo — rien n’est envoyé avant l’ouverture.</small>
                </div>
              )}
            </div>
            <form
              className="form-card"
              key={`cadrage-${mission?.id ?? 'nouvelle'}-${demoPrefill ? 'demo' : 'vierge'}`}
              onSubmit={createMission}
            >
              <div className="form-grid">
                <div className="field is-wide">
                  <label htmlFor="f-target">
                    Cible <b aria-hidden="true">*</b>
                  </label>
                  <input
                    id="f-target"
                    name="target"
                    required
                    placeholder="Raison sociale de la société auditée"
                    defaultValue={mission?.target ?? demoPrefill?.target ?? ''}
                  />
                </div>
                <div className="field">
                  <label htmlFor="f-siren">SIREN</label>
                  <input
                    id="f-siren"
                    name="siren"
                    inputMode="numeric"
                    pattern="\d{9}"
                    title="9 chiffres"
                    placeholder="9 chiffres"
                    defaultValue={mission?.siren ?? demoPrefill?.siren ?? ''}
                  />
                  <small>Sert au contrôle de périmètre.</small>
                </div>
                <div className="field">
                  <label htmlFor="f-siret">SIRET de l’établissement</label>
                  <input
                    id="f-siret"
                    name="siret"
                    inputMode="numeric"
                    pattern="\d{14}"
                    title="14 chiffres"
                    placeholder="14 chiffres (optionnel)"
                    defaultValue={mission?.siret ?? demoPrefill?.siret ?? ''}
                  />
                </div>
                <div className="field">
                  <label htmlFor="f-effectif">Effectif</label>
                  <input
                    id="f-effectif"
                    name="effectif"
                    type="number"
                    min="1"
                    placeholder="Nombre de salariés"
                    defaultValue={mission?.effectif ?? demoPrefill?.effectif ?? ''}
                  />
                </div>
                <div className="field is-half">
                  <label htmlFor="f-start">
                    Début de période auditée <b aria-hidden="true">*</b>
                  </label>
                  <input
                    id="f-start"
                    name="periodStart"
                    type="month"
                    required
                    defaultValue={mission?.periodStart ?? demoPrefill?.periodStart ?? ''}
                  />
                  <small>Format AAAA-MM.</small>
                </div>
                <div className="field is-half">
                  <label htmlFor="f-end">
                    Fin de période auditée <b aria-hidden="true">*</b>
                  </label>
                  <input
                    id="f-end"
                    name="periodEnd"
                    type="month"
                    required
                    defaultValue={mission?.periodEnd ?? demoPrefill?.periodEnd ?? ''}
                  />
                  <small>La prescription URSSAF couvre 3 ans plus l’année en cours.</small>
                </div>
                <div className="field is-wide">
                  <label htmlFor="f-convention">Convention collective</label>
                  <input
                    id="f-convention"
                    name="convention"
                    placeholder="Ex. : IDCC et intitulé de la branche"
                    defaultValue={mission?.convention ?? demoPrefill?.convention ?? ''}
                  />
                </div>
              </div>
              <div className="form-foot">
                <p>
                  Les champs marqués <b>*</b> sont obligatoires. Le cadrage peut
                  être ajusté à tout moment sans perdre les pièces reçues.
                </p>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {mission ? 'Mettre à jour le cadrage' : 'Ouvrir la mission'}
                </button>
              </div>
            </form>
          </section>
        )}

        {activeTab === 'collecte' && (
          <section className="panel" aria-labelledby="collecte-title">
            <div className="panel-head">
              <div className="panel-title-group">
                <h2 id="collecte-title">Collecte documentaire</h2>
                <p className="panel-sub">
                  Deux chemins : déposez la data room en une seule fois, ou
                  envoyez l’agent la lire directement dans le VDR du vendeur.
                  L’agent trie ensuite les pièces comme il classerait un
                  dossier physique.
                </p>
                {mission && !!mission.documents.length && (
                  <div className="collect-status" role="group" aria-label="État de la collecte par famille de pièces">
                    {Object.entries(collectSummary(mission))
                      .filter(([, count]) => count > 0)
                      .map(([status, count]) => (
                        <span className={tagClass(status)} key={status}>
                          {count} {requestStatusLabel(status, count)}
                        </span>
                      ))}
                  </div>
                )}
              </div>
              {mission && (
                <div className="panel-head-actions">
                  <button
                    className={mission.intake ? 'btn btn-ghost' : 'btn btn-primary'}
                    type="button"
                    onClick={runIntake}
                    disabled={!mission.documents.length || busy}
                  >
                    {intakeRunning
                      ? 'Tri en cours…'
                      : mission.intake
                        ? 'Retrier les pièces'
                        : 'Trier et qualifier les pièces'}
                  </button>
                  {!mission.documents.length && <small>Déposez d’abord des pièces.</small>}
                </div>
              )}
            </div>

            {!mission ? (
              <div className="empty">
                <p>Aucune mission ouverte. Cadrez d’abord la cible, la période et le périmètre.</p>
                <button className="btn btn-ghost" type="button" onClick={() => setActiveTab('cadrage')}>
                  Aller au cadrage
                </button>
              </div>
            ) : (
              <>
                <div className="collect-paths">
                  <label
                    className={dragOver ? 'dropzone is-over' : 'dropzone'}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragOver(true)
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragOver(false)
                      uploadFiles(event.dataTransfer.files)
                    }}
                  >
                    <input
                      multiple
                      type="file"
                      accept=".csv,.txt,.md,.xml,text/*"
                      disabled={busy}
                      onChange={(event) => uploadFiles(event.currentTarget.files)}
                    />
                    <strong>Déposer les pièces de la data room</strong>
                    <span>
                      Toutes les pièces en une seule fois — CSV, TXT, MD, XML.
                      Chaque pièce est archivée et empreintée (SHA-256).
                    </span>
                    <span>
                      Glissez-déposez, <em>ou cliquez pour parcourir vos fichiers</em>.
                    </span>
                  </label>

                  <div className="agent-card">
                    <h3>Agent VDR — collecte en computer use</h3>
                    <p>
                      Si les pièces vivent dans la salle de données du vendeur
                      (consultation seule, pas de téléchargement), l’agent s’y
                      connecte au navigateur, lit chaque pièce en place et
                      capture une preuve d’écran horodatée à chaque étape.
                      Cette version opère le portail VDR de démonstration
                      ci-dessous ; les VDR du marché ne sont pas encore
                      connectés.
                    </p>
                    <a href={`${API_BASE}/vdr`} target="_blank" rel="noreferrer">
                      Ouvrir le portail VDR de démonstration (vue vendeur) — code d’accès : ATLAS-2026
                    </a>
                    <div className="agent-card-actions">
                      <button className="btn btn-primary" type="button" onClick={collectFromVdr} disabled={busy}>
                        Envoyer l’agent collecter la salle de données
                      </button>
                      <button className="btn btn-ghost" type="button" onClick={loadDemoDataRoom} disabled={busy}>
                        Charger le jeu de démo (hors ligne)
                      </button>
                    </div>
                  </div>
                </div>

                {!!mission.documents.length &&
                  (() => {
                    const sorted = new Map<string, { theme: string; forceProbante: string }>()
                    if (intakeLive) {
                      for (const event of intakeLive.events) sorted.set(event.docId, event)
                    } else if (mission.intake) {
                      for (const item of mission.intake.qualified) sorted.set(item.docId, item)
                    }
                    const inboxDocs = mission.documents.filter((doc) => !sorted.has(doc.id))
                    const folderThemes = Object.keys(themeLabels).filter((theme) =>
                      [...sorted.values()].some((item) => item.theme === theme),
                    )
                    return (
                      <>
                        <h3 className="section-title" id="atelier-title">
                          L’atelier de tri de l’agent
                        </h3>
                        <div className="agent-desk" role="group" aria-labelledby="atelier-title">
                          <div className="agent-desk-head">
                            <span className="agent-desk-title" aria-hidden="true">Atelier de tri</span>
                            {intakeRunning && (
                              <span className="live-pulse">
                                {sorted.size === 0
                                  ? 'qualification des pièces en cours…'
                                  : `restitution du classement — ${sorted.size}/${mission.documents.length}`}
                              </span>
                            )}
                          </div>
                          <div className="workspace">
                            <div className="ws-box ws-inbox">
                              <header>
                                Boîte de réception <span className="count">{inboxDocs.length}</span>
                              </header>
                              <div className="ws-list">
                                {inboxDocs.map((doc) => (
                                  <button className="ws-doc" key={doc.id} type="button" onClick={() => openSource(doc.name)}>
                                    {doc.name}
                                  </button>
                                ))}
                                {!inboxDocs.length && <small className="ws-empty">Vide — tout est classé.</small>}
                              </div>
                            </div>
                            <div className="ws-folders">
                              {folderThemes.length ? (
                                folderThemes.map((theme) => {
                                  const items = mission.documents.filter((doc) => sorted.get(doc.id)?.theme === theme)
                                  return (
                                    <div className="ws-box" key={theme}>
                                      <header>
                                        {themeLabels[theme] ?? theme} <span className="count">{items.length}</span>
                                      </header>
                                      <div className="ws-list">
                                        {items.map((doc) => {
                                          const info = sorted.get(doc.id)
                                          return (
                                            <button
                                              className={`ws-doc ${forceClass(info?.forceProbante ?? '')}`}
                                              key={doc.id}
                                              type="button"
                                              title={info ? `Force probante : ${info.forceProbante} — cliquer pour ouvrir la pièce` : undefined}
                                              onClick={() => openSource(doc.name)}
                                            >
                                              {doc.name}
                                              <small>{info?.forceProbante}</small>
                                            </button>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )
                                })
                              ) : (
                                <div className="ws-await">
                                  Les dossiers thématiques apparaîtront ici pendant le tri.
                                </div>
                              )}
                            </div>
                          </div>
                          {!!intakeLive?.events.length && (
                            <ol className="feed" aria-label="Fil de tri de l’agent">
                              {[...intakeLive.events]
                                .reverse()
                                .slice(0, 8)
                                .map((event) => (
                                  <li key={event.seq}>
                                    <time dateTime={event.at}>{hhmmss(event.at)}</time>
                                    <strong>{event.name}</strong>
                                    <span className="feed-move">
                                      → {themeLabels[event.theme] ?? event.theme} · {event.forceProbante}
                                    </span>
                                    {!event.siretOk && (
                                      <small>
                                        <span className="feed-alert">SIRET non conforme</span> — pièce rattachée à un
                                        autre établissement que celui audité.
                                      </small>
                                    )}
                                  </li>
                                ))}
                            </ol>
                          )}
                        </div>
                      </>
                    )
                  })()}

                <h3 className="section-title">
                  Référentiel de collecte <span className="count">{mission.requestList.length} familles de pièces</span>
                </h3>
                <div className="request-table">
                  {mission.requestList.map((item) => (
                    <div className="request-row" key={item.id}>
                      <strong>{item.label}</strong>
                      <span className={tagClass(item.status)}>{item.status}</span>
                      <p>{fr(item.why)}</p>
                    </div>
                  ))}
                </div>

                {!!mission.vdrEvidence?.length && (
                  <>
                    <h3 className="section-title">
                      Trail de preuve de l’agent VDR <span className="count">{mission.vdrEvidence.length} captures</span>
                    </h3>
                    <EvidenceStrip
                      items={mission.vdrEvidence}
                      missionId={mission.id}
                      label="Captures de preuve VDR"
                      onSelect={setEvidenceView}
                    />
                  </>
                )}
              </>
            )}
          </section>
        )}

        {activeTab === 'analyse' && (
          <section className="panel" aria-labelledby="analyse-title">
            <div className="panel-head">
              <div className="panel-title-group">
                <h2 id="analyse-title">Contrôles règle par règle</h2>
                <p className="panel-sub">
                  Le moteur déterministe applique le barème en vigueur à la date
                  d’attribution de chaque véhicule, puis un second agent
                  contredit les conclusions.
                </p>
              </div>
              {mission && (
                <div className="panel-head-actions">
                  {mission.controls.length && !busy ? (
                    <>
                      <button className="btn btn-primary" type="button" onClick={() => setActiveTab('rapport')}>
                        Voir le package décisionnel
                      </button>
                      <button className="btn btn-ghost btn-small" type="button" onClick={runAnalysis} disabled={busy}>
                        Relancer l’audit
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={runAnalysis}
                        disabled={!mission.documents.length || busy}
                      >
                        {busy ? 'Audit en cours…' : 'Lancer l’audit'}
                      </button>
                      {!mission.documents.length && <small>Chargez d’abord la data room.</small>}
                    </>
                  )}
                </div>
              )}
            </div>

            {!mission ? (
              <div className="empty">
                <p>Aucune mission ouverte. Cadrez d’abord la cible, la période et le périmètre.</p>
                <button className="btn btn-ghost" type="button" onClick={() => setActiveTab('cadrage')}>
                  Aller au cadrage
                </button>
              </div>
            ) : busy && !mission.controls.length ? (
              <div className="audit-progress" role="status" aria-label="Audit en cours">
                <div className="audit-progress-head">
                  <span className="busy-spinner" aria-hidden="true" />
                  <strong>L’agent audite le dossier</strong>
                  <small>{analysisLive?.events.length ? `${analysisLive.events.length} décision(s) tracée(s)` : '≈ 90 secondes'}</small>
                </div>
                <ol>
                  {auditPhases.map((phase) => {
                    const phaseEvents = analysisLive?.events.filter((e) => e.phase === phase.id) ?? []
                    const state =
                      analysisLive?.phase === phase.id
                        ? 'active'
                        : phaseEvents.length
                          ? 'done'
                          : 'pending'
                    const lastEvent = phaseEvents[phaseEvents.length - 1]
                    return (
                      <li key={phase.id} data-state={state}>
                        <span>
                          {phase.title}
                          <small>{lastEvent ? lastEvent.action : phase.detail}</small>
                        </span>
                      </li>
                    )
                  })}
                </ol>
                {!!analysisLive?.events.length && (
                  <ol className="proof-feed proof-feed--inline" aria-label="Décisions tracées en direct">
                    {[...analysisLive.events].reverse().slice(0, 6).map((event) => (
                      <ProofFeedItem key={event.seq} event={event} />
                    ))}
                  </ol>
                )}
                <p className="audit-progress-foot">
                  Chaque décision est horodatée avec son acteur (Gemini ou moteur déterministe) et sa justification.
                  Les montants ne sont jamais calculés par le modèle.
                </p>
              </div>
            ) : !mission.controls.length ? (
              <div className="empty">
                <p>
                  {mission.documents.length
                    ? 'Les pièces sont reçues : lancez l’audit pour exécuter les huit contrôles élémentaires.'
                    : 'Chargez d’abord la data room, puis lancez l’audit.'}
                </p>
                {!mission.documents.length && (
                  <button className="btn btn-ghost" type="button" onClick={() => setActiveTab('collecte')}>
                    Aller à la collecte
                  </button>
                )}
              </div>
            ) : (
              <>
                <h3 className="section-title">
                  Contrôles exécutés <span className="count">{mission.controls.length}</span>
                </h3>
                <ol className="control-list">
                  {mission.controls.map((control) => {
                    const expanded = expandedControls.has(control.id)
                    const details = control.details.map(fr)
                    const visible = expanded ? details : details.slice(0, 3)
                    return (
                      <li key={control.id}>
                        <span className={tagClass(control.status)}>{control.status}</span>
                        <strong>
                          <span className="mono">{control.id}</span>
                          {fr(control.title)}
                        </strong>
                        {details.length > 0 && (
                          <ul className="control-details">
                            {visible.map((detail) => (
                              <li key={detail}>{detail}</li>
                            ))}
                            {details.length > 3 && (
                              <li>
                                <button
                                  className="control-details-more"
                                  type="button"
                                  onClick={() => toggleControlDetails(control.id)}
                                >
                                  {expanded ? 'Réduire' : `Voir les ${details.length - 3} autres constats`}
                                </button>
                              </li>
                            )}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ol>

                <h3 className="section-title">
                  Annexe chiffrée <span className="count">véhicule par véhicule</span>
                </h3>
                <div className="data-table" role="region" aria-label="Annexe chiffrée véhicule par véhicule" tabIndex={0}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Véhicule</th>
                        <th scope="col">Salarié</th>
                        <th scope="col">Barème appliqué</th>
                        <th scope="col">Statut</th>
                        <th scope="col" className="num">
                          Assiette éludée
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {mission.vehicleAnalyses.map((v) => (
                        <tr key={v.vehicleId}>
                          <td className="nowrap">
                            <strong className="mono">{v.vehicleId}</strong> · {v.modele}
                          </td>
                          <td>{v.salarie}</td>
                          <td className="muted">{baremeLabels[v.bareme] ?? v.bareme}</td>
                          <td>
                            <span className={tagClass(v.statut)}>{v.statut}</span>
                          </td>
                          <td className="num">
                                {v.assietteDelta ? (
                                  eur(v.assietteDelta)
                                ) : v.conditionalDelta ? (
                                  <>
                                    {eur(v.conditionalDelta)}
                                    <span className="cond">si pièce non produite</span>
                                  </>
                                ) : (
                                  '—'
                                )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {mission.totals && (
                      <tfoot>
                        <tr>
                          <td colSpan={4}>Total assiette éludée (ferme + conditionnelle)</td>
                          <td className="num">
                            {eur(mission.totals.assietteEludee)}
                            {mission.totals.assietteConditionnelle > 0 && (
                              <span className="cond">+ {eur(mission.totals.assietteConditionnelle)} conditionnelle</span>
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                <h3 className="section-title">Journal d’audit</h3>
                <ol className="audit-trail">
                  {mission.auditLog.map((event) => (
                    <li key={`${event.at}-${event.event}`}>
                      <time dateTime={event.at}>{hhmmss(event.at)}</time>
                      <strong>{auditEventLabels[event.event] ?? event.event}</strong>
                      {event.note ? <small>{fr(String(event.note))}</small> : null}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
        )}

        {activeTab === 'rapport' && (
          <section className="panel" aria-labelledby="rapport-title">
            <div className="panel-head">
              <div className="panel-title-group">
                <h2 id="rapport-title">Package décisionnel</h2>
                <p className="panel-sub">
                  Red flag report buy-side : à relire et signer par l’avocat.
                  Rien n’est affirmé sans pièce.
                </p>
              </div>
              {mission?.report && (
                <a
                  className="btn btn-primary"
                  href={`${API_BASE}/api/missions/${mission.id}/report.md`}
                  download="rapport-dd-sociale-anv.md"
                >
                  Télécharger le rapport (.md)
                </a>
              )}
            </div>

            {!mission?.report ? (
              <div className="empty">
                <p>
                  {mission?.documents.length
                    ? 'Lancez l’audit pour générer le package décisionnel.'
                    : 'Cadrez la mission et chargez la data room, puis lancez l’audit.'}
                </p>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setActiveTab(mission?.documents.length ? 'analyse' : mission ? 'collecte' : 'cadrage')}
                >
                  {mission?.documents.length ? 'Aller à l’analyse' : mission ? 'Aller à la collecte' : 'Aller au cadrage'}
                </button>
              </div>
            ) : (
              <article className="report">
                <div className="report-inner">
                  <header className="report-masthead">
                    <div>
                      <p className="kicker">Rapport red flag — buy-side · confidentiel</p>
                      <h3>{mission.report.title}</h3>
                    </div>
                    {mission.riskScore && (
                      <div className="report-masthead-score">
                        <div
                          className={
                            mission.riskScore.closingBlocker || mission.riskScore.critiques > 0
                              ? 'seal'
                              : mission.riskScore.eleves > 0
                                ? 'seal is-warn'
                                : 'seal is-ok'
                          }
                          role="img"
                          aria-label={`Indice de conformité thématique : ${mission.riskScore.score} sur 100`}
                        >
                          <strong>
                            {mission.riskScore.score}
                            <small>/100</small>
                          </strong>
                          <span>conformité thématique</span>
                        </div>
                        <small>
                          {mission.riskScore.critiques} critique{mission.riskScore.critiques > 1 ? 's' : ''} ·{' '}
                          {mission.riskScore.eleves} élevé{mission.riskScore.eleves > 1 ? 's' : ''}
                        </small>
                      </div>
                    )}
                  </header>

                  <section className="report-summary" aria-label="Executive summary">
                    <p>{fr(mission.report.executiveSummary)}</p>
                    {mission.riskScore && (
                      <p className="report-reading">
                        <b>Lecture :</b> {fr(mission.riskScore.note)}
                      </p>
                    )}
                    {mission.totals && (
                      <div className="exposure-strip">
                        <div className={mission.riskScore?.closingBlocker ? 'is-blocker' : ''}>
                          <span>Closing blocker</span>
                          <strong>{mission.riskScore?.closingBlocker ? 'Oui' : 'Non'}</strong>
                        </div>
                        <div>
                          <span>Exposition ferme</span>
                          <strong>{eurRange(mission.totals.exposure)}</strong>
                        </div>
                        {mission.totals.exposureConditional && (
                          <div>
                            <span>Exposition conditionnelle</span>
                            <strong>{eurRange(mission.totals.exposureConditional)}</strong>
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="report-section" aria-label="Registre des risques">
                    <div className="report-section-head">
                      <h4>Registre des risques</h4>
                      <span className="count">
                        {mission.findings.length} constat{mission.findings.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="register">
                      <ul className="register-queue">
                        {mission.findings.map((finding) => (
                          <li key={finding.id}>
                            <button
                              className="register-item"
                              aria-pressed={finding.id === selectedFinding?.id}
                              type="button"
                              onClick={() => setSelectedFindingId(finding.id)}
                            >
                              <span className={`dot ${severityClass[finding.severity]}`} aria-hidden="true" />
                              <strong>
                                <span className="mono">
                                  {finding.id} · {finding.severity}
                                </span>
                                {fr(finding.title)}
                              </strong>
                              <small>
                                {finding.exposure
                                  ? eurRange(finding.exposure)
                                  : finding.conditionalExposure
                                    ? `${eurRange(finding.conditionalExposure)} si pièces non produites`
                                    : 'non chiffrable en l’état'}
                              </small>
                            </button>
                          </li>
                        ))}
                      </ul>

                      {selectedFinding && (
                        <article className="register-detail" aria-label={`Fiche risque ${selectedFinding.id}`}>
                          <div className="register-detail-head">
                            <span className={`sev-pill ${severityClass[selectedFinding.severity]}`}>
                              {selectedFinding.severity}
                            </span>
                            <span className="ref">{selectedFinding.id}</span>
                            <span className="meta">
                              probabilité {selectedFinding.probability} · confiance {selectedFinding.confidence}
                            </span>
                          </div>
                          <blockquote>{fr(selectedFinding.facts)}</blockquote>
                          <dl className="detail-rows">
                            <div>
                              <dt>Règle</dt>
                              <dd>{fr(selectedFinding.rule)}</dd>
                            </div>
                            <div>
                              <dt>Population</dt>
                              <dd>{selectedFinding.population.join(', ')}</dd>
                            </div>
                            <div>
                              <dt>Assiette éludée</dt>
                              <dd>
                                <span className="mono">{eur(selectedFinding.assietteEludee)}</span>
                                {selectedFinding.assietteConditionnelle > 0 && (
                                  <>
                                    {' '}
                                    (+ <span className="mono">{eur(selectedFinding.assietteConditionnelle)}</span>{' '}
                                    conditionnelle)
                                  </>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Impact deal</dt>
                              <dd>{fr(selectedFinding.dealImpact)}</dd>
                            </div>
                            <div>
                              <dt>Pré-closing</dt>
                              <dd>{fr(selectedFinding.recoPreClosing)}</dd>
                            </div>
                            <div>
                              <dt>Clause SPA</dt>
                              <dd>{fr(selectedFinding.recoSpa)}</dd>
                            </div>
                            <div>
                              <dt>Post-closing</dt>
                              <dd>{fr(selectedFinding.postClosing)}</dd>
                            </div>
                          </dl>
                          {selectedFinding.contradiction && (
                            <div className="contradiction">
                              <span>
                                Contrôle croisé — {mission.report.contradictionMode.split('(')[0].trim()}
                              </span>
                              <p>
                                <b>{selectedFinding.contradiction.verdict}</b> — {fr(selectedFinding.contradiction.note)}
                              </p>
                            </div>
                          )}
                          {!!findingProofTrail.length && (
                            <div className="proof-chain">
                              <span className="proof-chain-caption">Chaîne de preuve du constat</span>
                              <ol className="proof-feed">
                                {findingProofTrail.map((event) => (
                                  <ProofFeedItem key={event.seq} event={event} compact />
                                ))}
                              </ol>
                            </div>
                          )}
                          <div className="sources">
                            <span className="sources-caption">Pièces sources — cliquer pour ouvrir</span>
                            {selectedFinding.sources.map((source) => (
                              <button className="source-chip" key={source} type="button" onClick={() => openSource(source)}>
                                {source}
                              </button>
                            ))}
                          </div>
                        </article>
                      )}
                    </div>
                  </section>

                  <section className="report-section" aria-label="Suivi Q&A">
                    {(() => {
                      const pending = mission.qaTracker.filter((qa) => qa.status === 'à demander').length
                      const uniqueStatuses = new Set(mission.qaTracker.map((qa) => qa.status))
                      const showStatusColumn = uniqueStatuses.size > 1
                      return (
                        <>
                          <div className="report-section-head">
                            <h4>Suivi Q&A — pièces à demander à la cible</h4>
                            <div className="head-meta">
                              {!showStatusColumn && mission.qaTracker.length > 0 && (
                                <span className={tagClass([...uniqueStatuses][0])}>
                                  {mission.qaTracker.length} {[...uniqueStatuses][0]}
                                </span>
                              )}
                              {pending > 0 && (
                                <button
                                  className="btn btn-ghost btn-small"
                                  type="button"
                                  onClick={postQaToVdr}
                                  disabled={busy}
                                >
                                  Déposer la request list au Q&A du VDR
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="data-table" role="region" aria-label="Suivi Q&A" tabIndex={0}>
                            <table>
                              <thead>
                                <tr>
                                  <th scope="col">Réf.</th>
                                  <th scope="col">Demande</th>
                                  <th scope="col">Urgence</th>
                                  {showStatusColumn && <th scope="col">Statut</th>}
                                  <th scope="col">Impact si non fourni</th>
                                </tr>
                              </thead>
                              <tbody>
                                {mission.qaTracker.map((qa) => (
                                  <tr key={qa.id}>
                                    <td className="mono nowrap">{qa.id}</td>
                                    <td>{fr(qa.question)}</td>
                                    <td>
                                      <span className={tagClass(qa.urgency)}>{qa.urgency}</span>
                                    </td>
                                    {showStatusColumn && (
                                      <td>
                                        <span className={tagClass(qa.status)}>{qa.status}</span>
                                      </td>
                                    )}
                                    <td className="muted">{fr(qa.impactSiNonFourni)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )
                    })()}
                    {!!mission.vdrEvidence?.some((e) => e.screenshot.startsWith('qa-')) && (
                      <EvidenceStrip
                        items={mission.vdrEvidence.filter((e) => e.screenshot.startsWith('qa-'))}
                        missionId={mission.id}
                        label="Preuves de dépôt au Q&A"
                        onSelect={setEvidenceView}
                      />
                    )}
                  </section>

                  <section className="report-section" aria-label="Plan post-closing">
                    <div className="report-section-head">
                      <h4>Plan post-closing 30/60/90</h4>
                    </div>
                    <div className="data-table" role="region" aria-label="Plan post-closing 30/60/90" tabIndex={0}>
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Horizon</th>
                            <th scope="col">Action</th>
                            <th scope="col">Risque</th>
                            <th scope="col">Responsable</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mission.report.postClosingPlan.map((item) => (
                            <tr key={`${item.horizon}-${item.risque}`}>
                              <td className="mono nowrap">{item.horizon}</td>
                              <td>{fr(item.action)}</td>
                              <td className="mono nowrap">{item.risque}</td>
                              <td className="muted">{item.responsable}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="report-section" aria-label="Limites de mission">
                    <div className="report-section-head">
                      <h4>Limites de mission</h4>
                    </div>
                    <ul className="limits">
                      {mission.report.missionScope.limites.map((limit) => (
                        <li key={limit}>{fr(limit)}</li>
                      ))}
                    </ul>
                  </section>

                  <div className="signature-block">
                    <p>
                      Rapport préparé par un agent sous supervision. Les
                      conclusions doivent être relues, arbitrées et signées par
                      l’avocat avant toute utilisation dans la négociation.
                      L’espace ci-contre est réservé à la signature de
                      l’exemplaire imprimé.
                    </p>
                    <div className="signature-line">
                      <i aria-hidden="true" />
                      <span>L’avocat signataire</span>
                    </div>
                  </div>
                </div>
              </article>
            )}
          </section>
        )}

        {sourceDoc && (
          <Sheet label={`Pièce ${sourceDoc.name}`} onClose={() => setSourceDoc(null)}>
            <div className="sheet-head">
              <strong>{sourceDoc.name}</strong>
              <span className="sheet-head-actions">
                <kbd>Échap</kbd>
                <button className="sheet-close" type="button" onClick={() => setSourceDoc(null)}>
                  Fermer
                </button>
              </span>
            </div>
            <SourceContent name={sourceDoc.name} content={sourceDoc.content} />
          </Sheet>
        )}

        {evidenceView && mission && (
          <Sheet wide label={`Preuve ${evidenceView.caption}`} onClose={() => setEvidenceView(null)}>
            <div className="sheet-head">
              <strong>
                {evidenceView.at.slice(0, 19).replace('T', ' ')} — {evidenceView.caption}
              </strong>
              <span className="sheet-head-actions">
                <kbd>Échap</kbd>
                <button className="sheet-close" type="button" onClick={() => setEvidenceView(null)}>
                  Fermer
                </button>
              </span>
            </div>
            <div className="sheet-media">
              <img
                src={`${API_BASE}/api/missions/${mission.id}/vdr-evidence/${evidenceView.screenshot}`}
                alt={evidenceView.caption}
              />
              <small>{evidenceView.url}</small>
            </div>
          </Sheet>
        )}
      </main>
    </div>
  )
}

function ProofFeedItem({ event, compact = false }: { event: ProofEvent; compact?: boolean }) {
  return (
    <li className={compact ? 'proof-item is-compact' : 'proof-item'} data-status={event.status}>
      <time dateTime={event.at}>{hhmmss(event.at)}</time>
      <span className={`proof-actor proof-actor--${event.actor}`}>{proofActorLabels[event.actor] ?? event.actor}</span>
      <strong>{event.action}</strong>
      {!compact && <small>{fr(event.rationale)}</small>}
      {!!event.refs.length && !compact && (
        <span className="proof-refs">
          {event.refs.slice(0, 4).map((ref) => (
            <code key={ref}>{ref}</code>
          ))}
        </span>
      )}
    </li>
  )
}

function ProofTrailPanel({
  events,
  running,
  activePhase,
}: {
  events: ProofEvent[]
  running: boolean
  activePhase: string | null
}) {
  const tail = events.slice(-14)
  return (
    <div className="proof-trail-panel" aria-live="polite">
      <div className="proof-trail-head">
        <span className="proof-trail-caption">Trail de preuve</span>
        {running && (
          <span className="live-pulse">
            {activePhase ? proofPhaseLabels[activePhase] ?? activePhase : 'en cours…'}
          </span>
        )}
        <span className="count">{events.length}</span>
      </div>
      {tail.length ? (
        <ol className="proof-feed proof-feed--rail">
          {[...tail].reverse().map((event) => (
            <ProofFeedItem key={event.seq} event={event} compact />
          ))}
        </ol>
      ) : (
        <p className="proof-trail-empty">Chaque décision de l’agent sera tracée ici avec son acteur et sa justification.</p>
      )}
    </div>
  )
}

function EvidenceStrip({
  items,
  missionId,
  label,
  onSelect,
}: {
  items: VdrEvidence[]
  missionId: string
  label: string
  onSelect: (evidence: VdrEvidence) => void
}) {
  return (
    <ul className="evidence-strip" aria-label={label}>
      {items.map((evidence) => (
        <li key={evidence.screenshot}>
          <button className="evidence-shot" type="button" onClick={() => onSelect(evidence)}>
            <img
              src={`${API_BASE}/api/missions/${missionId}/vdr-evidence/${evidence.screenshot}`}
              alt={evidence.caption}
              loading="lazy"
            />
            <span className="evidence-caption">
              <time dateTime={evidence.at}>{hhmmss(evidence.at)}</time>
              <span>{evidence.caption}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/* Rendu d'une pièce source : les CSV sont affichés en table, le reste en texte. */
function SourceContent({ name, content }: { name: string; content: string }) {
  if (/\.csv$/i.test(name)) {
    const lines = content.trim().split('\n')
    const rows = lines.filter((line) => line.trim() && !line.startsWith('#')).map((line) => line.split(';'))
    const notes = lines.filter((line) => line.startsWith('#')).map((line) => line.replace(/^#\s*/, ''))
    const [head, ...body] = rows
    if (head && body.length) {
      return (
        <>
          <div className="data-table" role="region" aria-label={`Contenu de ${name}`} tabIndex={0}>
            <table>
              <thead>
                <tr>
                  {head.map((cell, index) => (
                    <th scope="col" key={index}>
                      {cell.replaceAll('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.slice(0, 400).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="csv-note">
            {body.length > 400 ? `Aperçu des 400 premières lignes sur ${body.length}. ` : ''}
            {notes.length > 0 ? `Note de la pièce : ${notes.join(' · ')}` : 'Pièce archivée telle que reçue, affichée en tableau.'}
          </p>
        </>
      )
    }
  }
  return <pre>{content}</pre>
}

/* Dialogue natif : focus piégé, Échap et restauration du focus fournis par la plateforme. */
function Sheet({
  label,
  wide,
  onClose,
  children,
}: {
  label: string
  wide?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    // L'événement close est dispatché dans une tâche : en cas de
    // remontage (StrictMode), on ignore l'événement du montage précédent.
    const handleClose = () => {
      if (!dialog.open) closeRef.current()
    }
    dialog.addEventListener('close', handleClose)
    return () => {
      dialog.removeEventListener('close', handleClose)
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className={wide ? 'sheet is-wide' : 'sheet'}
      aria-label={label}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close()
      }}
    >
      <div className="sheet-frame">{children}</div>
    </dialog>
  )
}

async function readUpload(file: File) {
  const textLike = file.type.startsWith('text') || /\.(xml|csv|txt|md)$/i.test(file.name)
  if (textLike) {
    return { name: file.name, mimeType: file.type || 'text/plain', content: await file.text() }
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    contentBase64: dataUrl.split(',')[1] ?? '',
  }
}

const pageTitles: Record<string, string> = {
  '/': 'Legak — Due diligence sociale M&A, signée par l’avocat',
  '/pricing': 'Tarifs — Legak',
  '/app': 'Mission — Legak',
}

function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    document.title = pageTitles[path] ?? pageTitles['/']
  }, [path])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a')
      if (!anchor || anchor.origin !== window.location.origin) return
      if (anchor.hasAttribute('download')) return
      if (anchor.pathname === window.location.pathname && anchor.hash) return
      if (!['/', '/pricing', '/app'].includes(anchor.pathname)) return
      event.preventDefault()
      const behavior = prefersReducedMotion() ? ('auto' as const) : ('smooth' as const)
      const hash = anchor.hash
      window.history.pushState({}, '', anchor.href)
      setPath(anchor.pathname)
      requestAnimationFrame(() => {
        if (hash) {
          document.querySelector(hash)?.scrollIntoView({ behavior })
        } else {
          window.scrollTo({ top: 0, behavior })
          const main = document.getElementById('main')
          main?.focus({ preventScroll: true })
        }
      })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <>
      <a className="skip-link" href="#main">
        Aller au contenu principal
      </a>
      {path !== '/app' && <Header path={path} />}
      {path === '/pricing' && <PricingPage />}
      {path === '/app' && <ProductApp />}
      {path === '/' && <HomePage />}
      {path !== '/app' && <Footer />}
    </>
  )
}

export default App
