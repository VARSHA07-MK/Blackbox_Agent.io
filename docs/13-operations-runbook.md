# 13. Operations and Maintenance Runbook

## 1. Service overview

| Component | Role | Health check |
|---|---|---|
| api | REST API | `GET /healthz` (liveness), `GET /readyz` (db, redis, storage) |
| worker | Runs investigations | Heartbeat metric, queue age |
| postgres | Primary data | Connection test, replication lag if replicated |
| redis | Queue | `PING`, memory, eviction policy `noeviction` |
| object storage | Raw uploads, reports | Put/get probe |
| judge provider | External LLM | Success rate, latency, error classes |

## 2. Service levels (pilot)

| Item | Target |
|---|---|
| Availability | 99.5% monthly |
| Investigation start latency (queue wait) | < 30 s p95 |
| Support response | Business hours, 1 working day for S3, 4 hours for S1/S2 |

## 3. Severity and escalation

| Sev | Definition | Response | Escalate to |
|---|---|---|---|
| S1 | Data exposure, cross-tenant access, ledger corruption, full outage | Immediate, all hands | Founder + security lead |
| S2 | Core pipeline down, wrong verdicts at scale | 1 hour | Tech lead |
| S3 | Degraded performance, single-customer issue | 1 working day | On-call dev |
| S4 | Minor | Backlog | |

## 4. Routine operations

| Task | Frequency | Procedure |
|---|---|---|
| Review alerts and dashboards | Daily | Queue age, failure rate, judge errors, cost |
| Check backups | Daily | Confirm last backup success; alert on failure |
| Apply dependency updates | Weekly | Merge bot PRs after CI, deploy to staging first |
| Rotate secrets | Quarterly or on exposure | Secret manager rotation, redeploy, revoke old |
| Access review | Quarterly | Review users, roles, API keys; revoke unused |
| Restore test | Quarterly | Restore latest backup into a scratch environment; verify checksum and a sample investigation |
| Benchmark run and report | Nightly + per release | Archive results; investigate drops > 2 points |
| Retention job verification | Monthly | Confirm deletions and audit entries |
| Certificate renewal check | Monthly | Automatic renewal, alert 14 days before expiry |

## 5. Runbooks

### 5.1 Queue backlog growing

1. Check worker count and CPU/memory.
2. Check judge provider status and error rate.
3. If provider degraded, enable rules-only fallback flag (verdicts labeled `basis=rules`).
4. Scale workers up to the configured cap.
5. After recovery, rerun affected investigations that used the fallback (admin bulk rerun).

### 5.2 Judge provider failing

1. Confirm via metrics: error class (auth, rate limit, timeout, schema violation).
2. Auth: rotate key. Rate limit: reduce concurrency, enable cache-only mode for repeats.
3. Schema violations spike: check recent prompt or model change; roll back prompt version.
4. Switch provider via `BB_JUDGE_PROVIDER` if a fallback is configured.

### 5.3 Investigation stuck in `running`

1. Find job in the queue and worker logs by `investigation_id`.
2. If worker crashed, requeue (idempotent). If repeated, move to dead-letter queue and mark `failed` with reason.
3. Inspect the trace for pathological size or nesting; apply limits.

### 5.4 Suspected data exposure

1. Declare S1; assign incident lead.
2. Contain: revoke affected keys and sessions, disable affected endpoints if needed.
3. Assess scope using audit logs and access logs.
4. Preserve evidence (snapshots, logs) before changes where possible.
5. Notify customers and authorities as required by contract and law (counsel decides timing and content).
6. Rotate secrets, patch, verify.
7. Post-incident review within 5 working days (blameless), update threat model and tests.

### 5.5 Restore from backup

1. Identify the target time (WAL point-in-time for Postgres).
2. Restore into a new instance; verify migrations level and row counts.
3. Verify ledger hash chains for a sample of investigations.
4. Switch traffic after verification; record the event in the audit log.

### 5.6 Ledger integrity alert

1. Run `blackbox verify-ledger --investigation <id>` (or all).
2. If a chain break is found: S1, freeze writes to the affected table, compare against backup, investigate access.

### 5.7 Rollback a release

1. Redeploy previous image tag.
2. If a migration was applied, confirm it is backward compatible; otherwise run the documented down-migration.
3. Verify with smoke tests.
4. Open a defect with root cause.

## 6. Monitoring and alert catalog

| Alert | Condition | Severity |
|---|---|---|
| QueueAgeHigh | Oldest job > 5 min | S3 |
| WorkerDown | No heartbeat 2 min | S2 |
| JudgeErrorRate | > 10% over 10 min | S2 |
| ApiErrorRate | 5xx > 2% over 5 min | S2 |
| DiskUsage | > 80% | S3 |
| BackupFailed | Any failure | S2 |
| CertExpiry | < 14 days | S3 |
| LedgerVerifyFailed | Any | S1 |
| CostSpike | Daily judge spend > 2× 7-day mean | S3 |

## 7. Maintenance and change management

- Changes via PR; production deploys from tags with approval.
- Maintenance windows announced to pilot customers at least 48 hours ahead (except emergencies).
- Database migrations: expand then contract; test on a copy of production-like data first.
- Taxonomy or rulebook schema changes: version bump, migration notes, rerun benchmark.

## 8. Capacity planning

Track monthly: investigations/day, average steps, judge tokens, storage growth, worker utilization. Plan scaling when sustained utilization > 60% or storage > 70% of provisioned.

## 9. Support process

| Step | Detail |
|---|---|
| Intake | Support email or portal; capture project, investigation id, expected vs. observed |
| Triage | Assign severity; check known issues |
| Diagnose | Reproduce using stored inputs (reproducibility is a design goal) |
| Resolve | Fix, workaround, or rulebook guidance |
| Learn | Add regression test and, if relevant, a new derived or example check |

## 10. Knowledge base topics (to write)

Getting started, preparing a trace export, writing your first check, reading a verdict, understanding confidence and basis, redaction setup, API quickstart, CI integration, troubleshooting uploads, FAQ on data handling.

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Initial version |
