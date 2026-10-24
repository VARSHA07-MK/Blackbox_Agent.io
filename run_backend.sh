#!/bin/sh
# Start the Blackbox backend on localhost only (not accessible from other machines on the network)
set -e
cd "$(dirname "$0")"
source .venv/bin/activate
uvicorn blackbox.api.app:app --host localhost --port 8000 --reload --app-dir backend
