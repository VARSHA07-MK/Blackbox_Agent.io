# 10. Agile Delivery Plan

Scrum-based delivery with BA discipline (BABOK-aligned requirements, traceability, acceptance criteria).

## 1. Team and roles

| Role | Responsibility | Suggested staffing |
|---|---|---|
| Product Owner | Vision, backlog priority, acceptance | Founder |
| Business Analyst / Scrum Master | Requirements, backlog grooming, ceremonies, impediments | 1 (can be dual role) |
| Backend engineers | Engine, API, worker | 2 |
| Frontend engineer | Console, timeline, editor | 1 |
| QA / test engineer | Automation, benchmark, security tests | 1 (can be shared) |
| DevOps (part-time) | CI/CD, infra, observability | 0.5 |
| Domain advisor | IS audit/risk rule authoring and labeling | Part-time, from audit practice |
| Designer (part-time) | Original visual identity, UX review | 0.25 |

Small teams may combine roles, but keep **acceptance** (PO) separate from **implementation**.

## 2. Cadence

| Ceremony | Frequency | Duration | Output |
|---|---|---|---|
| Sprint | 2 weeks | | Potentially releasable increment |
| Planning | Start of sprint | 2 h | Sprint goal, committed stories |
| Daily standup | Daily | 15 min | Blockers visible |
| Backlog refinement | Weekly | 1 h | Stories meeting DoR |
| Review/demo | End of sprint | 1 h | Stakeholder feedback |
| Retrospective | End of sprint | 45 min | 1 to 2 improvement actions |

## 3. Roadmap (phases and milestones)

| Phase | Weeks | Goal | Exit criteria |
|---|---|---|---|
| 0. Inception | 0 to 1 | Alignment, repo, environments, ADRs confirmed | Backlog seeded, CI skeleton green |
| 1. Walking skeleton | 1 to 3 | Upload → normalize → trivial check → verdict (fake judge) → minimal UI | End-to-end demo on one sample |
| 2. Core engine | 3 to 6 | Rulebook DSL, derivation, ledger, PNR, adjudicator, reconcile | Benchmark runs, ≥ 60% PNR top-1 on dev set |
| 3. Console and review | 6 to 8 | Timeline, evidence, review, reports | Usability test passes |
| 4. Hardening and pilot | 8 to 10 | Security gate, performance, docs, pilot onboarding | Release gate checklist met; pilot live |
| 5. Growth (post-MVP) | 10+ | Adapters, RBAC/SSO, CI plugin, signed reports | See doc 14 |

## 4. Epics

| Epic | Description | Key requirements |
|---|---|---|
| E1 Ingestion and normalization | Upload, adapters, schema, redaction | FR-001..007 |
| E2 Rulebook engine | DSL, linter, derivation, scan, ledger | FR-010..015, FR-020..022, FR-027 |
| E3 Localization and verdict | Recoverability, PNR, adjudicator, reconcile | FR-023..026, FR-028, FR-029 |
| E4 Investigation console | Timeline, inspector, evidence, review | FR-030..034 |
| E5 Reporting | MD/JSON/PDF, integrity metadata | FR-040..043 |
| E6 Platform and security | Auth, RBAC, audit log, API keys, retention | FR-050..054, NFR-005..007 |
| E7 Evaluation | Benchmark runner, labeled data, fault injection | FR-060..062 |
| E8 DevOps and observability | CI/CD, IaC, monitoring, backup | NFR-004, 012, 013 |

## 5. Sprint plan (first five sprints, adjust to velocity)

### Sprint 1: Foundation
**Goal:** Repo, CI, and a stored record viewable via API.
- Repo scaffold, Docker Compose, CI skeleton (E8)
- Flight Record schema + generic JSONL adapter (E1)
- Upload endpoint with hash and raw storage (US-001)
- DB migrations for core tables
- ADR review; decide LLM provider (Q2)

### Sprint 2: Walking skeleton
**Goal:** One check fires and appears in a minimal UI.
- Expression evaluator with sandbox and timeouts (E2)
- Rulebook YAML loader + linter v1
- Scan stage + evidence ledger with hash chain
- Fake judge provider; verdict persisted
- Minimal UI: upload, list, verdict, ledger table

### Sprint 3: Core diagnosis
**Goal:** PNR computed with recoverability rules.
- Recoverability model (irreversible, recovery, mutating, lineage)
- Derived checks from tool schemas (DRV-*)
- Real adjudicator provider with schema validation and retries
- Reconciliation logic and `model_only` handling
- Fault-injection harness v1; first benchmark run

### Sprint 4: Console
**Goal:** Investigators can work in the UI.
- Timeline component with violation markers and PNR flag
- Step inspector + evidence panel
- Review actions (accept/correct/reject) and label export
- Markdown/JSON report with integrity block
- Redaction pipeline v1 (US-007)

### Sprint 5: Hardening
**Goal:** Pilot-ready quality.
- RBAC, API keys, audit log
- Security gate items (doc 07 §12): injection corpus, authz matrix
- Performance tuning to NFR targets
- Rulebook editor with live lint and test-on-trace
- Pilot onboarding guide and sample data

### Sprints 6 to 8 (post-MVP candidates)
OpenTelemetry adapter, two framework adapters, PDF export, benchmark comparison UI, SSO, webhooks, CI plugin.

## 6. Backlog management

- Single prioritized backlog; stories follow the INVEST criteria.
- Story template:

```
Title: <verb phrase>
As a <persona>, I want <capability> so that <value>.
Acceptance criteria (Gherkin): ...
Requirement refs: FR-..., NFR-...
Design refs: doc 0X §Y
Estimate: story points
Test notes: ...
```

- Estimation: relative story points (Fibonacci); track velocity over 3 sprints before committing to long-range dates.
- Spikes are timeboxed (max 2 days) and end with a written decision (ADR or note).

## 7. RACI (selected activities)

| Activity | PO | BA/SM | Dev | QA | DevOps | Domain advisor |
|---|---|---|---|---|---|---|
| Backlog priority | A/R | C | C | C | I | C |
| Requirements | A | R | C | C | I | C |
| Architecture decisions | C | I | A/R | C | C | I |
| Rulebook content | A | C | C | I | I | R |
| Test strategy | I | C | C | A/R | C | I |
| Release approval | A | R | C | R | R | I |
| Security gate | I | I | R | R | A | I |

R = Responsible, A = Accountable, C = Consulted, I = Informed.

## 8. Delivery metrics

| Metric | Use |
|---|---|
| Velocity (3-sprint average) | Capacity planning |
| Sprint goal hit rate | Predictability |
| Cycle time | Flow health |
| Escaped defects (S1/S2 after release) | Quality |
| Benchmark PNR top-1 trend | Product quality |
| Cost per investigation | Unit economics |

## 9. Stakeholder communication

- Sprint review demo with a short written update (what shipped, what's next, risks).
- Monthly steering: roadmap, risks (doc 11), benchmark trend, pilot feedback.
- Decision log kept in `docs/decisions/` (ADRs).

## 10. Working agreements

- Trunk-based development, small PRs, review within one working day.
- Tests accompany code; docs updated in the same PR.
- No work starts without acceptance criteria.
- Rulebook and taxonomy changes are reviewed by the domain advisor.
- Anyone can stop the line for a security or data-handling concern.

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Initial version |
