#!/bin/bash
# Run Laplace locally over HTTP (no TLS) for easy testing.
# Open http://127.0.0.1:8080 in your browser.

cd "$(dirname "$0")"

# Free port 8080 if already in use
if lsof -ti:8080 >/dev/null 2>&1; then
  echo "Stopping existing process on port 8080..."
  lsof -ti:8080 | xargs kill 2>/dev/null || true
  sleep 1
fi

# Build and run with HTTP on port 8080
echo "Building..."
go build -o laplace-local . || { echo "Build failed."; exit 1; }

echo ""
echo "Starting server at http://127.0.0.1:8080"
echo "Open in browser: http://127.0.0.1:8080"
echo "Press Ctrl+C to stop"
echo ""

./laplace-local -tls=false -addr=127.0.0.1:8080
