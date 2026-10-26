# Blackbox for Agents

Records AI-agent runs, checks them against versioned rulebooks, and pinpoints the
**Point of No Return** (the first unrecoverable step), then classifies the root cause
with an evidence-backed verdict.

Start with [`docs/00-README-index.md`](docs/00-README-index.md). Contributor and AI
conventions are in [`CLAUDE.md`](CLAUDE.md).

## Quick start

Run the MVP with Docker:

```bash
docker compose -f deploy/docker-compose.yml up --build
```

Then open <http://localhost:5173>. The API is also available at
<http://localhost:8000/docs>. For local development with Python 3.14+ and Node.js
24 LTS, install the backend with `python3.14 -m venv .venv && .venv/bin/pip install -e backend`,
then start `./run_backend.sh` and `./run_frontend.sh` in two terminals.

## Features

### Investigation Console
Import and analyze agent trace files (JSONL or Flight Record JSON). The deterministic
rule engine produces a hash-chained evidence ledger, pinpoints the Point of No Return,
and surfaces rule violations — all without any model call.

### Marketplace Simulation (`/simulation`)
A sandboxed food-delivery marketplace runs 1–100 synthetic orders end-to-end. Configure
role counts, scenario mix, random seed, and playback speed. Thirteen named fault
scenarios (double-charge, courier loop, stale status, incomplete handoff, …) can be
injected at specific order indices. Each completed order is analyzed by both the standard
Blackbox rules and 10 marketplace-specific rules (`MKT-*`), and stored as an Investigation
you can inspect in the Investigation Console. All agents, customers, restaurants, and
couriers are synthetic — no real external services are contacted.

### Adoption Coordinator (`/adoption`)
An onboarding workflow for connecting real AI agents to Blackbox analysis. A demo registry
of eight synthetic agents demonstrates the 7-step enrollment flow: review agent details →
select integration method → map trace fields → validate a sample trace → configure
triggers → review & approve (human approval required) → active. Enrollment and production
trigger activation require explicit human approval — agents are never silently enrolled.

## Status

The runnable MVP includes a React investigation console, trace import (JSONL and
Flight Record JSON), a FastAPI analysis endpoint, deterministic rule checks,
marketplace simulation with 13 fault scenarios, an adoption coordinator workflow,
a Point of No Return locator, and an SHA-256 chained evidence ledger. Data is
persisted to SQLite (no external database required). Accounts, project storage,
custom rule authoring in the UI, and adjudicator/model integration remain future work.
