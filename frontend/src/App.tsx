import { useEffect, useMemo, useRef, useState } from "react";
import { demoAnalysis, demoTrace } from "./demo";
import type { Analysis, LedgerEntry, Step } from "./types";

type Stage = "source" | "replay" | "evidence" | "decision";
type Review = { action: string; note: string; savedAt: string };

const stages: { id: Stage; number: string; label: string }[] = [
  { id: "source", number: "01", label: "Load trace" },
  { id: "replay", number: "02", label: "Replay" },
  { id: "evidence", number: "03", label: "Evidence" },
  { id: "decision", number: "04", label: "Human review" },
];

function stepLabel(step: Step) {
  if (step.tool_call) return step.tool_call.tool;
  if (step.tool_result) return step.tool_result.tool;
  return step.content || step.kind.replaceAll("_", " ");
}

function App() {
  const [analysis, setAnalysis] = useState<Analysis>(demoAnalysis);
  const [isDemo, setIsDemo] = useState(true);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [selectedStep, setSelectedStep] = useState(demoAnalysis.summary.pnr_step ?? 0);
  const [violationsOnly, setViolationsOnly] = useState(false);
  const [activeStage, setActiveStage] = useState<Stage>("replay");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Bundled example · preview data");
  const [error, setError] = useState("");
  const [review, setReview] = useState<Review | null>(() => {
    try { return JSON.parse(localStorage.getItem("blackbox-prototype-review") || "null") as Review | null; }
    catch { return null; }
  });
  const [reviewNote, setReviewNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pnr = analysis.summary.pnr_step;
  const selectedEvent = analysis.record.steps.find((step) => step.index === selectedStep);
  const selectedEvidence = useMemo(() => analysis.ledger.filter((entry) => entry.step_idx === selectedStep), [analysis.ledger, selectedStep]);
  const visibleSteps = violationsOnly
    ? analysis.record.steps.filter((step) => analysis.ledger.some((entry) => entry.step_idx === step.index))
    : analysis.record.steps;

  useEffect(() => {
    fetch("/healthz").then((response) => setApiConnected(response.ok)).catch(() => setApiConnected(false));
  }, []);

  async function analyzeTrace(sourceFormat: string, trace: string | object) {
    setBusy(true); setError(""); setActiveStage("replay"); setReview(null); localStorage.removeItem("blackbox-prototype-review");
    setMessage("Normalizing events and evaluating deterministic checks…");
    try {
      const response = await fetch("/v1/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_format: sourceFormat, trace }),
      });
      const result = await response.json();
      if (!response.ok) {
        const detail = result.detail;
        throw new Error(typeof detail === "object" ? `${detail.path || "trace"}: ${detail.message || "Invalid trace"}` : "Analysis failed");
      }
      const next = result as Analysis;
      setAnalysis(next); setIsDemo(false);
      setSelectedStep(next.summary.pnr_step ?? next.record.steps[0]?.index ?? 0);
      setMessage(`Analysis complete · ${next.summary.step_count} events · ${next.summary.violation_count} findings`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not analyze this trace.");
      setMessage("Analysis failed · current run is unchanged");
    } finally { setBusy(false); }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    const text = await file.text();
    if (/\.(jsonl|ndjson)$/i.test(file.name)) { await analyzeTrace("generic-jsonl", text); return; }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (Array.isArray(parsed.steps)) await analyzeTrace("flight-record-1", parsed);
      else await analyzeTrace("generic-jsonl", text);
    } catch { setError("Could not read this file. Choose a Flight Record JSON file or a JSONL trace."); }
  }

  function exportReport() {
    const report = { product: "Blackbox for Agents", exported_at: new Date().toISOString(), summary: analysis.summary, record: analysis.record, ledger: analysis.ledger };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${analysis.record.record_id}-report.json`; link.click(); URL.revokeObjectURL(url);
  }

  function saveReview(action: string) {
    const next = { action, note: reviewNote.trim(), savedAt: new Date().toISOString() };
    setReview(next); localStorage.setItem("blackbox-prototype-review", JSON.stringify(next));
    setReviewNote(""); setMessage(`Review saved locally · ${action.toLowerCase()}`);
  }

  function openLedgerEntry(entry: LedgerEntry) { setSelectedStep(entry.step_idx); setActiveStage("replay"); }

  return (
    <div className="prototype-shell" onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]); }}>
      {dragging && <div className="drop-overlay"><div><span>↓</span><strong>Drop a trace to investigate</strong><small>Flight Record JSON, JSONL or NDJSON</small></div></div>}
      <header className="masthead">
        <a className="brand" href="#top" aria-label="Blackbox for Agents home"><span className="brand-glyph">B<span>·</span></span><span>BLACKBOX <i> / </i> AGENT FORENSICS</span></a>
        <div className="masthead-right"><span className={`connection ${apiConnected === false ? "offline" : ""}`}><i />{apiConnected === null ? "CONNECTING" : apiConnected ? "LOCAL ENGINE READY" : "ENGINE OFFLINE"}</span><span className="env-tag">PROTOTYPE</span></div>
      </header>

      <main id="top" className="workbench">
        <div className="page-intro">
          <div><div className="overline">INVESTIGATION / {analysis.record.record_id}</div><h1>Agent run, reconstructed.</h1><p>Follow the event sequence, inspect rule evidence, and record a human disposition.</p></div>
          <div className="intro-actions"><button className="btn btn-quiet" onClick={exportReport}>Export record <span>↗</span></button><button className="btn btn-solid" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? "Analyzing…" : "＋ Load trace"}</button><input ref={inputRef} type="file" accept=".json,.jsonl,.ndjson,application/json" hidden onChange={(event) => { void loadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></div>
        </div>

        <nav className="workflow" aria-label="Investigation workflow">
          {stages.map((stage, index) => <button key={stage.id} className={`workflow-step ${activeStage === stage.id ? "current" : ""} ${index < stages.findIndex((item) => item.id === activeStage) ? "visited" : ""}`} onClick={() => setActiveStage(stage.id)}><span className="workflow-number">{stage.number}</span><span>{stage.label}</span>{index < stages.length - 1 && <i className="workflow-connector" />}</button>)}
          <span className="workflow-caption">TRACE → DISPOSITION</span>
        </nav>

        {error && <div className="error-banner" role="alert"><strong>Trace not loaded</strong><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}

        <section className={`finding-banner ${pnr === null ? "finding-clear" : ""}`}>
          <div className="finding-sigil">{pnr === null ? "✓" : "!"}</div>
          <div className="finding-copy"><div className="overline">{pnr === null ? "RULE CHECK RESULT" : "FIRST POINT OF NO RETURN"}<span className="rule-chip">DETERMINISTIC RULES</span></div><h2>{pnr === null ? "No irreversible rule violation detected" : <>Event <b>{String(pnr).padStart(2, "0")}</b><span className="finding-sep">/</span>{analysis.ledger.find((entry) => entry.step_idx === pnr)?.title || "Potential point of no return"}</>}</h2><p>{pnr === null ? "The configured checks did not identify an irreversible event in this trace." : analysis.ledger.find((entry) => entry.step_idx === pnr)?.message}</p></div>
          <div className="finding-meta"><span>RUN STATE</span><strong>{review ? "REVIEWED" : pnr === null ? "NO FINDING" : "NEEDS REVIEW"}</strong><small>{message}</small></div>
          <button className="finding-action" onClick={() => setActiveStage("decision")}>{review ? "View decision ↗" : "Review finding ↗"}</button>
        </section>

        {activeStage === "source" && <section className="stage-view source-view"><div className="section-heading"><div><div className="overline">01 / INGEST</div><h2>Bring a run into the workbench</h2><p>Load an exported Flight Record or a line-delimited event trace.</p></div></div><button className="upload-target" onClick={() => inputRef.current?.click()}><span>↑</span><strong>Choose a trace file</strong><small>JSON · JSONL · NDJSON</small><em>Local analysis · file stays in this browser session</em></button><div className="source-bottom"><span>ACTIVE RUN</span><strong>{analysis.record.record_id}</strong><span>{analysis.record.source_format}</span><button onClick={() => setActiveStage("replay")}>Continue to replay →</button></div></section>}

        {activeStage === "replay" && <>
          <section className="replay-layout">
            <div className="replay-main panel-surface">
              <div className="section-heading replay-heading"><div><div className="overline">02 / EVENT REPLAY <span className="event-count">{analysis.summary.step_count} EVENTS</span></div><h2>Run sequence</h2><p>{analysis.record.task.goal || "No task description provided"}</p></div><label className="toggle-filter"><input type="checkbox" checked={violationsOnly} onChange={(event) => setViolationsOnly(event.target.checked)} /><span /> Findings only</label></div>
              <div className="run-strip"><span className="run-id">RUN <b>{analysis.record.record_id}</b></span><span>{analysis.record.steps.length} EVENTS</span><span>{analysis.checks.length} CHECKS</span><span className={`run-verdict ${pnr === null ? "" : "has-finding"}`}><i />{pnr === null ? "NO FINDING" : `${analysis.ledger.length} FINDINGS`}</span></div>
              <div className="event-list" role="list" aria-label="Trace events">
                {visibleSteps.map((step) => {
                  const evidence = analysis.ledger.filter((entry) => entry.step_idx === step.index);
                  const isPnr = step.index === pnr;
                  return <button role="listitem" key={step.index} onClick={() => setSelectedStep(step.index)} className={`event-row ${selectedStep === step.index ? "selected" : ""} ${isPnr ? "event-pnr" : ""} ${pnr !== null && step.index > pnr ? "event-after" : ""}`}>
                    <span className="event-rail"><i>{isPnr ? "!" : String(step.index + 1).padStart(2, "0")}</i><b /></span>
                    <span className="event-time">{step.ts || `+${(step.index * 2.4).toFixed(1).padStart(5, "0")}ms`}</span>
                    <span className="event-detail"><strong>{stepLabel(step)}</strong><small>{step.actor} <i>·</i> {step.kind.replaceAll("_", " ")}</small></span>
                    <span className="event-payload">{step.tool_call ? JSON.stringify(step.tool_call.arguments || {}) : step.content || (step.tool_result ? JSON.stringify(step.tool_result.output || {}) : "—")}</span>
                    <span className={`event-mark ${evidence.length ? "mark-findings" : ""}`}>{evidence.length ? `${evidence.length} ${evidence.length === 1 ? "finding" : "findings"}` : "observed"}</span>
                  </button>;
                })}
                {!visibleSteps.length && <div className="empty-state">No rule findings in this run. Turn off the filter to see every event.</div>}
              </div>
              <div className="replay-foot"><span><i className="legend-pnr" /> First irreversible finding</span><span><i className="legend-normal" /> Event captured</span><span className="replay-foot-note">Event order follows the source trace</span></div>
            </div>

            <aside className="inspector panel-surface">
              <div className="inspector-head"><div><div className="overline">EVENT INSPECTOR</div><h2>{selectedEvent ? `Event ${String(selectedStep).padStart(2, "0")}` : "Select an event"}</h2></div><span className={`actor-label actor-${selectedEvent?.actor === "user" ? "user" : selectedEvent?.actor === "tool" ? "tool" : "agent"}`}>{selectedEvent?.actor || "—"}</span></div>
              {selectedEvent ? <><div className="inspector-tags"><span>{selectedEvent.kind.replaceAll("_", " ")}</span><span>{selectedEvent.ts || "time not supplied"}</span></div><div className="json-preview"><div><span>SOURCE EVENT</span><button onClick={() => void navigator.clipboard?.writeText(JSON.stringify(selectedEvent, null, 2))}>Copy JSON</button></div><pre>{JSON.stringify(selectedEvent, null, 2)}</pre></div><div className="linked-evidence"><div className="linked-title"><strong>Rule evidence</strong><span>{selectedEvidence.length} linked</span></div>{selectedEvidence.length ? selectedEvidence.map((entry) => <article key={entry.seq} className="linked-item"><div><span className="severity-dot" /> <b>{entry.severity}</b><code>{entry.check_id}</code></div><strong>{entry.title}</strong><p>{entry.message}</p><button onClick={() => setActiveStage("evidence")}>Inspect evidence →</button></article>) : <div className="no-linked">No configured check flagged this event.</div>}</div></> : <div className="no-linked">Choose an event in the sequence to inspect its source fields.</div>}
              <div className="inspector-hash"><span>TRACE FINGERPRINT</span><code title={analysis.summary.trace_hash}>{analysis.summary.trace_hash.slice(0, 22)}…</code></div>
            </aside>
          </section>
          <section className="next-step-bar"><div><span className="next-step-index">03</span><div><strong>Evidence ledger</strong><small>Review every rule finding and its chain position.</small></div></div><button onClick={() => setActiveStage("evidence")}>Open evidence ↗</button></section>
        </>}

        {activeStage === "evidence" && <section className="stage-view evidence-view panel-surface"><div className="section-heading"><div><div className="overline">03 / EVIDENCE LEDGER</div><h2>Rule findings in this run</h2><p>Each row links a deterministic check to its source event and recorded evidence.</p></div><button className="btn btn-quiet" onClick={exportReport}>Export JSON ↗</button></div><div className="ledger-summary"><span><b>{analysis.ledger.length}</b> findings</span><span><b>{analysis.checks.length}</b> checks applied</span><span><b>{isDemo ? "Preview" : "Linked"}</b> evidence chain</span></div><div className="ledger-table-wrap"><table><thead><tr><th>SEQ</th><th>SOURCE EVENT</th><th>RULE</th><th>SEVERITY</th><th>CHAIN HASH</th></tr></thead><tbody>{analysis.ledger.map((entry) => <tr key={entry.seq} onClick={() => openLedgerEntry(entry)}><td className="mono">{String(entry.seq + 1).padStart(3, "0")}</td><td><button className="step-link">Event {String(entry.step_idx).padStart(2, "0")}</button></td><td><strong className="check-name">{entry.check_id}</strong><small>{entry.title}</small></td><td><span className="severity-pill"><i />{entry.severity}</span></td><td><code className="hash-cell" title={entry.hash}>{entry.hash.slice(0, 16)}…</code></td></tr>)}</tbody></table>{!analysis.ledger.length && <div className="empty-state">No findings were produced by the configured checks.</div>}</div><div className="ledger-note"><span>ⓘ</span><p><b>Scope:</b> the active rule set is deterministic and limited. A clean ledger means no configured rule matched; it does not prove the run was safe.</p></div></section>}

        {activeStage === "decision" && <section className="stage-view decision-view"><div className="decision-main panel-surface"><div className="overline">04 / HUMAN REVIEW</div><h2>{review ? "Disposition recorded" : "Record a reviewer disposition"}</h2><p>This prototype stores review decisions in this browser only. The decision is not sent to a service or added to the evidence chain.</p>{review ? <div className="saved-review"><span>✓</span><div><small>LOCAL REVIEW · {new Date(review.savedAt).toLocaleString()}</small><strong>{review.action}</strong><p>{review.note || "No reviewer note attached."}</p></div><button onClick={() => { setReview(null); localStorage.removeItem("blackbox-prototype-review"); }}>Clear local decision</button></div> : <><label className="review-label" htmlFor="review-note">Reviewer note <span>OPTIONAL</span></label><textarea id="review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Add context for this disposition…" /><div className="review-actions"><button className="review-accept" onClick={() => saveReview("Accepted")}>✓ Accept finding</button><button onClick={() => saveReview("Correction requested")}>Request correction</button><button onClick={() => saveReview("Rejected")}>Reject finding</button></div></>}<div className="decision-run"><span>RUN</span><strong>{analysis.record.record_id}</strong><span>DETERMINISTIC RESULT</span><b>{pnr === null ? "No finding" : `Event ${String(pnr).padStart(2, "0")} · ${analysis.summary.taxonomy_code || "rule finding"}`}</b></div></div><aside className="decision-aside"><div className="overline">REVIEW CHECKLIST</div><h3>Before you decide</h3><ul><li><i>01</i><span>Inspect the event at the first point of no return.</span></li><li><i>02</i><span>Read the linked evidence and expected behavior.</span></li><li><i>03</i><span>Consider whether this trace includes all relevant events.</span></li></ul><div className="local-only">LOCAL-ONLY PROTOTYPE<span>Review persistence and identity are not connected.</span></div></aside></section>}

        <footer className="workbench-footer"><span>BLACKBOX FOR AGENTS <i>·</i> TRACE FORENSICS PROTOTYPE</span><span>{isDemo ? "ILLUSTRATIVE SAMPLE" : "LOCAL ANALYSIS"} <i>·</i> {analysis.summary.trace_hash.slice(0, 12)}</span></footer>
      </main>
    </div>
  );
}

export default App;
