#!/usr/bin/env bash
# HarooLife — build de production locale servie sur le réseau local privé, pour un téléphone
# Android relié au même Wi-Fi. Aucun déploiement : tout reste sur ce poste.
#
# Usage : bash scripts/haroolife-lan.sh             (construit puis sert sur 0.0.0.0:3000)
#         bash scripts/haroolife-lan.sh --no-build  (sert la build existante)
#         REALTIME=1 bash scripts/haroolife-lan.sh  (démarre aussi le relais de discussion :3001)
# Variables : lire .env.local (Supabase réel) ou exporter les NEXT_PUBLIC_* avant de lancer.
#
# La page est servie en http depuis l'IP du PC : la build LAN retire « upgrade-insecure-requests »
# de la CSP (HAROOLIFE_LAN_HTTP=1), sinon chaque fichier serait réécrit en https et la page ne
# se chargerait pas sur le téléphone. Jamais sur Vercel (la variable y est ignorée).
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3000}"
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP=$(ipconfig getifaddr en0 2>/dev/null || true)
export HAROOLIFE_LAN_HTTP=1
if [ "${REALTIME:-0}" = "1" ]; then
  export NEXT_PUBLIC_HAROOLIFE_REALTIME_URL="http://${IP}:3001"
fi
if [ "${1:-}" != "--no-build" ]; then
  npm run build
fi
if [ "${REALTIME:-0}" = "1" ]; then
  HAROOLIFE_REALTIME_ORIGINS="http://${IP}:${PORT},http://localhost:${PORT}" npm run realtime &
fi
echo
echo "HarooLife — production locale"
echo "  PC  : http://localhost:${PORT}/haroolife"
echo "  Tél : http://${IP:-<ip-du-pc>}:${PORT}/haroolife   (même Wi-Fi ; autoriser le port ${PORT} dans le pare-feu)"
if [ "${REALTIME:-0}" = "1" ]; then
  echo "  Discussion : relais http://${IP}:3001 (autoriser aussi le port 3001)"
fi
echo "  Mesures : chrome://inspect sur le PC → console : __LOME_PERF_RESET() … copy(JSON.stringify(__LOME_PERF))"
echo
exec npx next start --hostname 0.0.0.0 --port "${PORT}"
