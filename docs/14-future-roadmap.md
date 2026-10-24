# 14. Future Roadmap and Extensions

Prioritize with real pilot feedback. Items are ideas with rationale, not commitments.

## 1. Horizon view

| Horizon | Theme | Highlights |
|---|---|---|
| **H1 (0 to 3 months after MVP)** | Make it easy to adopt | OpenTelemetry + two framework adapters, SSO, webhooks, CLI/CI plugin, PDF reports, benchmark comparison UI |
| **H2 (3 to 9 months)** | Make it trusted | Signed reports, rulebook library and sharing, control-framework mapping exports, reviewer workflow with queues and SLAs, multi-tenant SaaS hardening |
| **H3 (9 to 18 months)** | Make it preventive | Live monitoring mode, preventive guards, remediation suggestions with verification replays, learning from reviewer labels |

## 2. Feature ideas by area

### 2.1 Ingestion
- Native adapters for popular agent frameworks and the OpenTelemetry GenAI semantic conventions.
- SDK decorators that emit Flight Records directly from agent code.
- Browser/desktop agent step capture (screenshots as evidence with redaction).
- Streaming ingestion for in-flight runs.

### 2.2 Engine
- **Rule suggestion**: model proposes new checks from verified investigations; human approves (FR-016 expanded).
- **Counterfactual replay**: re-run an agent from the step before the PNR with a fix to test whether the run recovers.
- **Cross-run pattern mining**: cluster verdicts to find systemic failure modes per agent and per tool.
- **Cost and latency attribution** per step for efficiency analysis.
- **Semantic checks** with small local classifiers for cases expressions cannot capture (kept auditable by recording model, version, and score).
- **Multi-PNR analysis** for runs with independent failures.

### 2.3 Governance and audit
- Control library mapped to ISO/IEC 42001, NIST AI RMF, and internal control catalogs.
- Audit workpaper export (evidence, sampling, conclusions) tailored for IS audit engagements.
- Scheduled sample-based reviews: pick N runs per week for human review.
- Exception register with approvals when a violation is accepted as risk.

### 2.4 Product experience
- Run comparison and regression view across agent versions.
- Shareable read-only investigation links with expiry and watermarking.
- Annotations and comment threads on steps.
- Slack/Teams/Jira integrations: open a ticket with evidence attached.

### 2.5 Platform
- Kubernetes Helm chart; air-gapped, self-hosted bundle with a local model option.
- Per-tenant keys (BYOK) and regional deployments.
- Marketplace of rulebooks for common domains (retail support, IT ops, finance operations, healthcare admin) with versioning and ratings.
- Public API v2 with GraphQL or bulk endpoints for analytics.

## 3. Integration with Accurith IS Auditsphere (opportunity)

If IS Auditsphere remains a separate platform, Blackbox can plug in as an **AI-agent assurance module**:

| Integration | Value |
|---|---|
| Shared identity and project model | Single sign-on and tenancy |
| Findings export | Push verdicts as audit findings with evidence links |
| Control mapping | Rulebook checks tagged to audit control objectives |
| Workpaper generation | Reports usable in engagement files |

Decide early whether to keep the services separate (recommended for MVP) and integrate via API.

## 4. Technical evolution

| Area | Evolution |
|---|---|
| Architecture | Extract engine as a service if scale or isolation demands it (ADR-001 revisit trigger: sustained worker saturation or multi-region need) |
| Storage | Partition step and ledger tables by time; cold storage for old raw uploads |
| Rules | Compile expressions to bytecode for speed; precompute indexes (steps by tool) |
| Models | Support multiple judges and ensembles with disagreement surfacing |
| Evaluation | Continuous evaluation service with drift alerts on benchmark metrics |

## 5. Research directions

- Better lineage tracking (value provenance across steps) for foundation-error detection.
- Learned recoverability: estimate whether a run could still succeed from a given step.
- Failure-injection libraries per domain.
- Human-in-the-loop labeling UX to grow benchmarks quickly.
- Calibration of confidence scores against reviewer agreement.

## 6. Commercial options

| Model | Notes |
|---|---|
| Internal tool for audit engagements | Fastest validation |
| Paid pilot | Per project fee, includes rulebook authoring support |
| SaaS | Per seat or per investigation, volume tiers |
| Self-hosted enterprise license | For regulated customers with data residency needs |
| Services | Rulebook design, agent assurance reviews |

> Validate pricing and positioning with pilot customers before publishing.

## 7. Decision triggers (when to build what)

| Trigger | Action |
|---|---|
| 3+ pilots ask for the same framework | Build that adapter |
| Reviewer agreement < 70% on a category | Revise taxonomy guidance or add rules |
| > 30% verdicts `model_only` | Invest in rulebooks and derivation |
| Customer needs data residency | Prioritize self-hosted package and local model |
| Audit teams request control mapping | Prioritize control library (H2) |

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Initial version |
