import { useRef, useState, useMemo, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getInvestigation, analyzeTrace } from "../api/client";
import { Icon } from "../components/Icon";
import { demoAnalysis, demoTrace } from "../demo";
import type { Analysis, LedgerEntry, Step } from "../types";

const formatKind = (kind: string) => kind.replaceAll("_", " ");

function stepLabel(step: Step) {
  if (step.tool_call) return step.tool_call.tool;
  if (step.tool_result) return step.tool_result.tool;
  return step.content ?? formatKind(step.kind);
}

export function InvestigationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDemo = !id || id === "demo";
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedStep, setSelectedStep] = useState(0);
  const [violationsOnly, setViolationsOnly] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Loading investigation…");

  const {
    data: fetched,
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ["investigation", id],
    queryFn: () => getInvestigation(id!),
    enabled: !isDemo,
  });

  const analysis: Analysis | undefined = isDemo ? demoAnalysis : fetched;

  useEffect(() => {
    if (isDemo) {
      setSelectedStep(demoAnalysis.summary.pnr_step ?? 0);
      setMessage("Showing the bundled sample investigation");
    } else if (analysis) {
      setSelectedStep(analysis.summary.pnr_step ?? analysis.record.steps[0]?.index ?? 0);
      setMessage(
        `Analyzed ${analysis.summary.step_count} steps · ${analysis.summary.violation_count} rule findings`,
      );
    }
  }, [isDemo, analysis]);

  const { mutate: runAnalyze, isPending: busy } = useMutation({
    mutationFn: ({
      sourceFormat,
      trace,
    }: {
      sourceFormat: string;
      trace: string | object;
    }) => analyzeTrace(sourceFormat, trace),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["investigations"] });
      void navigate(`/investigations/${result.investigation_id}`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Analysis failed"),
  });

  async function loadFile(file?: File) {
    if (!file) return;
    setError("");
    const text = await file.text();
    if (
      file.name.toLowerCase().endsWith(".jsonl") ||
      file.name.toLowerCase().endsWith(".ndjson")
    ) {
      runAnalyze({ sourceFormat: "generic-jsonl", trace: text });
      return;
    }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (Array.isArray(parsed["steps"])) {
        runAnalyze({ sourceFormat: "flight-record-1", trace: parsed });
      } else {
        runAnalyze({ sourceFormat: "generic-jsonl", trace: text });
      }
    } catch {
      setError("Could not read this file. Choose a Flight Record JSON file or a JSONL trace.");
    }
  }

  function exportReport() {
    if (!analysis) return;
    const report = {
      product: "Blackbox for Agents",
      exported_at: new Date().toISOString(),
      summary: analysis.summary,
      record: analysis.record,
      ledger: analysis.ledger,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${analysis.record.record_id}-report.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function review(action: string) {
    setMessage(`Review action "${action}" is ready to connect to a review service.`);
  }

  function openLedgerEntry(entry: LedgerEntry) {
    setSelectedStep(entry.step_idx);
    document
      .getElementById(`step-${entry.step_idx}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const selectedEvidence = useMemo(
    () => (analysis?.ledger ?? []).filter((entry) => entry.step_idx === selectedStep),
    [analysis?.ledger, selectedStep],
  );
  const visibleSteps = useMemo(() => {
    if (!analysis) return [];
    return violationsOnly
      ? analysis.record.steps.filter((step) =>
          analysis.ledger.some((entry) => entry.step_idx === step.index),
        )
      : analysis.record.steps;
  }, [analysis, violationsOnly]);

  const pnr = analysis?.summary.pnr_step ?? null;

  if (isLoading) {
    return (
      <section className="content">
        <Link to="/investigations" className="back-link">
          ← All investigations
        </Link>
        <div className="list-loading">Loading investigation…</div>
      </section>
    );
  }

  if (fetchError || (!isDemo && !analysis)) {
    return (
      <section className="content">
        <Link to="/investigations" className="back-link">
          ← All investigations
        </Link>
        <div className="error-banner" role="alert">
          <span>!</span>
          <div>
            <strong>Could not load investigation</strong>
            <small>
              {fetchError instanceof Error ? fetchError.message : "Investigation not found"}
            </small>
          </div>
        </div>
      </section>
    );
  }

  if (!analysis) return null;

  return (
    <section className="content">
      <Link to="/investigations" className="back-link">
        ← All investigations
      </Link>

      <div className="page-heading">
        <div>
          <div className="eyebrow">
            INVESTIGATION CONSOLE <span>·</span> RETAIL CORE 1.2.0
          </div>
          <h1>Investigation overview</h1>
          <p>See what happened, where the run became unrecoverable, and the evidence behind it.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={exportReport}>
            <Icon name="export" /> Export report
          </button>
          <button
            className="button button-primary"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <Icon name="upload" /> Import trace
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,.jsonl,.ndjson,application/json"
            hidden
            onChange={(event) => void loadFile(event.target.files?.[0])}
          />
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>!</span>
          <div>
            <strong>Trace could not be analyzed</strong>
            <small>{error}</small>
          </div>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      <section
        className={`verdict-card ${pnr === null ? "verdict-clear" : ""}`}
        aria-label="Investigation verdict"
      >
        <div className="verdict-icon">
          <Icon name={pnr === null ? "check" : "flag"} />
        </div>
        <div className="verdict-main">
          <div className="verdict-kicker">
            {pnr === null ? "NO RULE-BACKED POINT OF NO RETURN" : "POINT OF NO RETURN"}
            <span className="basis-pill">
              <Icon name="shield" />{" "}
              {analysis.summary.basis === "rules" ? "Rules backed" : "No rule evidence"}
            </span>
          </div>
          <div className="verdict-title">
            {pnr === null ? (
              "No irreversible violation found"
            ) : (
              <>
                Step <strong>{pnr}</strong>{" "}
                <span className="verdict-dash">—</span>{" "}
                {analysis.ledger.find((e) => e.step_idx === pnr)?.title ??
                  "First unrecoverable violation"}
              </>
            )}
          </div>
          <div className="verdict-subtitle">
            {pnr === null
              ? "The active checks found no unrecoverable violation in this run."
              : analysis.ledger.find((e) => e.step_idx === pnr)?.message}
          </div>
        </div>
        <div className="verdict-category">
          <span>ROOT CATEGORY</span>
          <strong>
            <i /> {analysis.summary.taxonomy_code ?? "—"} <em>Policy breach</em>
          </strong>
        </div>
        <div className="verdict-actions">
          <button onClick={() => review("Accepted")}>Accept</button>
          <button onClick={() => review("Correction")}>Correct</button>
          <button aria-label="More review actions" onClick={() => review("Rejected")}>
            ···
          </button>
        </div>
      </section>

      <div className="stats-grid">
        <article className="stat-card">
          <div className="stat-heading">
            TRACE STEPS <span className="stat-icon blue">⌁</span>
          </div>
          <div className="stat-value">
            {analysis.summary.step_count}
            <small> steps</small>
          </div>
          <div className="stat-foot">{analysis.record.task.goal}</div>
        </article>
        <article className="stat-card">
          <div className="stat-heading">
            RULE FINDINGS <span className="stat-icon red">!</span>
          </div>
          <div className="stat-value">
            {analysis.summary.violation_count}
            <small> findings</small>
          </div>
          <div className="stat-foot">
            {analysis.checks.length} checks applied ·{" "}
            <b>{analysis.summary.violation_count ? "Review required" : "No violations"}</b>
          </div>
        </article>
        <article className="stat-card integrity-card">
          <div className="stat-heading">
            EVIDENCE INTEGRITY <span className="stat-icon green"><Icon name="shield" /></span>
          </div>
          <div className="integrity-value">
            <span>
              <Icon name={isDemo ? "shield" : "check"} />
            </span>
            <strong>{isDemo ? "Sample preview" : "Hash chain linked"}</strong>
          </div>
          <div className="stat-foot">
            {isDemo
              ? "Illustrative sample · not verified"
              : `${analysis.ledger.length} ledger entries · SHA-256`}
          </div>
        </article>
      </div>

      <section className="panel investigation-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title-row">
              <h2>Run replay</h2>
              <span className="live-dot" />
              <span className="run-status">ANALYZED</span>
            </div>
            <p>{message}</p>
          </div>
          <div className="panel-tools">
            <button
              className={`filter-button ${violationsOnly ? "filter-active" : ""}`}
              onClick={() => setViolationsOnly(!violationsOnly)}
            >
              <span className="filter-square">{violationsOnly && "✓"}</span> Violations only
            </button>
            <button className="icon-button" aria-label="More replay actions">
              ···
            </button>
          </div>
        </div>
        <div className="timeline" role="list" aria-label="Trace timeline">
          {visibleSteps.map((step) => {
            const evidence = analysis.ledger.filter((entry) => entry.step_idx === step.index);
            const flagged = step.index === pnr;
            return (
              <button
                id={`step-${step.index}`}
                role="listitem"
                key={step.index}
                className={`timeline-step ${selectedStep === step.index ? "selected" : ""} ${flagged ? "flagged" : ""} ${pnr !== null && step.index > pnr ? "downstream" : ""}`}
                onClick={() => setSelectedStep(step.index)}
                aria-current={selectedStep === step.index ? "step" : undefined}
              >
                <span
                  className={`step-marker ${flagged ? "marker-pnr" : evidence.length ? "marker-violation" : ""}`}
                >
                  {flagged ? <Icon name="flag" /> : evidence.length ? "!" : step.index + 1}
                </span>
                <span className="step-number">STEP {String(step.index).padStart(2, "0")}</span>
                <strong className="step-name">{stepLabel(step)}</strong>
                <span className="step-kind">{formatKind(step.kind)}</span>
                <span
                  className={`actor-badge ${step.actor === "user" ? "actor-user" : step.actor === "tool" ? "actor-tool" : "actor-agent"}`}
                >
                  {step.actor}
                </span>
                {evidence.length > 0 && (
                  <span className="step-findings">
                    {evidence.length} {evidence.length === 1 ? "finding" : "findings"}
                  </span>
                )}
              </button>
            );
          })}
          {visibleSteps.length === 0 && (
            <div className="empty-timeline">No violating steps in this run.</div>
          )}
        </div>
        {pnr !== null && analysis.summary.step_count - pnr - 1 > 0 && (
          <div className="downstream-note">
            <span>⌄</span>
            {analysis.summary.step_count - pnr - 1} later{" "}
            {analysis.summary.step_count - pnr - 1 === 1 ? "step" : "steps"} follow the Point of
            No Return
          </div>
        )}
      </section>

      <div className="lower-grid">
        <section className="panel inspector-panel">
          <div className="panel-header compact">
            <div>
              <div className="eyebrow">STEP INSPECTOR</div>
              <h2>
                Step {String(selectedStep).padStart(2, "0")}{" "}
                <span>· {analysis.record.steps[selectedStep]?.actor}</span>
              </h2>
            </div>
            <button className="icon-button" aria-label="Open step options">
              ···
            </button>
          </div>
          {analysis.record.steps[selectedStep] ? (
            <>
              <div className="inspector-meta">
                <span className="kind-tag">
                  {formatKind(analysis.record.steps[selectedStep].kind)}
                </span>
                <span>Index {analysis.record.steps[selectedStep].index}</span>
                <span>
                  {analysis.record.steps[selectedStep].ts ?? "Timestamp unavailable"}
                </span>
              </div>
              <div className="trace-code">
                <div className="code-label">
                  <span>TRACE EVENT</span>
                  <button
                    onClick={() =>
                      navigator.clipboard?.writeText(
                        JSON.stringify(analysis.record.steps[selectedStep], null, 2),
                      )
                    }
                  >
                    Copy JSON
                  </button>
                </div>
                <pre>{JSON.stringify(analysis.record.steps[selectedStep], null, 2)}</pre>
              </div>
              <div className="evidence-heading">
                <div>
                  <h3>Linked evidence</h3>
                  <span>
                    {selectedEvidence.length} ledger{" "}
                    {selectedEvidence.length === 1 ? "entry" : "entries"} for this step
                  </span>
                </div>
              </div>
              {selectedEvidence.length ? (
                <div className="evidence-list">
                  {selectedEvidence.map((entry) => (
                    <article className="evidence-card" key={entry.check_id}>
                      <div className="evidence-card-top">
                        <span className="severity-tag">
                          <i /> {entry.severity}
                        </span>
                        <code>{entry.check_id}</code>
                      </div>
                      <strong>{entry.title}</strong>
                      <p>{entry.message}</p>
                      <div className="expectation">
                        <span>EXPECTED</span>
                        {entry.expected}
                      </div>
                      <button
                        className="text-button"
                        onClick={() =>
                          document
                            .getElementById(`ledger-${entry.seq}`)
                            ?.scrollIntoView({ behavior: "smooth", block: "center" })
                        }
                      >
                        View ledger entry <Icon name="arrow" />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="no-evidence">
                  <span>
                    <Icon name="check" />
                  </span>
                  <div>
                    <strong>No findings on this step</strong>
                    <small>The active checks did not flag this event.</small>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="no-evidence">
              Choose a step in the replay to inspect its fields and evidence.
            </div>
          )}
        </section>

        <section className="panel ledger-panel" id="ledger-panel">
          <div className="panel-header compact">
            <div>
              <div className="eyebrow">APPEND-ONLY RECORD</div>
              <h2>
                Evidence ledger{" "}
                <span className="ledger-count">{analysis.ledger.length}</span>
              </h2>
            </div>
            <button className="button button-quiet" onClick={exportReport}>
              <Icon name="export" /> Export
            </button>
          </div>
          <div className="ledger-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SEQ</th>
                  <th>STEP</th>
                  <th>CHECK</th>
                  <th>SEVERITY</th>
                  <th>CHAIN</th>
                </tr>
              </thead>
              <tbody>
                {analysis.ledger.map((entry) => (
                  <tr
                    id={`ledger-${entry.seq}`}
                    key={entry.seq}
                    className={selectedStep === entry.step_idx ? "row-selected" : ""}
                    onClick={() => openLedgerEntry(entry)}
                  >
                    <td className="mono">{String(entry.seq).padStart(3, "0")}</td>
                    <td>
                      <button className="step-link">{String(entry.step_idx).padStart(2, "0")}</button>
                    </td>
                    <td>
                      <strong className="check-name">{entry.check_id}</strong>
                      <small>{entry.title}</small>
                    </td>
                    <td>
                      <span className="severity-pill">
                        <i /> {entry.severity}
                      </span>
                    </td>
                    <td>
                      <span className="chain-state">
                        <i /> linked
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {analysis.ledger.length === 0 && (
              <div className="ledger-empty">
                <span>
                  <Icon name="check" />
                </span>
                <strong>No evidence entries yet</strong>
                <small>Rule findings will appear here after analysis.</small>
              </div>
            )}
          </div>
          <div className="integrity-footer">
            <span>
              <Icon name="shield" />{" "}
              {isDemo ? "Sample chain preview" : "Chain integrity linked"}
            </span>
            <button title={analysis.summary.trace_hash}>
              {analysis.summary.trace_hash.slice(0, 18)}… <Icon name="arrow" />
            </button>
          </div>
        </section>
      </div>

      <section className="footer-note">
        <div>
          <span className="note-symbol">i</span>
          <p>
            <strong>Deterministic evidence first.</strong> This MVP runs built-in rules only. No
            model judgment is used; uncovered failures may not appear in the ledger.
          </p>
        </div>
        <button
          onClick={() =>
            runAnalyze({
              sourceFormat: "generic-jsonl",
              trace: demoTrace.map((step) => JSON.stringify(step)).join("\n"),
            })
          }
          disabled={busy}
        >
          {busy ? "Analyzing…" : "Run sample again"} <Icon name="arrow" />
        </button>
      </section>
      <footer className="page-footer">
        <span>
          BLACKBOX FOR AGENTS <i>·</i> LOCAL PROTOTYPE
        </span>
        <span>
          Trace hash <code>{analysis.summary.trace_hash.slice(0, 12)}</code>
        </span>
      </footer>
    </section>
  );
}
