// Retransmission en direct de l'agent computer use : l'écran du navigateur
// piloté par le modèle est screencasté (CDP) et diffusé en MJPEG aux clients
// connectés, avec un état structuré (but en cours, dernière action, intent du
// modèle) interrogeable en polling. Une session par mission, remplacée à
// chaque nouveau run — les preuves d'audit restent les captures PNG, le flux
// n'est qu'une fenêtre sur ce que le modèle voit et décide.

const BOUNDARY = 'legakframe'
const HEARTBEAT_MS = 900

const sessions = new Map()

function broadcastFrame(session) {
  if (!session.lastFrame) return
  const head = Buffer.from(
    `--${BOUNDARY}\r\ncontent-type: image/jpeg\r\ncontent-length: ${session.lastFrame.length}\r\n\r\n`,
    'ascii',
  )
  for (const client of session.clients) {
    if (client.writableEnded || client.destroyed) {
      session.clients.delete(client)
      continue
    }
    client.write(head)
    client.write(session.lastFrame)
    client.write('\r\n')
  }
}

export function startLiveSession(missionId, kind) {
  const previous = sessions.get(missionId)
  if (previous) endSession(previous)

  const session = {
    kind,
    running: true,
    startedAt: new Date().toISOString(),
    endedAt: null,
    phase: 'démarrage du navigateur',
    lastAction: null,
    lastIntent: null,
    decidedBy: null,
    actions: 0,
    modelTurns: 0,
    fallbacks: [],
    lastFrame: null,
    frameCount: 0,
    clients: new Set(),
    heartbeat: null,
  }
  session.heartbeat = setInterval(() => broadcastFrame(session), HEARTBEAT_MS)
  sessions.set(missionId, session)

  return {
    frame(buffer) {
      session.lastFrame = buffer
      session.frameCount += 1
      broadcastFrame(session)
    },
    status(patch) {
      Object.assign(session, patch)
    },
    end() {
      endSession(session)
    },
  }
}

function endSession(session) {
  if (!session.running && session.endedAt) return
  session.running = false
  session.endedAt = new Date().toISOString()
  clearInterval(session.heartbeat)
  broadcastFrame(session)
  for (const client of session.clients) {
    client.end()
  }
  session.clients.clear()
}

export function liveStatus(missionId) {
  const session = sessions.get(missionId)
  if (!session) return { running: false, kind: null }
  const { clients: _clients, heartbeat: _heartbeat, lastFrame: _frame, ...view } = session
  return { ...view, hasFrame: Boolean(session.lastFrame) }
}

// Dernière frame JPEG (polling) — compatible Safari / Chrome / Firefox.
// Le MJPEG multipart ne s'affiche pas dans Safari via <img src>.
export function serveLiveFrame(missionId, res) {
  const session = sessions.get(missionId)
  if (!session?.lastFrame) {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
    return res.end()
  }
  res.writeHead(200, {
    'content-type': 'image/jpeg',
    'cache-control': 'no-store, no-cache',
    'access-control-allow-origin': '*',
  })
  res.end(session.lastFrame)
}

// Flux MJPEG (multipart/x-mixed-replace) — Chrome uniquement ; conservé en secours.
export function attachMjpegClient(missionId, res) {
  const session = sessions.get(missionId)
  res.writeHead(200, {
    'content-type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    connection: 'close',
  })
  if (!session) {
    res.end()
    return
  }
  session.clients.add(res)
  if (session.lastFrame) {
    const head = Buffer.from(
      `--${BOUNDARY}\r\ncontent-type: image/jpeg\r\ncontent-length: ${session.lastFrame.length}\r\n\r\n`,
      'ascii',
    )
    res.write(head)
    res.write(session.lastFrame)
    res.write('\r\n')
  }
  if (!session.running) {
    res.end()
    session.clients.delete(res)
    return
  }
  res.on('close', () => session.clients.delete(res))
}
