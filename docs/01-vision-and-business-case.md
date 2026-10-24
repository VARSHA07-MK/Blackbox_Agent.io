# 01. Vision and Business Case

## 1. Problem statement

Teams are moving from chatbots to **autonomous agents** that call tools, change data, and run for dozens of steps. When such a run fails, nobody can answer three questions quickly:

1. **Where** did the run become unrecoverable?
2. **Why** did it happen (what category of failure, with what evidence)?
3. **What control** would have prevented it?

Today the answer comes from manual log reading. That is slow, inconsistent between reviewers, and not defensible in an audit. Agent runs are long, non-deterministic, and often multi-agent, so the true cause is buried under later symptoms.

## 2. Vision

> Every agent run leaves a trustworthy, replayable record. Every failure has an evidence-backed explanation. Every explanation maps to a control.

Blackbox for Agents is to AI agents what a flight data recorder and accident investigation board are to aircraft: record continuously, investigate systematically, and feed lessons back into prevention.

## 3. Product goals

| ID | Goal | Measure |
|---|---|---|
| G1 | Localize the Point of No Return accurately | Top-1 step accuracy on an internal labeled set, target ≥ 70% at MVP, ≥ 80% at v1.0 |
| G2 | Classify root cause consistently | Category agreement with human reviewers, target ≥ 70% at MVP |
| G3 | Make every verdict auditable | 100% of verdicts link to at least one evidence entry or are explicitly flagged "model-only" |
| G4 | Cut investigation time | Median time from failed run to verdict under 2 minutes (vs. manual baseline measured in pilot) |
| G5 | Be domain-agnostic | New domain onboarded by adding a rulebook, with no engine code changes |
| G6 | Support audit use | Export a signed investigation report usable as audit evidence |

## 4. Non-goals (MVP)

- Not an agent framework or orchestrator.
- Not a live "guardrail" that blocks actions in production (that is a future extension, see doc 14).
- Not an LLM observability or token-cost tool.
- Not an automatic fixer of agents (suggested remediations only).
- Not a general log management product.

## 5. Personas

| Persona | Role | Needs | Success looks like |
|---|---|---|---|
| **Asha, Agent Developer** | Builds and tunes agents | Fast root cause, reproducible evidence, rule suggestions | Finds the bad step in minutes, fixes prompt or tool schema |
| **Ravi, AI Risk / IS Auditor** | Reviews agent behavior for control effectiveness | Evidence trail, policy mapping, exportable report | Can show a regulator exactly which policy a run violated |
| **Meera, Platform Engineer** | Runs agent infrastructure | Easy ingestion, API, CI integration, low overhead | Failed runs auto-analyzed in the pipeline |
| **Kiran, Compliance Lead** | Owns policy | Write policies once, apply across agents | Rulebooks versioned, approved, and traceable to policy text |

## 6. Value proposition

- **Evidence-first diagnosis**: rules check the run before any model opines.
- **Rulebooks as assets**: policies and tool contracts become executable, versioned, reviewable.
- **Audit-ready**: reports, hashes, and immutable ledgers suit IS audit and risk workflows.
- **Model-agnostic**: works with any agent framework through adapters, any LLM through a provider interface.

## 7. Differentiation and positioning

| Area | Generic observability | Prompt-only "ask an LLM why it failed" | **Blackbox for Agents** |
|---|---|---|---|
| Records runs | Yes | No | Yes (normalized record) |
| Finds first unrecoverable step | Manual | Unreliable guess | Systematic, evidence-backed |
| Auditable evidence | Raw logs | None | Evidence ledger per verdict |
| Policy as code | No | No | Yes (rulebooks) |
| Consistent taxonomy | No | Ad hoc | Yes (Blackbox taxonomy, doc 05) |

## 7.1 Positioning relative to existing research

The idea of validating agent traces against constraints and then judging root cause is a known research direction. Blackbox for Agents is an **independent implementation** with its own name, schema, rule format, taxonomy, UI, and workflow. See doc 15 for originality rules that all contributors must follow.

## 8. Scope by release

| Release | Scope |
|---|---|
| **MVP (v0.1)** | Ingest JSON/JSONL traces, normalize, rulebook engine (deterministic), Point of No Return detection, model adjudicator, taxonomy, web console with timeline and evidence, JSON/Markdown report |
| **v0.5** | OpenTelemetry and 2 framework adapters, rulebook auto-derivation from tool schemas, accuracy benchmark runner, RBAC, PDF report |
| **v1.0** | Multi-tenant SaaS-ready, SSO, webhooks and CI plugin, rulebook marketplace (internal), control-mapping exports, signed reports |
| **v2.0** | Live monitoring mode, preventive guards, remediation suggestions with verification replays |

## 9. Stakeholders

| Stakeholder | Interest | Influence |
|---|---|---|
| Founder / Product Owner | Strategy, revenue, brand | High |
| Engineering team | Delivery | High |
| IS Audit / Risk practice | First internal adopter, domain rules | High |
| Pilot customers | Validation | Medium |
| Legal / IP counsel | Originality, licensing | Medium |

## 10. Assumptions and constraints

**Assumptions**
- Pilot users can export agent runs as JSON, JSONL, or OpenTelemetry spans.
- Tool schemas (JSON Schema or OpenAPI) are available for the agents being analyzed.
- A hosted LLM API is acceptable for the adjudicator, with an option for a private model later.

**Constraints**
- Small team; MVP in about 8 to 10 weeks.
- Must run on a single server via Docker Compose for the MVP.
- Customer trace data may include personal or confidential data, so redaction and data-handling controls are mandatory.

## 11. Business case (lightweight)

| Item | Estimate / approach |
|---|---|
| Build cost | Team time only for MVP; LLM API cost during development is small (a few hundred traces) |
| Run cost | One small VM, Postgres, object storage, LLM API per investigation (cost per investigation target under a defined cap set in config) |
| Revenue paths | Internal tool for audit engagements; paid pilot; per-seat or per-investigation SaaS; enterprise self-hosted license |
| Strategic value | Differentiates the audit and risk offering with an AI-agent assurance capability |
| Key risk | Accuracy depends on rulebook quality; mitigated by benchmark runner and human review loop |

> Validate all pricing and cost figures with real pilot data before external commitments.

## 12. Brand and naming

- Product: **Blackbox for Agents**. Short form: **Blackbox**.
- Tagline options: "Know exactly where your agent went wrong." / "The flight recorder for AI agents."
- Visual identity: must be original (see doc 15). Avoid any Microsoft marks, colors, or iconography patterns associated with the research project that inspired the idea.

## 13. Success metrics (product and delivery)

| Category | Metric | Target |
|---|---|---|
| Quality | PNR top-1 accuracy | ≥ 70% MVP, ≥ 80% v1.0 |
| Quality | Taxonomy agreement | ≥ 70% MVP |
| Performance | Verdict latency for a 100-step trace | < 60 s p95 |
| Adoption | Pilot teams onboarded | 3 by v0.5 |
| Delivery | Sprint goal hit rate | ≥ 80% |
| Reliability | API availability (pilot) | 99.5% |

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Initial version |
