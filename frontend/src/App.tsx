import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { analyzeTrace, listInvestigations, getInvestigation, checkApiHealth } from "./api/client";
import { demoAnalysis, demoTrace } from "./demo";
import type { Analysis, Step } from "./types";

function stepLabel(step: Step): string {
  return step.tool_call?.tool ?? step.tool_result?.tool ?? step.content?.slice(0, 28) ?? step.kind;
}

function App() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(
    demoAnalysis.summary.pnr_step ?? 0,
  );
  const [error, setError] = useState("");

  const { data: investigations } = useQuery({
    queryKey: ["investigations"],
    queryFn: listInvestigations,
  });

  const { data: fetchedAnalysis } = useQuery({
    queryKey: ["investigation", activeId],
    queryFn: () => getInvestigation(activeId!),
    enabled: !!activeId,
  });

  const { data: apiHealthy } = useQuery({
    queryKey: ["healthz"],
    queryFn: checkApiHealth,
    refetchInterval: 30_000,
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (args: { sourceFormat: string; trace: string | object }) =>
      analyzeTrace(args.sourceFormat, args.trace),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["investigations"] });
      setActiveId(result.investigation_id);
      setSelectedStepIndex(result.summary.pnr_step ?? 0);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Analysis failed");
    },
  });

  const analysis: Analysis = activeId && fetchedAnalysis ? fetchedAnalysis : demoAnalysis;
  const isDemo = !activeId;

  useEffect(() => {
    setSelectedStepIndex(analysis.summary.pnr_step ?? 0);
  }, [analysis]);

  const selectedStep = analysis.record.steps.find((s) => s.index === selectedStepIndex);
  const selectedEvidence = analysis.ledger.filter((e) => e.step_idx === selectedStepIndex);
  const apiOk = apiHealthy === true;
  const busy = isPending;

  async function runDemo() {
    setError("");
    const traceStr = demoTrace.map((s) => JSON.stringify(s)).join("\n");
    try {
      await mutateAsync({ sourceFormat: "generic-jsonl", trace: traceStr });
    } catch {
      // error handled in onError
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError("");
    const text = await file.text();
    let sourceFormat = "generic-jsonl";
    let trace: string | object = text;
    if (!/\.(jsonl|ndjson)$/i.test(file.name)) {
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (Array.isArray(parsed.steps)) {
          sourceFormat = "flight-record-1";
          trace = parsed;
        }
      } catch {
        // keep JSONL
      }
    }
    try {
      await mutateAsync({ sourceFormat, trace });
    } catch {
      // error handled in onError
    }
  }

  function exportReport() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...analysis }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${analysis.record.record_id}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      {/* LEFT SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="brand-mark">B</span>
          <span className="brand-name">
            BLACKBOX<span className="brand-sub"> / AGENTS</span>
          </span>
          <span
            className={`api-dot ${apiOk ? "ok" : "off"}`}
            title={apiOk ? "API ready" : "API offline"}
          />
        </div>

        <div className="sidebar-section-label">INVESTIGATIONS</div>

        <div className="inv-list">
          {/* Demo entry always first */}
          <button
            className={`inv-item ${!activeId ? "active" : ""}`}
            onClick={() => {
              setActiveId(null);
              setSelectedStepIndex(demoAnalysis.summary.pnr_step ?? 0);
            }}
          >
            <span className="inv-item-goal">Demo — Cancel order 1042</span>
            <span className="inv-item-meta">
              <span>4 steps</span>
              <span className="findings-badge violation">2</span>
              <span>Sample</span>
            </span>
          </button>

          {investigations?.investigations.map((inv) => (
            <button
              key={inv.id}
              className={`inv-item ${activeId === inv.id ? "active" : ""}`}
              onClick={() => {
                setActiveId(inv.id);
                setSelectedStepIndex(inv.pnr_step ?? 0);
              }}
            >
              <span className="inv-item-goal">{inv.task_goal}</span>
              <span className="inv-item-meta">
                <span>{inv.step_count} steps</span>
                <span className={`findings-badge ${inv.violation_count > 0 ? "violation" : "clean"}`}>
                  {inv.violation_count}
                </span>
                <span>{new Date(inv.created_at).toLocaleDateString()}</span>
              </span>
            </button>
          ))}

          {investigations?.investigations.length === 0 && (
            <div className="empty-sidebar">
              No investigations yet.
              <br />
              Import a trace to start.
            </div>
          )}
        </div>

        <div className="sidebar-actions">
          <button className="btn-demo" onClick={() => void runDemo()} disabled={busy}>
            {busy ? "Analyzing…" : "▶ Run demo"}
          </button>
          <button
            className="btn-import"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            ↑ Import trace
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.jsonl,.ndjson"
            hidden
            onChange={(e) => void handleFile(e)}
          />
        </div>
      </aside>

      {/* RIGHT CONSOLE */}
      <main className="console">
        {/* Topbar */}
        <div className="console-topbar">
          <div className="topbar-left">
            <span className="record-id">{analysis.record.record_id}</span>
            <span className="topbar-sep">/</span>
            <span className="task-goal">{analysis.record.task.goal}</span>
          </div>
          <div className="topbar-right">
            {isDemo && <span className="demo-badge">DEMO</span>}
            <button className="btn-export" onClick={exportReport}>
              ↓ Export
            </button>
          </div>
        </div>

        {/* Horizontal step timeline */}
        <div className="timeline-rail" role="list">
          {analysis.record.steps.map((step) => {
            const evidence = analysis.ledger.filter((e) => e.step_idx === step.index);
            const isPnr = step.index === analysis.summary.pnr_step;
            const hasViolation = evidence.length > 0;
            return (
              <button
                key={step.index}
                role="listitem"
                className={[
                  "step-pill",
                  `kind-${step.kind}`,
                  selectedStepIndex === step.index ? "selected" : "",
                  isPnr ? "pnr" : "",
                  hasViolation ? "violation" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelectedStepIndex(step.index)}
              >
                {isPnr && <span className="pnr-label">PNR</span>}
                {hasViolation && <span className="viol-dot" />}
                <span className="pill-index">{String(step.index).padStart(2, "0")}</span>
                <span className="pill-name">{stepLabel(step)}</span>
                <span className="pill-actor">{step.actor}</span>
              </button>
            );
          })}
        </div>

        {/* Verdict banner */}
        <div
          className={`verdict-banner ${analysis.summary.pnr_step === null ? "verdict-clean" : "verdict-pnr"}`}
        >
          <span className="verdict-icon">
            {analysis.summary.pnr_step === null ? "✓" : "⚠"}
          </span>
          <div className="verdict-body">
            <strong>
              {analysis.summary.pnr_step === null
                ? "No violations — run completed normally"
                : `Point of No Return — Step ${analysis.summary.pnr_step}`}
            </strong>
            <span className="verdict-detail">
              {analysis.summary.pnr_step === null
                ? `${analysis.summary.step_count} steps · ${analysis.checks.length} checks · no irreversible action`
                : (analysis.ledger.find((e) => e.step_idx === analysis.summary.pnr_step)?.message ?? "")}
            </span>
          </div>
          {analysis.summary.taxonomy_code && (
            <span className="taxonomy-tag">{analysis.summary.taxonomy_code}</span>
          )}
          <span className="basis-tag">
            {analysis.summary.basis === "rules" ? "DETERMINISTIC RULES" : "NO RULE EVIDENCE"}
          </span>
        </div>

        {/* Body: ledger + inspector */}
        <div className="console-body">
          {/* Evidence ledger */}
          <section className="ledger-col panel-card">
            <div className="panel-card-header">
              <h2>Evidence ledger</h2>
              <span className="count-badge">{analysis.ledger.length}</span>
              <span className="chain-note">SHA-256 chained</span>
            </div>

            {analysis.ledger.length === 0 ? (
              <div className="ledger-empty">
                <span className="inspector-empty">No rule violations in this run.</span>
              </div>
            ) : (
              <>
                <div className="ledger-table-wrap">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>SEQ</th>
                        <th>STEP</th>
                        <th>CHECK</th>
                        <th>SEV</th>
                        <th>CHAIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.ledger.map((entry) => (
                        <tr
                          key={`${entry.seq}-${entry.check_id}`}
                          className={selectedStepIndex === entry.step_idx ? "row-active" : ""}
                          onClick={() => setSelectedStepIndex(entry.step_idx)}
                        >
                          <td className="mono">{String(entry.seq).padStart(3, "0")}</td>
                          <td>
                            <button
                              className="step-ref"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelectedStepIndex(entry.step_idx);
                              }}
                            >
                              {String(entry.step_idx).padStart(2, "0")}
                            </button>
                          </td>
                          <td>
                            <span className="check-id">{entry.check_id}</span>
                            <span className="check-title">{entry.title}</span>
                          </td>
                          <td>
                            <span className={`sev-badge sev-${entry.severity}`}>
                              {entry.severity}
                            </span>
                          </td>
                          <td>
                            <span className="chain-dot" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ledger-footer">
                  <span className="hash-preview" title={analysis.summary.trace_hash}>
                    {analysis.summary.trace_hash.slice(0, 20)}…
                  </span>
                </div>
              </>
            )}
          </section>

          {/* Step inspector */}
          <section className="inspector-col panel-card">
            <div className="panel-card-header">
              <h2>Step {String(selectedStepIndex).padStart(2, "0")}</h2>
              {selectedStep && (
                <span className={`kind-tag kind-${selectedStep.kind}`}>
                  {selectedStep.kind.replace(/_/g, " ")}
                </span>
              )}
              <span className="actor-tag">{selectedStep?.actor ?? "—"}</span>
            </div>

            {selectedStep ? (
              <div className="inspector-step">
                <div className="step-json">
                  <div className="json-header">
                    <span>SOURCE EVENT</span>
                    <button
                      onClick={() =>
                        void navigator.clipboard?.writeText(
                          JSON.stringify(selectedStep, null, 2),
                        )
                      }
                    >
                      Copy
                    </button>
                  </div>
                  <pre>{JSON.stringify(selectedStep, null, 2)}</pre>
                </div>

                {selectedEvidence.length > 0 && (
                  <div className="evidence-cards">
                    <div className="evidence-label">
                      Rule evidence · {selectedEvidence.length} linked
                    </div>
                    {selectedEvidence.map((ev) => (
                      <div key={ev.check_id} className="ev-card">
                        <div className="ev-card-top">
                          <span className={`sev-badge sev-${ev.severity}`}>{ev.severity}</span>
                          <code className="ev-check-id">{ev.check_id}</code>
                        </div>
                        <strong className="ev-title">{ev.title}</strong>
                        <p className="ev-message">{ev.message}</p>
                        <div className="ev-expected">
                          <span className="ev-expected-label">EXPECTED</span> {ev.expected}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="inspector-empty">
                Select a step in the timeline to inspect it.
              </div>
            )}
          </section>
        </div>

        {/* Error toast */}
        {error && (
          <div className="error-toast" role="alert">
            <span>!</span> {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
