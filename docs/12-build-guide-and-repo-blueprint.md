# 12. Build Guide and Repository Blueprint

Use this to start coding on day one. Versions and commands should be confirmed at setup time.

## 1. Prerequisites

- Python 3.14, Node.js 24 LTS, Docker + Docker Compose, Git, `make`.
- An LLM provider API key (for the real judge; tests use the fake provider).

## 2. Repository structure

```
blackbox-for-agents/
├─ CLAUDE.md                     # context for AI-assisted coding
├─ README.md
├─ Makefile
├─ docs/                         # this documentation set
│  └─ decisions/                 # ADRs
├─ taxonomy/
│  └─ v1.yaml                    # failure taxonomy (doc 05 §6)
├─ rulebooks/
│  ├─ examples/retail-core.yaml
│  └─ schema/rulebook.schema.json
├─ schemas/
│  └─ flight-record-1.json
├─ backend/
│  ├─ pyproject.toml
│  ├─ alembic/                   # migrations
│  └─ blackbox/
│     ├─ api/                    # FastAPI routers, deps, errors
│     ├─ core/                   # config, logging, security
│     ├─ db/                     # models, repositories
│     ├─ ingest/
│     ├─ adapters/               # generic_jsonl.py, otel.py (later)
│     ├─ normalizer/
│     ├─ redactor/
│     ├─ rulebook/               # loader.py, linter.py, deriver.py
│     ├─ engine/
│     │  ├─ expressions.py       # safe evaluator + helpers
│     │  ├─ checker.py           # scan stage
│     │  ├─ recoverability.py    # PNR computation
│     │  ├─ ledger.py            # append-only + hash chain
│     │  ├─ adjudicator.py       # prompt, provider call, validation
│     │  ├─ providers/           # base.py, anthropic.py, fake.py
│     │  └─ reconcile.py
│     ├─ reporting/
│     ├─ evaluation/             # benchmark runner, fault injection
│     └─ worker.py
├─ frontend/
│  ├─ package.json
│  └─ src/
│     ├─ components/             # Timeline, StepInspector, EvidencePanel, ...
│     ├─ pages/
│     ├─ api/                    # typed client
│     └─ theme/
├─ tests/
│  ├─ unit/  integration/  golden/  security/injection_corpus/  e2e/
├─ deploy/
│  ├─ docker-compose.yml
│  └─ terraform/
└─ .github/workflows/ci.yml
```

## 3. Day-one setup

```bash
mkdir blackbox-for-agents && cd blackbox-for-agents
git init
python3.12 -m venv .venv && source .venv/bin/activate
pip install fastapi "uvicorn[standard]" pydantic pydantic-settings sqlalchemy alembic \
  psycopg[binary] redis rq jsonschema pyyaml cel-python httpx pytest pytest-cov hypothesis \
  ruff mypy
# frontend
npm create vite@latest frontend -- --template react-ts
```

> Check that `cel-python` is the package you want (alternatives exist). If you choose a different expression library, preserve the same constraints: no I/O, no loops, bounded time.

## 4. Core code skeletons

### 4.1 Flight Record models (Pydantic)

```python
# backend/blackbox/normalizer/models.py
from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field, model_validator

StepKind = Literal["message", "tool_call", "tool_result", "handoff", "decision", "system_event"]

class ToolCall(BaseModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)

class ToolResult(BaseModel):
    tool: str
    output: Any = None
    error: str | None = None

class Handoff(BaseModel):
    from_: str = Field(alias="from")
    to: str
    payload: Any = None
    model_config = {"populate_by_name": True}

class Step(BaseModel):
    index: int = Field(ge=0)
    actor: str
    kind: StepKind
    content: str | None = None
    tool_call: ToolCall | None = None
    tool_result: ToolResult | None = None
    handoff: Handoff | None = None
    ts: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)

class FlightRecord(BaseModel):
    record_id: str
    schema_version: Literal["1"] = "1"
    source_format: str = "generic-jsonl"
    task: dict[str, Any]
    tools: list[dict[str, Any]] = Field(default_factory=list)
    policies: list[dict[str, Any]] = Field(default_factory=list)
    steps: list[Step]

    @model_validator(mode="after")
    def indexes_are_sequential(self):
        for expected, step in enumerate(self.steps):
            if step.index != expected:
                raise ValueError(f"steps[{expected}].index must be {expected}, got {step.index}")
        return self
```

### 4.2 Check model and scan stage

```python
# backend/blackbox/engine/checker.py
from dataclasses import dataclass
from typing import Any

@dataclass(frozen=True)
class Check:
    id: str
    title: str
    taxonomy: str
    severity: str            # info | minor | major | critical
    guard: str
    assertion: str
    message: str
    irreversible: bool = False
    recovery: str | None = None

@dataclass(frozen=True)
class LedgerItem:
    seq: int
    step_idx: int | None
    check_id: str
    severity: str
    taxonomy: str
    observed: Any
    expected: str
    excerpt: str
    message: str
    kind: str = "violation"          # or "check_error"

def scan(record, checks: list[Check], evaluator) -> list[LedgerItem]:
    """Deterministic scan: steps ascending, checks sorted by id."""
    ordered = sorted(checks, key=lambda c: c.id)
    items: list[LedgerItem] = []
    for step in record.steps:
        ctx = evaluator.context(record, step)
        for chk in ordered:
            try:
                if evaluator.eval_bool(chk.guard, ctx) is not True:
                    continue
                if evaluator.eval_bool(chk.assertion, ctx) is False:
                    items.append(LedgerItem(
                        seq=len(items), step_idx=step.index, check_id=chk.id,
                        severity=chk.severity, taxonomy=chk.taxonomy,
                        observed=evaluator.observed(chk, ctx), expected=chk.title,
                        excerpt=evaluator.excerpt(step), message=evaluator.render(chk.message, ctx),
                    ))
            except Exception as exc:   # never silently skip a broken rule
                items.append(LedgerItem(
                    seq=len(items), step_idx=step.index, check_id=chk.id, severity="info",
                    taxonomy="BB-ENV", observed=str(exc), expected="check evaluates cleanly",
                    excerpt="", message=f"Check {chk.id} errored", kind="check_error",
                ))
    return items
```

### 4.3 Point of No Return

```python
# backend/blackbox/engine/recoverability.py
def is_unrecoverable(item, check, record, later_steps_satisfy_recovery) -> bool:
    if item.kind != "violation":
        return False
    if check.irreversible:
        return True
    if check.recovery and not later_steps_satisfy_recovery(check, item):
        return True
    step = record.steps[item.step_idx]
    tool = step.tool_call.tool if step.tool_call else None
    if tool and item.severity == "critical" and tool_is_mutating(record, tool):
        return True
    return False

def point_of_no_return(items, checks_by_id, record, recovery_fn):
    candidates = [
        i for i in items
        if is_unrecoverable(i, checks_by_id[i.check_id], record, recovery_fn)
    ]
    candidates.sort(key=lambda i: (i.step_idx, -severity_rank(i.severity)))
    return candidates[0].step_idx if candidates else None, candidates
```

### 4.4 Judge provider interface and fake

```python
# backend/blackbox/engine/providers/base.py
from typing import Protocol

class JudgeProvider(Protocol):
    model_id: str
    def judge(self, prompt: dict, schema: dict) -> dict: ...

# backend/blackbox/engine/providers/fake.py
class FakeJudge:
    model_id = "fake-judge-1"
    def judge(self, prompt, schema):
        ledger = prompt["ledger"]
        first = min((e for e in ledger if e["kind"] == "violation"), key=lambda e: e["step_idx"], default=None)
        return {
            "pnr_step": first["step_idx"] if first else None,
            "taxonomy_code": first["taxonomy"] if first else "BB-CAP",
            "confidence": 0.8 if first else 0.2,
            "cited_ledger_ids": [first["seq"]] if first else [],
            "reasoning": "Deterministic fake verdict for tests.",
            "agrees_with_rules": True,
        }
```

### 4.5 Ledger hash chain

```python
# backend/blackbox/engine/ledger.py
import hashlib, json

def entry_hash(prev_hash: str, fields: dict) -> str:
    canonical = json.dumps(fields, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256((prev_hash + canonical).encode("utf-8")).hexdigest()

def chain(items):
    prev = "0" * 64
    for item in items:
        fields = {k: getattr(item, k) for k in ("seq", "step_idx", "check_id", "severity", "taxonomy", "message")}
        h = entry_hash(prev, fields)
        yield item, prev, h
        prev = h
```

### 4.6 FastAPI upload endpoint (shape)

```python
# backend/blackbox/api/records.py
from fastapi import APIRouter, Depends, status
router = APIRouter(prefix="/v1")

@router.post("/records", status_code=status.HTTP_202_ACCEPTED)
def upload_record(body: UploadRequest, principal=Depends(require_role("analyst"))):
    raw_bytes = body.encode()
    upload = storage.save_raw(principal.project_id, raw_bytes)      # sha256 inside
    record = normalize(adapter_for(body.source_format), raw_bytes)  # raises 422 on invalid
    investigation = repo.create_investigation(record, body.rulebook_version_id)
    queue.enqueue(run_investigation, investigation.id)
    return {"investigation_id": str(investigation.id), "status": "queued"}
```

### 4.7 Sample rulebook (starter)

Save as `rulebooks/examples/retail-core.yaml` using the example in doc 05 §2.1.

## 5. Build order (recommended)

1. **Schema and adapter**: Flight Record models, generic JSONL adapter, validation errors with paths.
2. **Evaluator**: safe expressions with helpers; fuzz for sandbox escapes; timeouts.
3. **Rulebook loader + linter**.
4. **Scan + ledger + hash chain** with golden tests.
5. **Derived checks** from tool schemas.
6. **Recoverability + PNR**, including lineage tracking.
7. **Fake judge + reconcile**, then real provider with schema validation and retries.
8. **API + worker + DB**, then **minimal UI**.
9. **Redaction**, **reports**, **review workflow**.
10. **RBAC, API keys, audit log**, **security gate**.
11. **Benchmark runner + fault injection**, then tune.

## 6. First-week checklist

- [ ] Repo, CI, Compose, `make up` works.
- [ ] `FlightRecord` model + 5 valid/invalid fixtures.
- [ ] Evaluator passes sandbox tests.
- [ ] One rule fires on one sample trace, ledger golden file committed.
- [ ] `/healthz`, upload endpoint, DB migration applied.
- [ ] ADRs 001 to 007 copied into `docs/decisions/`.

## 7. AI-assisted build playbook

If you build with an AI coding assistant, work in small, verifiable slices.

**Practices**
- Keep `CLAUDE.md` current (it is the standing context).
- Give one story at a time with its acceptance criteria and the relevant doc sections.
- Ask for tests first or together with code; run them yourself.
- Review diffs; require the assistant to explain any dependency it adds.
- Never paste real customer traces or secrets into prompts.

**Prompt template**

```
Context: Blackbox for Agents (see CLAUDE.md, docs/05 §4).
Task: Implement <module/function> to satisfy <FR/US ids>.
Constraints: no I/O in the evaluator; deterministic ordering; type hints; pytest tests.
Acceptance: <Gherkin>.
Deliver: code + tests + short note on edge cases.
```

## 8. Coding standards

- Python: ruff, black-compatible formatting, strict typing in `engine/` and `rulebook/`.
- Small pure functions in the engine; side effects only at the edges (db, storage, provider).
- Errors: domain exceptions mapped to problem details.
- Logging: structured, no trace content or secrets in logs.
- Frontend: strict TypeScript, accessible components, no direct DOM injection of model text.

## 9. Definition of a "finished" module

Typed, tested (≥ 85% for engine), documented docstrings, golden tests where outputs are structured, metrics/logs where it is a pipeline stage, and linked to requirement ids.

## Change log

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-24 | Refresh prerequisites to Python 3.14 and Node.js 24 LTS |
| 1.0.0 | 2026-10-24 | Initial version |
