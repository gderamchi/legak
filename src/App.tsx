import { useMemo, useState } from 'react'
import './App.css'

type Finding = {
  id: string
  title: string
  risk: 'critical' | 'high' | 'medium'
  exposure: string
  status: string
  source: string
  quote: string
  clause: string
}

const files = [
  ['Provident plan instrument.pdf', 'partial proof', '2023-2026'],
  ['Group insurance contract.pdf', 'probative', '2024'],
  ['Payroll ledger 2025.xlsx', 'structured', '78 employees'],
  ['DSN 2025-01 to 2025-12.xml', 'structured', '12 months'],
  ['URSSAF statements.pdf', 'missing Q3', 'request created'],
]

const checks = [
  ['Scope', 'Entity, SIRET, Syntec, URSSAF limitation period'],
  ['Gemini extraction', 'Document classification and exact citations'],
  ['Legal time-travel', 'PMSS, vehicle benefits, dated limitation rules'],
  ['Control engine', 'Instrument, contract, payroll, DSN, URSSAF match'],
  ['Expert review', 'Human arbitration on legal divergence'],
]

const findings: Finding[] = [
  {
    id: 'prevoyance',
    title: 'Provident scheme not proven for one executive category',
    risk: 'high',
    exposure: '42k-68k EUR',
    status: 'not proven because evidence is missing',
    source: 'Provident plan instrument.pdf, p. 3',
    quote:
      'The beneficiary category targets senior executives without a usable reference to statutory benefit categories.',
    clause:
      'Specific indemnity outside basket and cap for 3 years, with a base equal to the URSSAF reassessment linked to the provident scheme.',
  },
  {
    id: 'vehicle',
    title: 'Vehicle benefit assessed under the wrong dated scale',
    risk: 'medium',
    exposure: '18k-31k EUR',
    status: 'probably non-compliant',
    source: 'Payroll ledger 2025.xlsx, rows 214-287',
    quote:
      'Vehicles made available after 2025-02-01 are valued under the historical 9% flat-rate scale.',
    clause:
      'Price adjustment or escrow covering contributions, penalties, and salary corrections over the audited period.',
  },
  {
    id: 'urssaf',
    title: 'Q3 URSSAF statement absent from the data room',
    risk: 'critical',
    exposure: 'undetermined',
    status: 'to be confirmed',
    source: 'Request list, item 7',
    quote:
      'Seller request created because the Q3 statement is missing from the five-source reconciliation.',
    clause:
      'Condition precedent requiring delivery and validation before signing, with a specific reserve if not provided.',
  },
]

const businessRows = [
  ['ICP', 'Mid-cap funds, Transaction Services, employment-law firms that sign'],
  ['Pricing', '2.5k-4k EUR per file, then multi-deal subscription'],
  ['Wedge', 'French employment DD first: Syntec and URSSAF-heavy dossiers'],
  ['Expansion', 'Vendor DD, recurring URSSAF compliance, W&I insurers'],
]

function App() {
  const [selectedId, setSelectedId] = useState(findings[0].id)
  const [ran, setRan] = useState(false)
  const selected = useMemo(
    () => findings.find((finding) => finding.id === selectedId) ?? findings[0],
    [selectedId],
  )

  return (
    <>
      <header className="nav">
        <a className="brand" href="#top" aria-label="Legak home">
          <span>legak</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#product">Product</a>
          <a href="#deepmind">DeepMind</a>
          <a href="#gtm">GTM</a>
        </nav>
        <a className="navCta" href="#demo">
          Demo
        </a>
      </header>

      <main id="top">
        <section className="heroSection" aria-labelledby="hero-title">
          <div className="heroCopy">
            <p className="signal">Google DeepMind track - RAISE 2026</p>
            <h1 id="hero-title">Social due diligence in hours, not weeks.</h1>
            <p className="heroText">
              Legak ingests French employment data rooms, runs dated legal
              controls, prices hidden liabilities, and links every conclusion
              back to source evidence. Source documents can be English or French.
            </p>
            <div className="heroActions">
              <a className="primaryButton" href="#demo">
                Watch the audit replay
              </a>
              <a className="secondaryButton" href="#gtm">
                Business plan
              </a>
            </div>
          </div>

          <div className="productPreview" aria-label="Legak product preview">
            <div className="previewTop">
              <span>Employment data room</span>
              <strong>{ran ? 'Audit replayed' : 'Ready to run'}</strong>
            </div>
            <div className="previewGrid">
              <div className="fileStack">
                {files.slice(0, 4).map(([name, status]) => (
                  <div className="fileRow" key={name}>
                    <span>{name}</span>
                    <small>{status}</small>
                  </div>
                ))}
              </div>
              <div className="riskStack">
                <strong>Exposure</strong>
                <span>60k-99k EUR</span>
                <small>3 red flags, 1 missing document</small>
              </div>
            </div>
          </div>
        </section>

        <section id="product" className="band split">
          <div>
            <h2>Not a legal chatbot. An audit engine.</h2>
            <p>
              The LLM reads and drafts. Deterministic code verifies, calculates,
              and concludes. The expert arbitrates and signs. That split makes
              the report defensible, not just persuasive.
            </p>
          </div>
          <div className="principles">
            <span>Rule-by-rule control execution</span>
            <span>Dated legal parameters</span>
            <span>Literal citation verification</span>
            <span>Deal clauses proposed</span>
          </div>
        </section>

        <section id="demo" className="demoSection" aria-labelledby="demo-title">
          <div className="sectionHead">
            <h2 id="demo-title">48-hour MVP replay</h2>
            <button className="primaryButton" type="button" onClick={() => setRan(true)}>
              Run demo audit
            </button>
          </div>

          <div className="workflow">
            <div className="panel">
              <h3>1. Detected documents</h3>
              <div className="tableLike">
                {files.map(([name, status, meta]) => (
                  <div className="tableRow" key={name}>
                    <span>{name}</span>
                    <strong>{status}</strong>
                    <small>{meta}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h3>2. Agent state</h3>
              <ol className="checkList">
                {checks.map(([label, detail], index) => (
                  <li className={ran || index < 2 ? 'done' : ''} key={label}>
                    <strong>{label}</strong>
                    <span>{detail}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="panel resultPanel">
              <h3>3. Negotiation-ready report</h3>
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
              <article className="sourceBox">
                <div>
                  <span className={`riskPill ${selected.risk}`}>{selected.status}</span>
                  <h4>{selected.source}</h4>
                </div>
                <blockquote>{selected.quote}</blockquote>
                <p>{selected.clause}</p>
              </article>
            </div>
          </div>
        </section>

        <section id="deepmind" className="band deepmind">
          <div>
            <h2>Google DeepMind is the core, not an add-on.</h2>
            <p>
              The MVP stays reliable without secrets, then plugs into sponsor
              primitives as soon as temporary accounts arrive.
            </p>
          </div>
          <div className="deepmindGrid">
            <div>
              <h3>Interactions API / Antigravity</h3>
              <p>Persistent mission state, environment ID resume, live request list.</p>
            </div>
            <div>
              <h3>Gemini Computer Use</h3>
              <p>Clicks through the data room and opens the cited source passage.</p>
            </div>
            <div>
              <h3>Gemini Live Translate</h3>
              <p>Optional seller-call capture that creates a follow-up request.</p>
            </div>
          </div>
        </section>

        <section id="gtm" className="gtmSection">
          <div className="sectionHead">
            <h2>Business plan and GTM</h2>
            <p>
              France mid-market first, continental Europe next. M&A is the entry
              point; recurring employment compliance is the revenue base.
            </p>
          </div>
          <div className="businessGrid">
            {businessRows.map(([label, value]) => (
              <div className="businessItem" key={label}>
                <strong>{label}</strong>
                <span>{value}</span>
              </div>
            ))}
          </div>
          <div className="timeline">
            <div>
              <strong>Day 2</strong>
              <span>Reliable demo: provident scheme, vehicle benefit, source citation.</span>
            </div>
            <div>
              <strong>Month 1</strong>
              <span>3 design partners: fund, employment counsel, Transaction Services.</span>
            </div>
            <div>
              <strong>Month 3</strong>
              <span>Paid pilot on a live deal and 3 collective bargaining agreements.</span>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}

export default App
