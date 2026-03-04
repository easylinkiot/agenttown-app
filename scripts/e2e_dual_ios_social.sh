#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_A_NAME="${SIM_A_NAME:-iPhone 17}"
SIM_B_NAME="${SIM_B_NAME:-iPhone 17 Pro}"
RUN_TAG="${E2E_RUN_TAG:-$(date +%s)}"
PORT_BASE="${DETOX_PORT_BASE:-8099}"

pick_port() {
  local p="$1"
  while lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; do
    p=$((p + 1))
  done
  echo "$p"
}

echo "[0/4] Clean stale Detox/Jest processes..."
pkill -f "detox test -c ios.sim.release.a" >/dev/null 2>&1 || true
pkill -f "detox test -c ios.sim.release.b" >/dev/null 2>&1 || true
pkill -f "jest --config e2e/jest.config.js --testPathPattern=e2e/social-dual-device-chat.e2e.js" >/dev/null 2>&1 || true
sleep 1

PORT_A="$(pick_port "$PORT_BASE")"
PORT_B="$(pick_port "$((PORT_A + 1))")"
if [[ "$PORT_A" -eq "$PORT_B" ]]; then
  PORT_B="$(pick_port "$((PORT_A + 2))")"
fi
echo "Detox servers: A=$PORT_A, B=$PORT_B"

echo "[1/4] Build iOS release binary..."
cd "$ROOT_DIR"
npm run e2e:build:ios

echo "[2/4] Boot two simulators..."
xcrun simctl boot "$SIM_A_NAME" >/dev/null 2>&1 || true
xcrun simctl boot "$SIM_B_NAME" >/dev/null 2>&1 || true
open -a Simulator

echo "[3/4] Run dual-device chat test in parallel..."
(
  DETOX_SERVER="ws://127.0.0.1:${PORT_A}" \
  E2E_ACTOR=A \
  E2E_RUN_TAG="$RUN_TAG" \
  npx detox test -c ios.sim.release.a --cleanup -- --testPathPattern=e2e/social-dual-device-chat.e2e.js
) &
PID_A=$!

(
  DETOX_SERVER="ws://127.0.0.1:${PORT_B}" \
  E2E_ACTOR=B \
  E2E_RUN_TAG="$RUN_TAG" \
  npx detox test -c ios.sim.release.b --cleanup -- --testPathPattern=e2e/social-dual-device-chat.e2e.js
) &
PID_B=$!

FAIL=0
wait "$PID_A" || FAIL=1
wait "$PID_B" || FAIL=1

echo "[4/4] Done. runTag=$RUN_TAG"
if [[ "$FAIL" -ne 0 ]]; then
  echo "dual-device run failed" >&2
  exit 1
fi
