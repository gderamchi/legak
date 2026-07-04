// Exporte la data room de démonstration en fichiers réels dans demo-data-room/
// pour pouvoir les uploader manuellement dans le produit (drag & drop).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { demoDataRoom } from '../server/anv/demo-data.mjs'

const outDir = fileURLToPath(new URL('../demo-data-room', import.meta.url))
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

for (const doc of demoDataRoom()) {
  writeFileSync(join(outDir, doc.name), doc.content)
}
console.log(`${demoDataRoom().length} fichiers écrits dans ${outDir}`)
