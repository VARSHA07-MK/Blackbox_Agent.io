#!/bin/sh
# Start the Blackbox frontend dev server on localhost only
set -e
cd "$(dirname "$0")/frontend"
npm run dev
