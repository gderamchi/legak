// Portail VDR de démonstration (côté vendeur) : salle de données "Projet Atlas".
// Contrainte réaliste : les pièces sont consultables en place uniquement (pas
// d'URL de téléchargement brut), filigranées, derrière un code d'accès. C'est
// cette contrainte qui justifie un agent-opérateur en computer use : il doit se
// connecter, naviguer et lire les documents dans le navigateur, comme un humain.

import { randomUUID } from 'node:crypto'
import { demoDataRoom, demoTarget } from '../anv/demo-data.mjs'

export const VDR_ACCESS_CODE = 'ATLAS-2026'
const SESSION_COOKIE = 'vdr_session'
const sessions = new Set()

const folderFor = (name) => {
  if (name.startsWith('contexte')) return { id: 'corporate', label: '01 Corporate' }
  if (name.startsWith('flotte')) return { id: 'flotte', label: '02 Social — Flotte' }
  if (name.startsWith('journal_paie')) return { id: 'paie', label: '02 Social — Paie' }
  if (name.startsWith('politique')) return { id: 'politiques', label: '02 Social — Politiques' }
  if (name.startsWith('avenant')) return { id: 'avenants', label: '02 Social — Avenants' }
  if (name.startsWith('carte_grise')) return { id: 'cartes-grises', label: '02 Social — Cartes grises' }
  if (name.startsWith('contrat_lld')) return { id: 'contrats-location', label: '02 Social — Contrats de location' }
  return { id: 'divers', label: '99 Divers' }
}

const documents = demoDataRoom().map((doc, index) => {
  const folder = folderFor(doc.name)
  return {
    id: `vdoc-${String(index + 1).padStart(3, '0')}`,
    name: doc.name,
    mimeType: doc.mimeType,
    content: doc.content,
    folderId: folder.id,
    folderLabel: folder.label,
    addedAt: '2026-06-28',
  }
})

const folders = [...new Map(documents.map((d) => [d.folderId, { id: d.folderId, label: d.folderLabel }])).values()]

const qaEntries = []

function page(title, body, { watermark = true } = {}) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Atlas VDR</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 -apple-system, 'Segoe UI', sans-serif; background: #eef1f5; color: #1e2733; }
  .top { background: #16324f; color: #fff; padding: 12px 22px; display: flex; justify-content: space-between; align-items: center; }
  .top strong { letter-spacing: 0.06em; }
  .top small { opacity: 0.75; }
  .wrap { max-width: 1080px; margin: 26px auto; padding: 0 22px; position: relative; }
  .card { background: #fff; border: 1px solid #d4dbe4; border-radius: 8px; padding: 20px 24px; margin-bottom: 18px; position: relative; overflow: hidden; }
  a { color: #16528f; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e3e8ef; vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #5b6b7d; }
  input, select, textarea { width: 100%; padding: 8px 10px; border: 1px solid #c3ccd8; border-radius: 6px; font: inherit; }
  button { background: #16324f; color: #fff; border: 0; border-radius: 6px; padding: 9px 18px; font: inherit; cursor: pointer; }
  pre.docBody { background: #fbfcfe; border: 1px solid #e3e8ef; border-radius: 6px; padding: 16px; white-space: pre-wrap; word-break: break-word; font-size: 12.5px; }
  .crumbs { font-size: 13px; margin-bottom: 14px; }
  .notice { font-size: 12.5px; color: #7a4d12; background: #fdf3e3; border: 1px solid #eeD9b0; border-radius: 6px; padding: 8px 12px; margin: 10px 0 0; }
  .badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #e6edf5; color: #16528f; margin-left: 8px; }
  ${watermark ? `.card::after { content: 'CONFIDENTIEL — PROJET ATLAS — CONSULTATION SEULE'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; transform: rotate(-24deg); font-size: 26px; font-weight: 700; color: rgba(22, 50, 79, 0.07); pointer-events: none; white-space: nowrap; }` : ''}
</style>
</head>
<body>
<div class="top"><strong>ATLAS VDR</strong><small>Portail vendeur — ${demoTarget.target}</small></div>
<div class="wrap">${body}</div>
</body>
</html>`
}

function hasSession(req) {
  const cookies = req.headers.cookie ?? ''
  return cookies.split(';').some((chunk) => {
    const [key, value] = chunk.trim().split('=')
    return key === SESSION_COOKIE && sessions.has(value)
  })
}

function redirect(res, location, cookie) {
  const headers = { location }
  if (cookie) headers['set-cookie'] = cookie
  res.writeHead(302, headers)
  res.end()
}

function html(res, body, status = 200) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 1_000_000) {
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', () => resolve(''))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Handler monté sur /vdr/* — retourne true si la requête a été traitée.
export async function handleVdr(req, res, url) {
  if (!url.pathname.startsWith('/vdr')) return false
  const path = url.pathname

  if (path === '/vdr' || path === '/vdr/') return redirect(res, '/vdr/login'), true

  if (path === '/vdr/login' && req.method === 'GET') {
    html(res, page('Connexion', `
      <div class="card" style="max-width:420px;margin:60px auto;">
        <h1>Accès à la salle de données</h1>
        <p>Projet Atlas — accès réservé aux conseils habilités.</p>
        <form method="post" action="/vdr/login">
          <label>Code d'accès<br><input id="access-code" name="code" type="password" placeholder="Code d'accès" required></label>
          <p><button id="login-submit" type="submit">Entrer dans la salle</button></p>
        </form>
      </div>`, { watermark: false }))
    return true
  }

  if (path === '/vdr/login' && req.method === 'POST') {
    const body = await readBody(req)
    const params = new URLSearchParams(body)
    if (params.get('code') === VDR_ACCESS_CODE) {
      const token = randomUUID()
      sessions.add(token)
      setTimeout(() => sessions.delete(token), 4 * 3600 * 1000).unref()
      redirect(res, '/vdr/room', `${SESSION_COOKIE}=${token}; Path=/vdr; HttpOnly; SameSite=Lax; Max-Age=14400`)
    } else {
      html(res, page('Connexion', `<div class="card"><h1>Code invalide</h1><p><a href="/vdr/login">Réessayer</a></p></div>`, { watermark: false }), 403)
    }
    return true
  }

  if (!hasSession(req)) return redirect(res, '/vdr/login'), true

  if (path === '/vdr/room') {
    const rows = folders.map((folder) => {
      const count = documents.filter((d) => d.folderId === folder.id).length
      return `<tr><td><a class="folder-link" href="/vdr/folder/${folder.id}">${folder.label}</a></td><td>${count} document(s)</td></tr>`
    }).join('')
    html(res, page('Salle de données', `
      <div class="card">
        <h1>Salle de données — Projet Atlas</h1>
        <p>Cible : ${demoTarget.target} (SIREN ${demoTarget.siren}) <span class="badge">consultation seule</span></p>
        <table><thead><tr><th>Dossier</th><th>Contenu</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="notice">Le téléchargement des pièces est désactivé par le vendeur. Les documents sont consultables en ligne uniquement.</p>
        <p><a href="/vdr/qa">Module Q&amp;A / demandes de pièces</a></p>
      </div>`))
    return true
  }

  const folderMatch = path.match(/^\/vdr\/folder\/([a-z-]+)$/)
  if (folderMatch) {
    const folder = folders.find((f) => f.id === folderMatch[1])
    if (!folder) return html(res, page('Introuvable', '<div class="card"><h1>Dossier introuvable</h1></div>'), 404), true
    const rows = documents.filter((d) => d.folderId === folder.id)
      .map((d) => `<tr><td><a class="doc-link" href="/vdr/doc/${d.id}">${d.name}</a></td><td>${d.mimeType}</td><td>${d.addedAt}</td></tr>`)
      .join('')
    html(res, page(folder.label, `
      <div class="crumbs"><a href="/vdr/room">Salle</a> › ${folder.label}</div>
      <div class="card">
        <h1>${folder.label}</h1>
        <table><thead><tr><th>Document</th><th>Format</th><th>Ajouté le</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`))
    return true
  }

  const docMatch = path.match(/^\/vdr\/doc\/(vdoc-\d{3})$/)
  if (docMatch) {
    const doc = documents.find((d) => d.id === docMatch[1])
    if (!doc) return html(res, page('Introuvable', '<div class="card"><h1>Document introuvable</h1></div>'), 404), true
    html(res, page(doc.name, `
      <div class="crumbs"><a href="/vdr/room">Salle</a> › <a href="/vdr/folder/${doc.folderId}">${doc.folderLabel}</a> › ${doc.name}</div>
      <div class="card">
        <h1 id="doc-name">${doc.name}</h1>
        <p><span class="badge">consultation seule</span><span class="badge">${doc.mimeType}</span><span class="badge" id="doc-id">${doc.id}</span></p>
        <pre class="docBody" id="doc-body">${doc.content.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>
        <p class="notice">Téléchargement désactivé. Toute consultation est journalisée par le vendeur.</p>
      </div>`))
    return true
  }

  if (path === '/vdr/qa' && req.method === 'GET') {
    const rows = qaEntries.length
      ? qaEntries.map((entry, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(entry.subject)}</td><td>${escapeHtml(entry.question)}</td><td>${escapeHtml(entry.urgency)}</td><td>${escapeHtml(entry.author)}</td><td>${entry.at.slice(0, 16).replace('T', ' ')}</td></tr>`).join('')
      : '<tr><td colspan="6" id="qa-empty">Aucune demande déposée.</td></tr>'
    html(res, page('Q&A', `
      <div class="crumbs"><a href="/vdr/room">Salle</a> › Q&amp;A</div>
      <div class="card">
        <h1>Module Q&amp;A — demandes de pièces</h1>
        <table id="qa-table"><thead><tr><th>#</th><th>Objet</th><th>Demande</th><th>Urgence</th><th>Auteur</th><th>Déposée le</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="card">
        <h2>Déposer une demande</h2>
        <form method="post" action="/vdr/qa">
          <p><label>Objet<br><input id="qa-subject" name="subject" required></label></p>
          <p><label>Demande<br><textarea id="qa-question" name="question" rows="3" required></textarea></label></p>
          <p>Urgence<br>
            <label style="display:inline-flex;align-items:center;gap:6px;margin-right:18px;"><input type="radio" id="qa-urgency-haute" name="urgency" value="haute" style="width:auto;"> haute</label>
            <label style="display:inline-flex;align-items:center;gap:6px;margin-right:18px;"><input type="radio" id="qa-urgency-moyenne" name="urgency" value="moyenne" style="width:auto;" checked> moyenne</label>
            <label style="display:inline-flex;align-items:center;gap:6px;"><input type="radio" id="qa-urgency-basse" name="urgency" value="basse" style="width:auto;"> basse</label>
          </p>
          <p><label>Auteur<br><input id="qa-author" name="author" placeholder="Cabinet / conseil déposant"></label></p>
          <p><button id="qa-submit" type="submit">Déposer la demande</button></p>
        </form>
      </div>`))
    return true
  }

  if (path === '/vdr/qa' && req.method === 'POST') {
    const body = await readBody(req)
    const params = new URLSearchParams(body)
    qaEntries.push({
      id: randomUUID(),
      subject: (params.get('subject') ?? '').slice(0, 160),
      question: (params.get('question') ?? '').slice(0, 600),
      urgency: (params.get('urgency') ?? 'moyenne').slice(0, 20),
      author: (params.get('author') ?? 'Conseil acquéreur').slice(0, 80),
      at: new Date().toISOString(),
    })
    redirect(res, '/vdr/qa')
    return true
  }

  html(res, page('Introuvable', '<div class="card"><h1>Page introuvable</h1></div>'), 404)
  return true
}
