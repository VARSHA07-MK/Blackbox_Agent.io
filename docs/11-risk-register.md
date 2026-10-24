# 11. Risk Register

Scoring: Likelihood (L) and Impact (I) from 1 (low) to 5 (high). Score = L × I. Review at every sprint review; escalate scores ≥ 15 to steering.

| ID | Risk | Category | L | I | Score | Mitigation | Contingency | Owner |
|---|---|---|---|---|---|---|---|---|
| R-01 | Accuracy too low to be useful because rulebooks are thin | Product | 4 | 5 | 20 | Start with strong derived checks; domain advisor writes policy checks; benchmark gate; fault-injection coverage | Ship as "evidence assistant" (ledger + model suggestion) with clear confidence labels | PO |
| R-02 | Prompt injection in traces manipulates the verdict | Security | 3 | 5 | 15 | ADR-006 controls; no tools for model; schema validation; reconciliation caps; injection corpus in CI | Disable model stage per project; rules-only mode | Tech lead |
| R-03 | Sensitive data leaks to LLM provider | Privacy | 3 | 5 | 15 | Redaction before storage and model; evidence-only prompts; provider no-training terms; "no external model" mode | Private/self-hosted model option; pause pilots | Security |
| R-04 | IP/legal challenge due to similarity with an existing research product | Legal | 2 | 5 | 10 | Original names, schema, taxonomy, UI (doc 15); counsel review; no copied code or assets; license check on any dataset | Rename/redesign affected element quickly | Founder |
| R-05 | No labeled data for benchmark | Delivery | 4 | 4 | 16 | Fault-injection harness; label own pilot traces; two-reviewer protocol | Smaller benchmark with caveats on claims | BA |
| R-06 | Model cost or latency grows with trace size | Cost | 3 | 3 | 9 | Evidence-only prompts, excerpt caps, caching, per-project budgets | Rules-only fast path | Tech lead |
| R-07 | Rule DSL too limited or too complex for authors | Product | 3 | 4 | 12 | Start small; helper library; examples; "test on trace" in editor; custom helpers as admin plugins | Add helper functions based on pilot feedback | Tech lead |
| R-08 | Non-deterministic or flaky tests from model dependency | Quality | 3 | 3 | 9 | Fake judge in CI; recorded fixtures; benchmark separate from unit CI | Quarantine flaky tests with owner | QA |
| R-09 | Scope creep toward live guardrails or full observability | Delivery | 4 | 3 | 12 | Non-goals documented (doc 01); PO prioritization; roadmap in doc 14 | Re-baseline scope at sprint review | PO |
| R-10 | Key-person dependency (small team) | Delivery | 3 | 4 | 12 | Documentation (this set), pairing, ADRs, runbooks | Cross-train; contractor surge | Founder |
| R-11 | Trace formats vary widely; adapters take longer | Delivery | 4 | 3 | 12 | Generic JSONL first; clear schema docs; customer-side export helper | Provide conversion scripts and templates | Dev |
| R-12 | Ledger/report integrity claims challenged | Compliance | 2 | 4 | 8 | Hash chain, stored versions and hashes, reproducibility tests | Offer independent re-verification tool | Dev |
| R-13 | Provider outage or API changes | Operations | 3 | 3 | 9 | Provider interface; retries, circuit breaker; fallback provider | Rules-only verdicts with banner | DevOps |
| R-14 | Users over-trust verdicts | Product/Ethics | 3 | 4 | 12 | Confidence and basis labels; evidence links; human review workflow; docs on limits | Add mandatory review for critical categories | PO |
| R-15 | Vendor-specific data retention or residency requirements block pilots | Commercial | 3 | 3 | 9 | Retention controls; region-pinned model option; clear data-flow doc | Self-hosted deployment package | Founder |
| R-16 | Dependency vulnerabilities or license conflicts | Security/Legal | 3 | 3 | 9 | SCA scans, lockfiles, license report in CI | Replace or patch dependency | DevOps |

## Risk heat map (summary)

| | Impact 3 | Impact 4 | Impact 5 |
|---|---|---|---|
| **L5** | | | |
| **L4** | R-09, R-11 | R-05 | R-01 |
| **L3** | R-06, R-08, R-13, R-15, R-16 | R-07, R-10, R-14 | R-02, R-03 |
| **L2** | | R-12 | R-04 |

## Assumption and issue log (template)

| ID | Type | Description | Owner | Status | Due |
|---|---|---|---|---|---|
| A-01 | Assumption | Pilot users can export traces in JSON/JSONL | PO | Open | S2 |
| A-02 | Assumption | Tool schemas available for pilot agents | BA | Open | S2 |
| I-01 | Issue | (add as they arise) | | | |

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Initial version |
