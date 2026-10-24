# 08. Testing Strategy

## 1. Objectives

- Prove the engine is **deterministic** where promised and **accurate** where measured.
- Prevent regressions in rule evaluation, normalization, and verdict reconciliation.
- Verify security, privacy, and performance requirements.

## 2. Test pyramid

```
            ▲  E2E / UAT (few)
           ╱ ╲  Accuracy benchmark (scheduled)
          ╱   ╲ Integration & API contract
         ╱     ╲ Unit tests (many, fast)
        ▔▔▔▔▔▔▔▔▔
```

| Level | Scope | Tools | Run |
|---|---|---|---|
| Unit | Functions and classes in isolation | pytest, hypothesis | Every commit |
| Integration | Module combinations, DB, queue | pytest + testcontainers | Every PR |
| API contract | Request/response vs OpenAPI | schemathesis, pytest | Every PR |
| E2E | Browser flows | Playwright | Nightly + pre-release |
| Accuracy benchmark | PNR and category quality | Benchmark runner (FR-060) | Nightly + on rulebook change |
| Performance | Latency and throughput | Locust or k6 | Weekly + pre-release |
| Security | Authz, injection, fuzz, scans | See doc 07 | Per PR (scans) + pre-release |
| Accessibility | WCAG checks | axe + manual | Per release |
| UAT | Real users, real traces | Scripted sessions | Per release |

## 3. Unit test focus areas

| Module | What to test |
|---|---|
| Adapters | Valid and invalid inputs, ordering, missing fields, huge payloads |
| Normalizer | Schema conformance, index monotonicity, handoff mapping |
| Redactor | Each detector, placeholder stability, false positives, Unicode |
| Rulebook loader/linter | Every lint rule, error line numbers |
| Expression evaluator | Operators, helpers, timeouts, sandbox escapes, type errors |
| Deriver | Derived checks per schema shape (required, enum, nested, arrays) |
| Checker | Guard false skips assertion; errors become `check_error`; deterministic order |
| Recoverability | Each unrecoverable rule (irreversible, recovery, mutating, lineage) |
| Ledger | Hash chain correctness, append-only enforcement |
| Adjudicator | Prompt assembly, delimiter integrity, schema validation, retries |
| Reconciler | All cases in doc 05 section 5.5 |

**Property-based tests (hypothesis):**
- Re-running the scan on the same record and rulebook yields an identical ledger hash.
- Shuffling check definition order in YAML does not change the ledger (sorted evaluation).
- Redaction is idempotent.

## 4. Integration tests

- Upload → queue → worker → verdict with a **fake judge provider** (deterministic).
- Rulebook activation changes subsequent investigations only.
- Rerun with a different rulebook version produces a separate investigation and preserves the original.
- Retention job deletes data and writes audit entries.
- Multi-tenant isolation: project A credentials cannot read project B resources.

## 5. Golden-file tests

Maintain `tests/golden/`:
- `*.trace.jsonl` input
- `*.rulebook.yaml`
- `*.ledger.json` expected ledger
- `*.verdict.json` expected verdict (fake judge)
- `*.report.md` expected report

Any change to expected output needs a reviewed diff in the PR.

## 6. Accuracy benchmark

| Item | Specification |
|---|---|
| Dataset | At least 50 labeled traces at MVP, grown to 200+; stratified by failure category and domain |
| Labeling | Two reviewers per trace, third resolves disagreements; record inter-rater agreement |
| Splits | 80% development, 20% frozen test never used for tuning |
| Baselines | (a) Model-only judge with no rules, (b) rules-only, (c) full pipeline |
| Metrics | PNR top-1, PNR within-1, category agreement, evidence coverage, model-only rate, rule precision, latency, cost |
| Gate | A rulebook or prompt change must not reduce frozen-set PNR top-1 by more than 2 points without sign-off |
| Reporting | Benchmark report archived per release, with confusion matrix |

**Data sources:** your own agents, synthetic traces with injected faults (fault injection harness), and consented customer data. Check license terms before using any public dataset.

### 6.1 Fault-injection harness

Generate synthetic failures by mutating healthy traces:
- Drop a required argument (BB-CON).
- Replace a tool result value in later arguments with an unseen value (BB-GRD).
- Insert an error result that the next step ignores (BB-MIS).
- Remove user confirmation before a destructive call (BB-POL).
- Repeat a call N times (BB-LOP).
- Corrupt a handoff payload (BB-HND).

Because the injected step is known, labels are free. Use synthetic data for regression and coverage, but never as the only measure of real accuracy.

## 7. Performance testing

| Scenario | Target |
|---|---|
| Rule stage, 200-step trace | < 5 s (NFR-001) |
| End-to-end, 100-step trace | < 60 s p95 (NFR-002) |
| Concurrency | 20 simultaneous investigations (NFR-003) |
| Large upload | 50 MB accepted; 5,000 steps handled (NFR-014) |
| Soak | 4 hours constant load without memory growth |

Measure judge latency separately so rule-stage regressions are visible.

## 8. Security testing

See doc 07, sections 7 and 8. Add authorization matrix tests as parametrized tests: every role × every endpoint × own and foreign project.

## 9. Test data management

- No real customer data in the repo. Use synthetic or fully anonymized traces.
- Sensitive test fixtures are generated at test time.
- Seed script creates demo org, project, rulebook, and 10 sample traces for UAT and the guided sample.

## 10. Defect management

| Severity | Definition | Response |
|---|---|---|
| S1 | Data leak, wrong tenant access, ledger corruption | Stop release, fix immediately |
| S2 | Wrong verdict logic in common case, crash on valid input | Fix in current sprint |
| S3 | Minor logic, UI issue with workaround | Backlog, prioritize |
| S4 | Cosmetic | Backlog |

Track in the issue tracker with labels `bug`, `severity:S#`, `area:<module>`.

## 11. Entry and exit criteria

| Phase | Entry | Exit |
|---|---|---|
| Sprint testing | Story meets DoR | Acceptance criteria demonstrated, tests green |
| Release candidate | Feature freeze, staging deployed | No open S1/S2, benchmark gate met, security checklist complete |
| UAT | RC stable | Sign-off by product owner and audit lead |

## 12. Traceability

Each test is tagged with requirement ids, for example `@pytest.mark.req("FR-023")`. A script produces a coverage report: requirements with no test are flagged in CI.

## 13. CI quality gates

- Unit + integration pass.
- Coverage: overall ≥ 80%, engine modules ≥ 85% (NFR-011).
- Lint, type check (mypy/pyright strict on engine), frontend type check.
- Security scans free of high findings.
- Golden diffs reviewed.

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Initial version |
