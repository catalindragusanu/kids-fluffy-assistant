#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8000}"
HOST="${HOST:-127.0.0.1}"
PID_FILE="${ROOT}/.fluffy-server.pid"
LOG_FILE="${ROOT}/.fluffy-server.log"

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

start() {
  if is_running; then
    echo "Already running (PID $(cat "$PID_FILE")) at http://${HOST}:${PORT}"
    return 0
  fi

  local py
  py="$(command -v python3 || command -v python || true)"
  if [[ -z "$py" ]]; then
    echo "Python is required to serve the app (python3 or python not found)."
    exit 1
  fi

  cd "$ROOT"
  HOST="$HOST" nohup "$py" "$ROOT/server.py" "$PORT" >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  sleep 0.2

  if ! is_running; then
    echo "Failed to start server. Check $LOG_FILE"
    exit 1
  fi

  echo "Started http://${HOST}:${PORT} (PID $(cat "$PID_FILE"))"
}

stop() {
  if ! is_running; then
    echo "Not running"
    rm -f "$PID_FILE"
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  kill "$pid" 2>/dev/null || true
  sleep 0.2

  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$PID_FILE"
  echo "Stopped"
}

restart() {
  stop
  start
}

status() {
  if is_running; then
    echo "Running (PID $(cat "$PID_FILE")) at http://${HOST}:${PORT}"
  else
    echo "Stopped"
  fi
}

case "${1:-}" in
  start|stop|restart|status)
    "$1"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
