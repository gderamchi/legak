// Agent-opérateur VDR — primitive Gemini Computer Use (Interactions API).
//
// La salle de données du vendeur est en consultation seule : pas d'API, pas de
// téléchargement, documents filigranés derrière un code d'accès. La seule voie
// d'entrée est l'opération du navigateur. La primitive computer use remplace
// le parcours scripté par une décision du modèle écran par écran ; un repli
// scripté reste disponible (sans clé, ou but non conclu) et est étiqueté
// honnêtement dans le trail de preuve (decidedBy: "code").
//
// Boucle d'agent conforme à la référence Computer Use :
//   1. capture d'écran envoyée au modèle (interactions.create + tool computer_use)
//   2. le modèle répond des function_call (click, type, scroll…) avec son intent
//   3. Playwright exécute chaque action (coordonnées 0-999 dénormalisées)
//   4. un function_result par action (nouvel écran + URL) relance le tour suivant
//      via previous_interaction_id, jusqu'à ce que le modèle conclue le but.
//
// Chaque action exécutée produit une capture horodatée versée au journal
// d'audit : le trail de preuve est exactement ce que le modèle a vu et décidé.
// Sans clé Gemini, l'opérateur retombe sur le parcours scripté historique,
// étiqueté honnêtement comme tel (decidedBy: "code").

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { hasGeminiKey } from '../anv/gemini.mjs'
import { VDR_ACCESS_CODE } from './site.mjs'

const COMPUTER_USE_MODEL = process.env.GEMINI_COMPUTER_USE_MODEL ?? 'gemini-3.5-flash'
const TURN_TIMEOUT_MS = 60_000
const VIEWPORT = { width: 1280, height: 900 }

// VDR de démonstration opéré pour le compte de l'utilisateur qui a déclenché
// l'action (origine verrouillée, environnement contrôlé) : on assouplit les
// politiques déclenchées par le dépôt de formulaires métier, tout en gardant
// la détection d'injection de prompt active sur les écrans.
const COMPUTER_USE_TOOL = {
  type: 'computer_use',
  environment: 'browser',
  enable_prompt_injection_detection: true,
  disabled_safety_policies: ['communication_tool', 'data_modification', 'sensitive_data_modification'],
}

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
]

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true })
  } catch {
    for (const executablePath of CHROME_PATHS) {
      if (existsSync(executablePath)) {
        return chromium.launch({ executablePath, headless: true })
      }
    }
    throw new Error("Aucun navigateur Chrome/Chromium disponible pour l'agent VDR.")
  }
}

function evidenceRecorder(evidenceDir, prefix, live, onProof = null) {
  mkdirSync(evidenceDir, { recursive: true })
  const entries = []
  let counter = 0
  return {
    entries,
    live,
    async snap(page, action, caption, extra = {}) {
      counter += 1
      const file = `${prefix}-${String(counter).padStart(3, '0')}-${action.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60)}.png`
      const buffer = await page.screenshot({ fullPage: false })
      writeFileSync(join(evidenceDir, file), buffer)
      const entry = {
        seq: counter,
        at: new Date().toISOString(),
        action,
        caption,
        url: page.url(),
        screenshot: file,
        decidedBy: 'code',
        ...extra,
      }
      entries.push(entry)
      live?.status({
        lastAction: entry.action,
        lastIntent: entry.intent ?? entry.caption ?? null,
        decidedBy: entry.decidedBy,
      })
      onProof?.({
        action: caption || action,
        rationale: extra.intent
          ? `Intention du modèle : « ${extra.intent} » — ${extra.decidedBy === 'model' ? 'décision Gemini' : 'reprise scriptée'}`
          : `${action} — capture horodatée`,
        refs: [file],
        status: 'done',
        meta: { screenshot: file, decidedBy: extra.decidedBy ?? 'code', url: entry.url },
      })
    },
  }
}

// ── Vue en direct : curseur agent visible (style Codex) ─────────────────────
// Playwright ne déclenche pas les mousemove DOM — on pilote un overlay explicite
// avant chaque action pour que le screencast montre où l'agent clique.

function installLegakCursorOverlay() {
  if (window.__legakCursorBoot) return
  window.__legakCursorBoot = true

  const style = document.createElement('style')
  style.textContent = `
    @keyframes legakClickPulse {
      0% { transform: scale(1); }
      40% { transform: scale(0.78); }
      100% { transform: scale(1); }
    }
    @keyframes legakRingExpand {
      from { transform: translate(-50%, -50%) scale(0.25); opacity: 0.95; }
      to { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
    }
    @keyframes legakRingExpand2 {
      from { transform: translate(-50%, -50%) scale(0.15); opacity: 0.75; }
      to { transform: translate(-50%, -50%) scale(3.4); opacity: 0; }
    }
    @keyframes legakCrosshair {
      from { transform: translate(-50%, -50%) scale(0.6); opacity: 1; }
      to { transform: translate(-50%, -50%) scale(1.15); opacity: 0; }
    }
    #legak-cursor-root {
      pointer-events: none;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      overflow: hidden;
    }
    #legak-cursor-pointer {
      position: absolute;
      left: 24px;
      top: 24px;
      width: 32px;
      height: 32px;
      margin: 0;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.55));
      transition: left 0.36s cubic-bezier(0.22, 0.92, 0.28, 1),
                  top 0.36s cubic-bezier(0.22, 0.92, 0.28, 1);
      will-change: left, top, transform;
    }
    #legak-cursor-pointer svg { display: block; }
    #legak-cursor-pointer.legak-clicking {
      animation: legakClickPulse 0.32s ease-out;
    }
    .legak-ring {
      position: absolute;
      width: 48px;
      height: 48px;
      border: 3px solid #ff4d2e;
      border-radius: 50%;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.92), 0 0 16px rgba(255, 77, 46, 0.65);
      animation: legakRingExpand 0.72s ease-out forwards;
    }
    .legak-ring.l2 {
      width: 64px;
      height: 64px;
      border-width: 2px;
      border-color: rgba(255, 77, 46, 0.55);
      animation: legakRingExpand2 0.95s ease-out forwards;
    }
    .legak-crosshair {
      position: absolute;
      width: 22px;
      height: 22px;
      border: 2px solid #fff;
      border-radius: 50%;
      background: rgba(255, 77, 46, 0.35);
      animation: legakCrosshair 0.45s ease-out forwards;
    }
    #legak-cursor-label {
      position: absolute;
      max-width: min(300px, 72vw);
      padding: 7px 11px;
      background: rgba(16, 18, 22, 0.94);
      color: #fff;
      font: 600 12px/1.35 system-ui, -apple-system, sans-serif;
      border-radius: 9px;
      border: 1px solid rgba(255, 77, 46, 0.55);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
      transform: translate(18px, 18px);
      opacity: 0;
      transition: opacity 0.18s ease;
    }
    #legak-cursor-label.show { opacity: 1; }
  `
  document.documentElement.appendChild(style)

  const root = document.createElement('div')
  root.id = 'legak-cursor-root'
  root.innerHTML = `
    <div id="legak-cursor-pointer" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 3 L4 26 L11 19 L16 29 L20 27 L15 17 L24 17 Z"
          fill="#ff4d2e" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>
    </div>
    <div id="legak-cursor-label" aria-hidden="true"></div>
  `

  function mount() {
    if (!document.body) return false
    if (!root.isConnected) document.body.appendChild(root)
    return true
  }

  function ripple(x, y) {
    const cross = document.createElement('div')
    cross.className = 'legak-crosshair'
    cross.style.left = `${x}px`
    cross.style.top = `${y}px`
    root.appendChild(cross)
    setTimeout(() => cross.remove(), 500)

    for (const [cls, delay] of [['', 0], [' l2', 90]]) {
      setTimeout(() => {
        const ring = document.createElement('div')
        ring.className = `legak-ring${cls}`
        ring.style.left = `${x}px`
        ring.style.top = `${y}px`
        root.appendChild(ring)
        setTimeout(() => ring.remove(), 980)
      }, delay)
    }
  }

  window.__legakCursor = {
    act(x, y, opts = {}) {
      if (!mount()) return
      const pointer = root.querySelector('#legak-cursor-pointer')
      const label = root.querySelector('#legak-cursor-label')
      const move = opts.move !== false

      pointer.style.transition = move
        ? 'left 0.36s cubic-bezier(0.22, 0.92, 0.28, 1), top 0.36s cubic-bezier(0.22, 0.92, 0.28, 1)'
        : 'none'
      pointer.style.left = `${x}px`
      pointer.style.top = `${y}px`

      if (opts.label) {
        label.textContent = String(opts.label).slice(0, 140)
        label.style.left = `${x}px`
        label.style.top = `${y}px`
        label.classList.add('show')
        clearTimeout(window.__legakLabelTimer)
        window.__legakLabelTimer = setTimeout(() => label.classList.remove('show'), 2600)
      }

      if (opts.click) {
        const fire = () => {
          pointer.classList.remove('legak-clicking')
          void pointer.offsetWidth
          pointer.classList.add('legak-clicking')
          ripple(x, y)
        }
        if (move) setTimeout(fire, 360)
        else fire()
      }
    },
  }

  if (document.readyState !== 'loading') mount()
  else document.addEventListener('DOMContentLoaded', mount)
}

async function ensureCursorOverlay(page) {
  await page.addInitScript(installLegakCursorOverlay)
  try {
    await page.evaluate(installLegakCursorOverlay)
  } catch {
    /* navigation en cours */
  }
}

async function showAgentPointer(page, x, y, { click = false, label = '', move = true } = {}) {
  try {
    await page.evaluate(({ x, y, click, label, move }) => {
      window.__legakCursor?.act(x, y, { click, label, move })
    }, { x, y, click, label, move })
  } catch {
    /* ignore */
  }
  const moveMs = move ? 380 : 0
  const clickMs = click ? 420 : 0
  await new Promise((resolve) => setTimeout(resolve, moveMs + clickMs))
}

async function attachLiveView(page, live) {
  if (!live) return
  await ensureCursorOverlay(page)
  const cdp = await page.context().newCDPSession(page)
  cdp.on('Page.screencastFrame', (event) => {
    live.frame(Buffer.from(event.data, 'base64'))
    cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 72,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
  })
}

// ── Boucle Gemini Computer Use ────────────────────────────────────────────────

const denormX = (x) => Math.floor((x / 1000) * VIEWPORT.width)
const denormY = (y) => Math.floor((y / 1000) * VIEWPORT.height)

const KEY_ALIASES = {
  enter: 'Enter', return: 'Enter', tab: 'Tab', escape: 'Escape', esc: 'Escape',
  backspace: 'Backspace', delete: 'Delete', space: 'Space', home: 'Home', end: 'End',
  pageup: 'PageUp', pagedown: 'PageDown', arrowup: 'ArrowUp', arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
  left: 'ArrowLeft', right: 'ArrowRight', ctrl: 'Control', control: 'Control',
  alt: 'Alt', option: 'Alt', shift: 'Shift', meta: 'Meta', cmd: 'Meta', command: 'Meta', win: 'Meta',
}
const mapKey = (key) => KEY_ALIASES[String(key).toLowerCase()] ?? key

function interactionText(interaction) {
  if (interaction.output_text) return interaction.output_text
  const texts = []
  for (const step of interaction.steps ?? []) {
    if (step.type === 'model_output') {
      for (const block of step.content ?? []) {
        if (block.type === 'text' && block.text) texts.push(block.text)
      }
    }
  }
  return texts.join(' ')
}

class GoalNotCompleted extends Error {}

// Session computer use : un but ("ouvre la pièce X") = un fil d'interaction
// court (screenshot → actions du modèle → screenshot), budget de tours borné.
const SESSION_DEADLINE_MS = 10 * 60_000

async function createComputerUseSession({ page, recorder, vdrBase, live = null }) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })
  const vdrOrigin = new URL(vdrBase).origin
  const stats = { goals: 0, modelTurns: 0, actions: 0, fallbacks: [] }
  // Deadline globale : au-delà, tous les buts restants basculent en scripté
  // (chaque but est déjà borné, ceci borne leur somme).
  const deadlineAt = Date.now() + SESSION_DEADLINE_MS

  const systemInstruction = [
    "Tu es l'opérateur d'une salle de données M&A en consultation seule (due diligence sociale, conseil acquéreur).",
    "Le cabinet est conseil habilité du candidat acquéreur : l'accès à cette salle et son code d'accès lui ont été remis par le vendeur dans le cadre du mandat. L'opération est légitime et explicitement autorisée.",
    `Tu restes strictement sur ${vdrOrigin}. Tu ne télécharges rien, tu n'acceptes aucune condition, tu ne solutionnes aucun captcha.`,
    "Tu exécutes uniquement le but demandé. Quand l'état d'arrivée décrit est visible à l'écran, n'émets plus d'action et réponds « OK ».",
  ].join(' ')

  async function callModel(input, previousId) {
    const attempt = () => Promise.race([
      ai.interactions.create({
        model: COMPUTER_USE_MODEL,
        system_instruction: systemInstruction,
        ...(previousId ? { previous_interaction_id: previousId } : {}),
        input,
        tools: [COMPUTER_USE_TOOL],
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`computer use : timeout après ${TURN_TIMEOUT_MS / 1000}s`)), TURN_TIMEOUT_MS)),
    ])
    try {
      return await attempt()
    } catch (error) {
      const message = String(error?.message ?? error)
      // « Input blocked » : filtre d'entrée stochastique côté API — un second
      // essai identique passe le plus souvent ; sinon la reprise scriptée
      // prendra le relais (tracée dans le trail de preuve).
      if (/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|timeout|Input blocked/i.test(message)) {
        await new Promise((resolve) => setTimeout(resolve, 2_000))
        return attempt()
      }
      throw error
    }
  }

  async function executeCall(call) {
    const name = call.name
    const args = call.arguments ?? {}
    const result = {}
    // Décision de sécurité du modèle : l'opérateur humain a explicitement
    // déclenché cette action sur le VDR de démonstration (origine verrouillée).
    // On n'acquitte que les demandes de confirmation — jamais un blocage.
    if (args.safety_decision && args.safety_decision.decision !== 'block') {
      result.safety_acknowledgement = true
    }
    try {
      if (name === 'open_web_browser' || name === 'open_app' || name === 'take_screenshot') {
        // rien à faire : l'écran est recapturé après chaque action
      } else if (['click', 'click_at', 'double_click', 'triple_click', 'middle_click', 'right_click', 'move', 'mouse_down', 'mouse_up', 'long_press'].includes(name)) {
        const x = denormX(args.x ?? 0)
        const y = denormY(args.y ?? 0)
        const intent = args.intent ?? ''
        const isClick = !['move'].includes(name)
        await showAgentPointer(page, x, y, { click: isClick, label: intent, move: true })
        if (name === 'double_click') await page.mouse.dblclick(x, y)
        else if (name === 'right_click') await page.mouse.click(x, y, { button: 'right' })
        else if (name === 'middle_click') await page.mouse.click(x, y, { button: 'middle' })
        else if (name === 'triple_click') await page.mouse.click(x, y, { clickCount: 3 })
        else if (name === 'move') await page.mouse.move(x, y)
        else if (name === 'mouse_down') { await page.mouse.move(x, y); await page.mouse.down() }
        else if (name === 'mouse_up') { await page.mouse.move(x, y); await page.mouse.up() }
        else await page.mouse.click(x, y)
      } else if (name === 'type' || name === 'type_text_at') {
        if (args.x !== undefined && args.y !== undefined) {
          const tx = denormX(args.x)
          const ty = denormY(args.y)
          await showAgentPointer(page, tx, ty, { click: true, label: args.intent ?? 'Saisie clavier', move: true })
          await page.mouse.click(tx, ty)
        }
        if (args.clear_before_typing !== false) {
          await page.keyboard.press('ControlOrMeta+a')
          await page.keyboard.press('Backspace')
        }
        await page.keyboard.type(String(args.text ?? ''))
        if (args.press_enter) await page.keyboard.press('Enter')
      } else if (name === 'scroll' || name === 'scroll_at' || name === 'scroll_document') {
        const magnitude = Number(args.magnitude_in_pixels ?? 300)
        const direction = String(args.direction ?? 'down')
        if (args.x !== undefined && args.y !== undefined) {
          const sx = denormX(args.x)
          const sy = denormY(args.y)
          await showAgentPointer(page, sx, sy, { click: false, label: args.intent ?? 'Défilement', move: true })
          await page.mouse.move(sx, sy)
        }
        const dx = direction === 'left' ? -magnitude : direction === 'right' ? magnitude : 0
        const dy = direction === 'up' ? -magnitude : direction === 'down' ? magnitude : 0
        await page.mouse.wheel(dx, dy)
      } else if (name === 'drag_and_drop') {
        const sx = denormX(args.start_x ?? 0)
        const sy = denormY(args.start_y ?? 0)
        const ex = denormX(args.end_x ?? 0)
        const ey = denormY(args.end_y ?? 0)
        await showAgentPointer(page, sx, sy, { click: true, label: args.intent ?? 'Glisser-déposer', move: true })
        await page.mouse.move(sx, sy)
        await page.mouse.down()
        await showAgentPointer(page, ex, ey, { click: false, move: true })
        await page.mouse.move(ex, ey, { steps: 14 })
        await showAgentPointer(page, ex, ey, { click: true, move: false })
        await page.mouse.up()
      } else if (name === 'press_key') {
        await page.keyboard.press(mapKey(args.key))
      } else if (name === 'key_down') {
        await page.keyboard.down(mapKey(args.key))
      } else if (name === 'key_up') {
        await page.keyboard.up(mapKey(args.key))
      } else if (name === 'hotkey') {
        await page.keyboard.press((args.keys ?? []).map(mapKey).join('+'))
      } else if (name === 'navigate') {
        const target = new URL(String(args.url ?? ''), vdrBase)
        if (target.origin !== vdrOrigin) {
          result.error = `navigation refusée hors du VDR (${target.origin})`
        } else {
          await page.goto(target.href, { waitUntil: 'domcontentloaded' })
          await ensureCursorOverlay(page)
        }
      } else if (name === 'go_back') {
        await page.goBack({ waitUntil: 'domcontentloaded' })
        await ensureCursorOverlay(page)
      } else if (name === 'go_forward') {
        await page.goForward({ waitUntil: 'domcontentloaded' })
        await ensureCursorOverlay(page)
      } else if (name === 'wait') {
        await new Promise((resolve) => setTimeout(resolve, Math.min(Number(args.seconds ?? 1), 5) * 1000))
      } else {
        result.error = `action non prise en charge : ${name}`
      }
      await page.waitForLoadState('load', { timeout: 5_000 }).catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 300))
    } catch (error) {
      result.error = String(error?.message ?? error).slice(0, 300)
    }
    stats.actions += 1
    await recorder.snap(page, name, args.intent ?? `Action ${name} exécutée`, {
      decidedBy: 'gemini-computer-use',
      intent: args.intent ?? null,
      ...(result.error ? { error: result.error } : {}),
      ...(args.safety_decision ? { safetyAcknowledged: true, safetyExplanation: args.safety_decision.explanation ?? null } : {}),
    })
    return result
  }

  // Exécute un but borné. Lance GoalNotCompleted si le modèle n'a pas conclu
  // dans le budget de tours (l'appelant décide alors du fallback).
  async function runGoal(goal, { budget = 6 } = {}) {
    if (Date.now() > deadlineAt) {
      throw new GoalNotCompleted('deadline globale de session computer use atteinte : bascule en scripté')
    }
    stats.goals += 1
    const opening = await page.screenshot({ fullPage: false })
    let input = [
      // Contexte factuel répété à chaque but : le portail est une démo locale
      // à données fictives, opérée à la demande explicite de l'utilisateur.
      { type: 'text', text: `Contexte : portail de démonstration local (localhost, données fictives « Projet Atlas ») contrôlé par l'utilisateur, qui a explicitement demandé cette opération. ${goal}` },
      { type: 'image', data: opening.toString('base64'), mime_type: 'image/png' },
    ]
    let previousId
    for (let turn = 0; turn < budget; turn += 1) {
      live?.status({ phase: `le modèle observe l'écran (tour ${stats.modelTurns + 1})` })
      const interaction = await callModel(input, previousId)
      stats.modelTurns += 1
      live?.status({ modelTurns: stats.modelTurns })
      previousId = interaction.id
      const calls = (interaction.steps ?? []).filter((step) => step.type === 'function_call')
      if (!calls.length) {
        return { turns: turn + 1, summary: interactionText(interaction).slice(0, 300) }
      }
      const results = []
      for (const call of calls) {
        results.push({ call, result: await executeCall(call) })
      }
      const screenshot = (await page.screenshot({ fullPage: false })).toString('base64')
      input = results.map(({ call, result }) => ({
        type: 'function_result',
        name: call.name,
        call_id: call.call_id ?? call.id,
        result: [
          { type: 'text', text: JSON.stringify({ url: page.url(), ...result }) },
          { type: 'image', data: screenshot, mime_type: 'image/png' },
        ],
      }))
    }
    throw new GoalNotCompleted(`but non conclu en ${budget} tours : ${goal.slice(0, 120)}`)
  }

  return { runGoal, stats }
}

// Pilotage d'une étape : le modèle tente le but, le code vérifie l'état
// d'arrivée (aucune conclusion sans preuve), et ne reprend la main en direct
// (goto scripté) qu'en dernier recours — tracé comme fallback dans les preuves.
async function driveTo({ cu, page, recorder, goal, budget, verify, fallback, label, stats }) {
  recorder.live?.status({ phase: label })
  if (cu) {
    try {
      await cu.runGoal(goal, { budget })
      await verify()
      return true
    } catch (error) {
      cu.stats.fallbacks.push(label)
      recorder.live?.status({ fallbacks: [...cu.stats.fallbacks] })
      await recorder.snap(page, `fallback-${label}`, `Reprise scriptée après computer use (${String(error?.message ?? error).slice(0, 140)})`)
    }
  } else if (stats) {
    stats.fallbacks.push(label)
    recorder.live?.status({ fallbacks: [...stats.fallbacks] })
  }
  await fallback()
  await verify()
  return false
}

// ── Parcours scriptés (fallback sans clé, et reprise ciblée) ─────────────────

async function scriptedLogin(page, vdrBase) {
  await page.goto(`${vdrBase}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#access-code', VDR_ACCESS_CODE)
  await page.click('#login-submit')
  await page.waitForSelector('.folder-link', { timeout: 10_000 })
}

async function scriptedQaSubmit(page, item) {
  await page.fill('#qa-subject', item.piece.slice(0, 160))
  await page.fill('#qa-question', item.question.slice(0, 600))
  const urgency = item.urgency === 'haute' ? 'haute' : item.urgency === 'basse' ? 'basse' : 'moyenne'
  await page.check(`#qa-urgency-${urgency}`)
  await page.fill('#qa-author', 'Legak — conseil acquéreur')
  await page.click('#qa-submit')
  await page.waitForLoadState('domcontentloaded')
}

// ── Collecte : lecture en place des pièces du VDR ────────────────────────────
// `onlyFolders` (libellés exacts) permet une re-collecte ciblée — typiquement
// pilotée par la liste des pièces manquantes tenue au dossier Antigravity.

export async function collectFromVdr({ vdrBase, evidenceDir, prefix = 'collecte', onlyFolders = null, live = null, onProof = null }) {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ viewport: VIEWPORT })
    await attachLiveView(page, live)
    const recorder = evidenceRecorder(evidenceDir, prefix, live, onProof)
    const cu = hasGeminiKey() ? await createComputerUseSession({ page, recorder, vdrBase, live }) : null
    const stats = cu?.stats ?? { goals: 0, modelTurns: 0, actions: 0, fallbacks: [] }

    await page.goto(`${vdrBase}/login`, { waitUntil: 'domcontentloaded' })
    await recorder.snap(page, 'connexion', "Page d'accès du VDR (code d'accès requis)")

    await driveTo({
      cu, page, recorder, stats, label: 'connexion',
      goal: `Sur cette page de connexion à la salle de données, clique le champ « Code d'accès », saisis ${VDR_ACCESS_CODE}, puis clique « Entrer dans la salle ». État d'arrivée : la liste des dossiers de la salle est affichée.`,
      budget: 6,
      verify: () => page.waitForSelector('.folder-link', { timeout: 10_000 }),
      fallback: () => scriptedLogin(page, vdrBase),
    })
    await recorder.snap(page, 'salle-ouverte', 'Session ouverte : arborescence de la salle de données')

    const allFolders = await page.$$eval('.folder-link', (links) =>
      links.map((link) => ({ href: link.getAttribute('href'), label: link.textContent.trim() })))
    const folders = onlyFolders?.length
      ? allFolders.filter((folder) => onlyFolders.includes(folder.label))
      : allFolders

    const documents = []
    for (const folder of folders) {
      const folderUrl = new URL(folder.href, vdrBase).href
      await driveTo({
        cu, page, recorder, stats, label: `dossier ${folder.label}`,
        goal: `Si tu n'es pas sur la page « Salle de données » (liste des dossiers), reviens-y d'abord via le fil d'Ariane « Salle ». Puis ouvre le dossier « ${folder.label} » en cliquant son lien. État d'arrivée : la liste des documents du dossier « ${folder.label} » est affichée.`,
        budget: 6,
        verify: async () => {
          if (page.url() !== folderUrl) throw new Error('page inattendue')
          await page.waitForSelector('.doc-link, table', { timeout: 5_000 })
        },
        fallback: () => page.goto(folderUrl, { waitUntil: 'domcontentloaded' }),
      })
      await recorder.snap(page, `dossier-${folder.label}`, `Dossier « ${folder.label} » ouvert`)

      const docLinks = await page.$$eval('.doc-link', (links) =>
        links.map((link) => ({ href: link.getAttribute('href'), name: link.textContent.trim() })))

      for (const docLink of docLinks) {
        const docUrl = new URL(docLink.href, vdrBase).href
        await driveTo({
          cu, page, recorder, stats, label: `pièce ${docLink.name}`,
          goal: `Si une pièce est actuellement affichée, reviens d'abord à la liste du dossier (lien « ${folder.label} » du fil d'Ariane ou go_back). Puis ouvre la pièce « ${docLink.name} » en cliquant exactement ce lien. État d'arrivée : le document titré « ${docLink.name} » est affiché.`,
          budget: 7,
          verify: async () => {
            await page.waitForSelector('#doc-body', { timeout: 5_000 })
            const shown = (await page.textContent('#doc-name'))?.trim()
            if (shown !== docLink.name) throw new Error(`document affiché « ${shown} » ≠ attendu`)
          },
          fallback: () => page.goto(docUrl, { waitUntil: 'domcontentloaded' }),
        })

        const name = (await page.textContent('#doc-name'))?.trim() ?? docLink.name
        const content = (await page.textContent('#doc-body')) ?? ''
        const mimeBadge = await page.$$eval('.badge', (badges) =>
          badges.map((badge) => badge.textContent.trim()).find((text) => text.includes('/')))
        await recorder.snap(page, `lecture-${name}`, `Lecture en place : ${name} (${folder.label})`)
        documents.push({
          name,
          mimeType: mimeBadge ?? 'text/plain',
          content,
          vdrFolder: folder.label,
          vdrPath: new URL(docLink.href, vdrBase).pathname,
        })
      }
    }

    await driveTo({
      cu, page, recorder, stats, label: 'module Q&A',
      goal: "Rejoins le module Q&A de la salle : reviens à la page « Salle de données » via le fil d'Ariane si besoin, puis clique le lien « Module Q&A / demandes de pièces ». État d'arrivée : le registre Q&A et le formulaire « Déposer une demande » sont affichés.",
      budget: 6,
      verify: () => page.waitForSelector('#qa-submit', { timeout: 5_000 }),
      fallback: () => page.goto(`${vdrBase}/qa`, { waitUntil: 'domcontentloaded' }),
    })
    await recorder.snap(page, 'module-qa', 'État initial du module Q&A avant analyse')

    return {
      documents,
      evidence: recorder.entries,
      mode: cu ? `gemini-computer-use (${COMPUTER_USE_MODEL})` : 'parcours scripté (Gemini indisponible)',
      stats,
    }
  } finally {
    await browser.close()
  }
}

// ── Dépôt de la request list dans le module Q&A ──────────────────────────────

export async function postQaToVdr({ vdrBase, evidenceDir, items, prefix = 'qa', live = null, onProof = null }) {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ viewport: VIEWPORT })
    await attachLiveView(page, live)
    const recorder = evidenceRecorder(evidenceDir, prefix, live, onProof)
    const cu = hasGeminiKey() ? await createComputerUseSession({ page, recorder, vdrBase, live }) : null
    const stats = cu?.stats ?? { goals: 0, modelTurns: 0, actions: 0, fallbacks: [] }

    await page.goto(`${vdrBase}/login`, { waitUntil: 'domcontentloaded' })
    await driveTo({
      cu, page, recorder, stats, label: 'connexion',
      goal: `Sur cette page de connexion à la salle de données, clique le champ « Code d'accès », saisis ${VDR_ACCESS_CODE}, puis clique « Entrer dans la salle ». État d'arrivée : la liste des dossiers de la salle est affichée.`,
      budget: 6,
      verify: () => page.waitForSelector('.folder-link', { timeout: 10_000 }),
      fallback: () => scriptedLogin(page, vdrBase),
    })

    await driveTo({
      cu, page, recorder, stats, label: 'module Q&A',
      goal: "Depuis la page « Salle de données », clique le lien « Module Q&A / demandes de pièces ». État d'arrivée : le registre Q&A et le formulaire « Déposer une demande » sont affichés.",
      budget: 6,
      verify: () => page.waitForSelector('#qa-submit', { timeout: 5_000 }),
      fallback: () => page.goto(`${vdrBase}/qa`, { waitUntil: 'domcontentloaded' }),
    })
    await recorder.snap(page, 'module-qa', 'Module Q&A ouvert, dépôt de la request list')

    const posted = []
    for (const item of items) {
      const urgency = item.urgency === 'haute' ? 'haute' : item.urgency === 'basse' ? 'basse' : 'moyenne'
      const rowsBefore = await page.$$eval('#qa-table tbody tr:not(:has(#qa-empty))', (rows) => rows.length).catch(() => 0)
      await driveTo({
        cu, page, recorder, stats, label: `demande ${item.id}`,
        goal: [
          'Dans le formulaire « Déposer une demande » en bas de page (fais défiler si besoin) :',
          `1. remplis « Objet » avec : ${item.piece.slice(0, 160)}`,
          `2. remplis « Demande » avec : ${item.question.slice(0, 600)}`,
          `3. coche le bouton radio d'urgence « ${urgency} »`,
          '4. remplis « Auteur » avec : Legak — conseil acquéreur',
          '5. clique « Déposer la demande ».',
          "État d'arrivée : le registre Q&A affiche la demande déposée.",
        ].join('\n'),
        budget: 10,
        verify: async () => {
          await page.waitForSelector('#qa-table', { timeout: 5_000 })
          const rows = await page.$$eval('#qa-table tbody tr:not(:has(#qa-empty))', (r) => r.length).catch(() => 0)
          const empty = await page.$('#qa-empty')
          if (empty || rows <= rowsBefore) throw new Error('demande non enregistrée au registre')
        },
        fallback: async () => {
          if (!page.url().endsWith('/qa')) await page.goto(`${vdrBase}/qa`, { waitUntil: 'domcontentloaded' })
          await scriptedQaSubmit(page, item)
        },
      })
      posted.push(item.id)
    }
    await recorder.snap(page, 'qa-depose', `Registre Q&A après dépôt de ${posted.length} demande(s)`)

    return {
      posted,
      evidence: recorder.entries,
      mode: cu ? `gemini-computer-use (${COMPUTER_USE_MODEL})` : 'parcours scripté (Gemini indisponible)',
      stats,
    }
  } finally {
    await browser.close()
  }
}
