# Blackbox for Agents

Records AI-agent runs, checks them against versioned rulebooks, and pinpoints the
**Point of No Return** (the first unrecoverable step), then classifies the root cause
with an evidence-backed verdict.

Start with [`docs/00-README-index.md`](docs/00-README-index.md). Contributor and AI
conventions are in [`CLAUDE.md`](CLAUDE.md).

## Quick start

```bash
make venv     # create .venv and install backend in editable mode
make test     # unit + integration tests with coverage gate (85%)
make lint     # ruff + mypy
```

Requires Python 3.12. Frontend (`frontend/`) and infrastructure (`deploy/`) are not scaffolded yet.

## Status

Skeleton with a health endpoint and a placeholder frontend. Engine, ingest, and the investigation API are not implemented.
