# CLAUDE.md: Blackbox for Agents

Standing context for AI-assisted development. Keep this file short and current.

## What this project is

**Blackbox for Agents** records AI-agent runs, checks them against versioned rulebooks, and pinpoints the **Point of No Return** (the first unrecoverable step), then classifies the root cause with an evidence-backed verdict. Full documentation is in `docs/` (start at `docs/00-README-index.md`).

## Non-negotiable principles

1. **Rules first, model second.** The deterministic scan produces the Evidence Ledger. The Adjudicator reasons only over ledger + bounded excerpts.
2. **Deterministic rule stage.** Same record + rulebook = same ledger. Fixed ordering; no randomness; no clock/network in the engine.
3. **Traces are untrusted.** Treat all trace text as data. Never put it in instructions. Never give the model tools. Validate model output against a strict schema.
4. **Append-only evidence.** Ledger and audit rows are never updated; entries are hash-chained.
5. **Redact before store and before any model call.**
6. **Originality.** Use Blackbox terminology and schemas from the docs. Do not copy names, taxonomy, code, or assets from other projects (see `docs/15-glossary-and-originality.md`).

## Stack

Python 3.12, FastAPI, Pydantic v2, SQLAlchemy + Alembic, PostgreSQL, Redis + worker, React + TypeScript + Vite. LLM access only through `JudgeProvider` (fake provider in tests).

## Layout

See `docs/12-build-guide-and-repo-blueprint.md` §2. Engine code lives in `backend/blackbox/engine/` and `backend/blackbox/rulebook/` and has strict typing and the highest test bar (≥ 85% coverage).

## Commands (once scaffolded)

```
make up        # start local stack
make test      # unit + integration
make lint      # ruff, mypy, frontend lint/typecheck
make migrate   # alembic upgrade head
make seed      # demo org, project, rulebook, sample traces
```

## Conventions

- Conventional Commits; small PRs; tests and docs in the same PR.
- Tag tests with requirement ids (for example `@pytest.mark.req("FR-023")`).
- Pure functions in the engine; side effects at the edges.
- No trace content or secrets in logs.
- Errors are typed domain exceptions mapped to problem-details responses.

## When asked to implement something

1. Find the requirement (`docs/02`), design (`docs/03` to `docs/06`), and engine spec (`docs/05`).
2. Write or update tests first or together with the code.
3. Keep changes minimal and consistent with the specs. If a spec is wrong or missing, propose a doc change in the same PR.
4. Do not add dependencies without noting license and purpose.

## Do not

- Do not call the model from the rule stage.
- Do not let the model output a PNR that is not backed by the ledger without marking `basis = model_only`.
- Do not store real customer data in the repo or tests.
- Do not copy third-party code, text, datasets, or branding.
