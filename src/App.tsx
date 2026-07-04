import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Finding = {
  id: string
  title: string
  risk: 'critical' | 'high' | 'medium'
  exposure: string
  source: string
  quote: string
  clause: string
}

type Plan = {
  name: string
  price: string
  description: string
  features: string[]
  cta: string
}

const steps = [
  'Open data room',
  'Classify bilingual evidence',
  'Extract cited facts with Gemini',
  'Run dated legal controls',
  'Price exposure',
  'Draft deal clauses',
]

const files = [
  ['Provident plan instrument.pdf', 'FR', 'partial proof'],
  ['Payroll ledger 2025.xlsx', 'FR', 'structured'],
  ['SPA draft - buyer markup.docx', 'EN', 'deal language'],
  ['URSSAF statements.pdf', 'FR', 'missing Q3'],
]

const findings: Finding[] = [
  {
    id: 'urssaf',
    title: 'Q3 URSSAF statement is absent',
    risk: 'critical',
    exposure: 'unknown',
    source: 'Request list, item 7',
    quote:
      'The Q3 statement is missing from the five-source reconciliation.',
    clause:
      'Condition precedent before signing, with a specific reserve if the statement is not delivered.',
  },
  {
    id: 'vehicle',
    title: 'Vehicle benefits use the pre-2025 scale',
    risk: 'medium',
    exposure: '18k-31k EUR',
    source: 'Payroll ledger 2025.xlsx, rows 214-287',
    quote:
      'Vehicles made available after 2025-02-01 are valued under the historical 9% flat-rate scale.',
    clause:
      'Escrow covering contributions, penalties, and salary corrections over the audited period.',
  },
  {
    id: 'scheme',
    title: 'Provident scheme category is not proven',
    risk: 'high',
    exposure: '42k-68k EUR',
    source: 'Provident plan instrument.pdf, p. 3',
    quote:
      'Senior executives are covered without a usable reference to statutory benefit categories.',
    clause:
      'Specific indemnity outside basket and cap for 3 years, indexed on the URSSAF reassessment.',
  },
]

const plans: Plan[] = [
  {
    name: 'Pilot',
    price: '2.5k EUR',
    description: 'One scoped employment DD on an anonymized or live data room.',
    cta: 'Run one file',
    features: [
      'One target company',
      'Bilingual source review',
      'Provident scheme and payroll checks',
      'Cited risk memo',
    ],
  },
  {
    name: 'Deal Room',
    price: '4k EUR / deal',
    description: 'For funds and counsel that need a negotiation-ready report.',
    cta: 'Book deal workflow',
    features: [
      'Full request list',
      'Dated legal parameters',
      'Exposure range by issue',
      'SPA and warranty clauses',
    ],
  },
  {
    name: 'Platform',
    price: 'Custom',
    description: 'For repeat buyers, Transaction Services, and W&I underwriting.',
    cta: 'Design partner',
    features: [
      'Multi-deal workspace',
      'Immutable proof trail',
      'Expert review queue',
      'Custom rule packs',
    ],
  },
]

function Logo() {
  return (
    <span className="logoWrap" aria-hidden="true">
      <svg className="logoMark" viewBox="0 0 40 40" role="img">
        <path className="logoFrame" d="M5 7h19l11 11v15H5z" />
        <path className="logoFold" d="M24 7v11h11" />
        <path className="logoCut" d="M12 25h12M12 18h7" />
        <path className="logoSpark" d="M27 27l3 3 5-7" />
      </svg>
    </span>
  )
}

function Header() {
  return (
    <header className="nav">
      <a className="brand" href="/" aria-label="Legak home">
        <Logo />
        <span>legak</span>
      </a>
      <nav aria-label="Main navigation">
        <a href="/#product">Product</a>
        <a href="/#demo">Demo</a>
        <a href="/pricing">Pricing</a>
      </nav>
      <a className="navCta" href="/pricing">
        Start pilot
      </a>
    </header>
  )
}

function HomePage() {
  const [running, setRunning] = useState(false)
  const [activeStep, setActiveStep] = useState(1)
  const [selectedId, setSelectedId] = useState(findings[0].id)
  const selected = useMemo(
    () => findings.find((finding) => finding.id === selectedId) ?? findings[0],
    [selectedId],
  )

  useEffect(() => {
    if (!running) return
    setActiveStep(0)
    const timers = steps.map((_, index) =>
      window.setTimeout(() => setActiveStep(index), 520 * (index + 1)),
    )
    const stop = window.setTimeout(() => setRunning(false), 520 * (steps.length + 1))
    return () => {
      timers.forEach(window.clearTimeout)
      window.clearTimeout(stop)
    }
  }, [running])

  return (
    <main>
      <section className="heroSection" aria-labelledby="hero-title">
        <div className="heroCopy">
          <p className="signal">Google DeepMind track - RAISE 2026</p>
          <h1 id="hero-title">The audit agent for employment deal risk.</h1>
          <p className="heroText">
            Legak watches a bilingual data room, clicks into source documents,
            runs dated French employment controls, and turns red flags into deal
            language counsel can sign.
          </p>
          <div className="heroActions">
            <a className="primaryButton" href="#demo">
              Watch the live audit
            </a>
            <a className="secondaryButton" href="/pricing">
              See pricing
            </a>
          </div>
          <div className="proofStrip" aria-label="Product proof points">
            <span>FR/EN sources</span>
            <span>Computer Use ready</span>
            <span>No uncited conclusion</span>
          </div>
        </div>

        <div className="agentRoom" aria-label="Animated Legak agent room">
          <div className="roomTop">
            <span>Antigravity environment</span>
            <strong>LEGAK-DEAL-042</strong>
          </div>
          <div className="roomBody">
            <div className="sourceRail">
              {files.map(([name, lang, status], index) => (
                <div
                  className="sourceCard"
                  key={name}
                  style={{ '--delay': `${index * 120}ms` } as CSSProperties}
                >
                  <small>{lang}</small>
                  <span>{name}</span>
                  <strong>{status}</strong>
                </div>
              ))}
            </div>
            <div className="agentCore">
              <div className="scanWindow">
                <div className="scanLine" />
                <span>Gemini extracts cited facts</span>
              </div>
              <div className="liabilityDial">
                <span>Exposure</span>
                <strong>60k-99k EUR</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="band productBand">
        <div>
          <h2>Built like an audit, not a chat thread.</h2>
          <p>
            The model handles reading, translation, and drafting. Code owns the
            legal parameters, calculations, proof states, and final verdict tree.
          </p>
        </div>
        <div className="numberedGrid">
          <article>
            <span>01</span>
            <h3>Persistent mission state</h3>
            <p>Every request, citation, and unresolved issue stays attached to the deal.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Computer-use proof trail</h3>
            <p>The agent can open the data room and jump to the exact cited passage.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Deal-language output</h3>
            <p>Each red flag becomes exposure, clause, warranty, or condition precedent.</p>
          </article>
        </div>
      </section>

      <section id="demo" className="demoSection" aria-labelledby="demo-title">
        <div className="sectionHead">
          <div>
            <p className="sectionLabel">Fake demo, real workflow shape</p>
            <h2 id="demo-title">Watch Legak run a diligence mission.</h2>
          </div>
          <button className="primaryButton" type="button" onClick={() => setRunning(true)}>
            {running ? 'Running...' : 'Replay mission'}
          </button>
        </div>

        <div className="demoGrid">
          <div className="missionPanel">
            <h3>Mission timeline</h3>
            <ol className="stepList">
              {steps.map((step, index) => (
                <li className={index <= activeStep ? 'active' : ''} key={step}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{step}</strong>
                </li>
              ))}
            </ol>
          </div>

          <div className="missionPanel findingPanel">
            <h3>Live findings</h3>
            <div className="findingList">
              {findings.map((finding) => (
                <button
                  className={finding.id === selected.id ? 'finding active' : 'finding'}
                  key={finding.id}
                  type="button"
                  onClick={() => setSelectedId(finding.id)}
                >
                  <span className={`riskDot ${finding.risk}`} />
                  <span>{finding.title}</span>
                  <strong>{finding.exposure}</strong>
                </button>
              ))}
            </div>
          </div>

          <article className="evidencePanel">
            <div className="evidenceHeader">
              <span className={`riskPill ${selected.risk}`}>{selected.risk}</span>
              <strong>{selected.source}</strong>
            </div>
            <blockquote>{selected.quote}</blockquote>
            <p>{selected.clause}</p>
            <div className="computerUseCard">
              <span>Computer Use action</span>
              <strong>Open source, highlight quote, append to audit log</strong>
            </div>
          </article>
        </div>
      </section>

      <section className="band deepmind">
        <div>
          <h2>DeepMind primitives are load-bearing.</h2>
          <p>
            This only works if the agent can hold state, read across languages,
            and operate the data room instead of waiting for perfect APIs.
          </p>
        </div>
        <div className="deepmindGrid">
          <div>
            <h3>Interactions API</h3>
            <p>Resumable audit state and request list memory.</p>
          </div>
          <div>
            <h3>Gemini Computer Use</h3>
            <p>Click, inspect, and cite source passages in existing deal tools.</p>
          </div>
          <div>
            <h3>Live Translate</h3>
            <p>Optional seller calls become English action items in the same mission.</p>
          </div>
        </div>
      </section>

      <section className="band pricingTeaser">
        <h2>Price the first wedge simply.</h2>
        <p>Start with one file, expand to repeat buyers once the proof trail lands.</p>
        <a className="primaryButton" href="/pricing">
          Open pricing
        </a>
      </section>
    </main>
  )
}

function PricingPage() {
  return (
    <main>
      <section className="pricingHero">
        <p className="signal">Pricing</p>
        <h1>Pay for the audit outcome, not the seat count.</h1>
        <p>
          Start with one diligence mission. Move to platform pricing when Legak
          becomes part of every deal process.
        </p>
      </section>

      <section className="pricingGrid" aria-label="Legak pricing plans">
        {plans.map((plan, index) => (
          <article className={index === 1 ? 'priceCard featured' : 'priceCard'} key={plan.name}>
            <span className="planName">{plan.name}</span>
            <strong>{plan.price}</strong>
            <p>{plan.description}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <a className={index === 1 ? 'primaryButton' : 'secondaryButton'} href="mailto:team@legak.ai">
              {plan.cta}
            </a>
          </article>
        ))}
      </section>

      <section className="pricingNotes">
        <div>
          <h2>What is included?</h2>
          <p>
            Bilingual document ingestion, dated French employment controls,
            evidence verification, and a negotiation-ready risk memo.
          </p>
        </div>
        <div>
          <h2>What stays human?</h2>
          <p>
            Legal judgment, final arbitration, and signature. Legak prepares the
            record; regulated professionals keep the responsibility.
          </p>
        </div>
      </section>
    </main>
  )
}

function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a')
      if (!anchor || anchor.origin !== window.location.origin) return
      if (anchor.pathname === window.location.pathname && anchor.hash) return
      if (anchor.pathname !== '/' && anchor.pathname !== '/pricing') return
      event.preventDefault()
      window.history.pushState({}, '', anchor.href)
      setPath(anchor.pathname)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <>
      <Header />
      {path === '/pricing' ? <PricingPage /> : <HomePage />}
    </>
  )
}

export default App
