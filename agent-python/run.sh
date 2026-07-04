#!/usr/bin/env bash
# Lance le serveur NOVA RH (portail /rh + UI + API agent).
# Logs affichés en direct ET copiés dans logs/server.log.
set -uo pipefail
cd "$(dirname "$0")"

# Charge .env (GOOGLE_API_KEY, PORT...)
if [ -f .env ]; then set -a; . ./.env; set +a; fi
if [ -z "${GOOGLE_API_KEY:-}" ]; then
  echo "⚠️  GOOGLE_API_KEY manquante — ajoute-la dans .env"; exit 1
fi

PORT="${PORT:-5000}"
mkdir -p logs

echo "────────────────────────────────────────────────────────────"
echo "▶  Portail RH  http://localhost:$PORT/rh"
echo "   Agent UI    http://localhost:$PORT/audit"
echo "   Logs        logs/server.log   (Ctrl-C pour arrêter)"
echo "────────────────────────────────────────────────────────────"

# stdbuf : logs non bufferisés → ils défilent en temps réel
exec > >(tee logs/server.log) 2>&1
exec python3 -u server.py
