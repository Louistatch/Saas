#!/usr/bin/env bash
# HarooLife — build de production locale servie sur le réseau local privé, pour un téléphone
# Android relié au même Wi-Fi. Aucun déploiement : tout reste sur ce poste.
#
# Usage : bash scripts/haroolife-lan.sh            (construit puis sert sur 0.0.0.0:3000)
#         bash scripts/haroolife-lan.sh --no-build (sert la build existante)
# Variables : lire .env.local (Supabase réel) ou exporter les NEXT_PUBLIC_* avant de lancer.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3000}"
if [ "${1:-}" != "--no-build" ]; then
  npm run build
fi
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP=$(ipconfig getifaddr en0 2>/dev/null || true)
echo
echo "HarooLife — production locale"
echo "  PC  : http://localhost:${PORT}/haroolife"
echo "  Tél : http://${IP:-<ip-du-pc>}:${PORT}/haroolife   (même Wi-Fi ; autoriser le port ${PORT} dans le pare-feu)"
echo "  Mesures : chrome://inspect sur le PC → console : __LOME_PERF_RESET() … copy(JSON.stringify(__LOME_PERF))"
echo
exec npx next start --hostname 0.0.0.0 --port "${PORT}"
