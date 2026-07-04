#!/usr/bin/env bash
#
# Lance la demo agent RH de bout en bout :
#   1. charge les variables d'environnement (.env)
#   2. demarre le portail NOVA RH (server.py) s'il ne tourne pas deja
#   3. attend que le portail reponde
#   4. lance l'agent Computer Use (telechargement + extraction PDF -> .txt)
#   5. arrete proprement le portail (seulement si c'est ce script qui l'a lance)
#
# Usage :
#   ./run.sh                 # config par defaut : config_rh.json
#   ./run.sh autre.json      # config personnalisee
#   PORT=5000 ./run.sh       # port du portail (doit correspondre a start_url du config)

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-5000}"
CONFIG="${1:-config_rh.json}"

# ── 1. Environnement ─────────────────────────────────────────────────────────
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# agent_rh.py ne lit que GOOGLE_API_KEY : on retombe sur GEMINI_API_KEY si besoin.
if [ -z "${GOOGLE_API_KEY:-}" ] && [ -n "${GEMINI_API_KEY:-}" ]; then
  export GOOGLE_API_KEY="$GEMINI_API_KEY"
fi
if [ -z "${GOOGLE_API_KEY:-}" ]; then
  echo "ERREUR : GOOGLE_API_KEY manquante. Ajoute-la dans agent-python/.env" >&2
  exit 1
fi

if [ ! -f "$CONFIG" ]; then
  echo "ERREUR : fichier de config introuvable : $CONFIG" >&2
  exit 1
fi

# ── 2. Portail ───────────────────────────────────────────────────────────────
STARTED_SERVER=0
if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
  echo "→ Portail deja actif sur :$PORT (reutilise)"
else
  echo "→ Demarrage du portail sur :$PORT (logs : server.log)"
  PORT="$PORT" python3 server.py >server.log 2>&1 &
  STARTED_SERVER=1
fi

cleanup() {
  if [ "$STARTED_SERVER" = "1" ]; then
    echo "→ Arret du portail sur :$PORT"
    lsof -ti "tcp:$PORT" | xargs kill 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ── 3. Attente que le portail reponde ────────────────────────────────────────
printf "→ Attente du portail"
for i in $(seq 1 40); do
  if curl -sf -o /dev/null "http://localhost:$PORT/rh"; then
    printf " : pret\n"
    break
  fi
  printf "."
  sleep 0.5
  if [ "$i" = "40" ]; then
    printf " : ECHEC (portail injoignable, voir server.log)\n" >&2
    exit 1
  fi
done

# ── 4. Agent ─────────────────────────────────────────────────────────────────
echo "→ Lancement de l'agent (config : $CONFIG)"
echo "--------------------------------------------------------------------------"
set +e
python3 agent_rh.py "$CONFIG"
STATUS=$?
set -e
echo "--------------------------------------------------------------------------"

# ── 5. Recap des artefacts ───────────────────────────────────────────────────
if ls downloads/*.txt >/dev/null 2>&1; then
  echo "✓ Fichiers produits dans downloads/ :"
  ls -1 downloads/
else
  echo "⚠ Aucun fichier telecharge/extrait dans downloads/"
fi

exit $STATUS
