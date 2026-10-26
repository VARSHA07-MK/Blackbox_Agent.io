import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listAdoptionAgents,
  enrollAgent,
  pauseAgent,
  unenrollAgent,
  validateSample,
  addTrigger,
  getAdoptionDashboard,
  type AdoptionAgent,
} from "../api/client";
import { Icon } from "../components/Icon";

const STATUS_COLORS: Record<string, string> = {
  not_enrolled: "#94a3b8",
  setup_needed: "#f59e0b",
  sample_passed: "#3b82f6",
  active: "#22c55e",
  paused: "#f97316",
  error: "#ef4444",
};

const DEMO_SAMPLE = `{"actor":"user","kind":"message","content":"Route order ORD-9921 to the best restaurant."}
{"actor":"order-routing-v2","kind":"tool_call","tool_call":{"tool":"search_restaurants","arguments":{"cuisine":"Indian"}}}
{"actor":"order-routing-v2","kind":"tool_result","tool_result":{"tool":"search_restaurants","output":{"restaurants":[{"restaurant_id":"rest_001","name":"SpiceRoute","available":true}]},"error":null}}
{"actor":"order-routing-v2","kind":"decision","content":"SpiceRoute is available and highest-rated."}
{"actor":"order-routing-v2","kind":"tool_call","tool_call":{"tool":"assign_courier","arguments":{"order_id":"ORD-9921","courier_id":"courier_001"}}}
{"actor":"order-routing-v2","kind":"tool_result","tool_result":{"tool":"assign_courier","output":{"status":"assigned"},"error":null}}`;

const TRIGGER_TYPES = [
  { trigger_type: "manual", label: "Manual", description: "Trigger from the dashboard manually." },
  { trigger_type: "version_change", label: "Version Change", description: "Trigger on each new deployment." },
  { trigger_type: "scheduled_sample", label: "Scheduled Sample", description: "Analyze a sample on a schedule." },
  { trigger_type: "failed_run", label: "Failed Run", description: "Trigger when the app marks a run as failed." },
  { trigger_type: "percentage_sample", label: "Percentage Sample", description: "Analyze a % of staging runs." },
  { trigger_type: "regression_suite", label: "Regression Suite", description: "Run a fixed benchmark trace suite." },
];

type EnrollmentStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#94a3b8";
  return (
    <span className="adoption-status-chip" style={{ "--chip-color": color } as React.CSSProperties}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function filterLabel(f: string) {
  if (f === "all") return "All";
  if (f === "enrolled") return "Enrolled";
  if (f === "not_enrolled") return "Not enrolled";
  if (f === "paused") return "Paused";
  if (f === "error") return "Error";
  return f;
}

export function AdoptionPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [enrollingAgent, setEnrollingAgent] = useState<AdoptionAgent | null>(null);
  const [enrollStep, setEnrollStep] = useState<EnrollmentStep>(1);
  const [sampleTrace, setSampleTrace] = useState("");
  const [sampleFormat, setSampleFormat] = useState("generic-jsonl");
  const [validateResult, setValidateResult] = useState<Record<string, unknown> | null>(null);
  const [selectedTriggers, setSelectedTriggers] = useState<Set<string>>(new Set(["manual"]));
  const [demoOpen, setDemoOpen] = useState(false);
  const [actionError, setActionError] = useState("");

  const { data: agentsData, isLoading } = useQuery({
    queryKey: ["adoption-agents"],
    queryFn: listAdoptionAgents,
    refetchInterval: 30_000,
  });

  const { data: dashData } = useQuery({
    queryKey: ["adoption-dashboard"],
    queryFn: getAdoptionDashboard,
    refetchInterval: 30_000,
  });

  const { mutate: doEnroll, isPending: enrolling } = useMutation({
    mutationFn: (agentId: string) => enrollAgent(agentId, { rulebook: "retail-core" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["adoption-agents"] });
      void queryClient.invalidateQueries({ queryKey: ["adoption-dashboard"] });
      setEnrollStep(2);
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Enrollment failed"),
  });

  const { mutate: doPause } = useMutation({
    mutationFn: (agentId: string) => pauseAgent(agentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["adoption-agents"] });
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Pause failed"),
  });

  const { mutate: doUnenroll } = useMutation({
    mutationFn: (agentId: string) => unenrollAgent(agentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["adoption-agents"] });
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Unenroll failed"),
  });

  const { mutate: doValidate, isPending: validating } = useMutation({
    mutationFn: ({ agentId, trace, format }: { agentId: string; trace: string; format: string }) =>
      validateSample(agentId, trace, format),
    onSuccess: (result) => {
      setValidateResult(result as Record<string, unknown>);
      void queryClient.invalidateQueries({ queryKey: ["adoption-agents"] });
      setEnrollStep(6);
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Validation failed"),
  });

  const { mutate: doAddTriggers } = useMutation({
    mutationFn: async (agentId: string) => {
      for (const tt of selectedTriggers) {
        await addTrigger(agentId, { trigger_type: tt, description: "" });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["adoption-agents"] });
      setEnrollingAgent(null);
      setEnrollStep(1);
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Failed to add triggers"),
  });

  const agents = agentsData?.agents ?? [];
  const dash = dashData as Record<string, unknown> | undefined;
  const metrics = dash?.metrics as Record<string, number> | undefined;

  const filteredAgents = agents.filter((a) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "enrolled") return ["setup_needed", "sample_passed", "active"].includes(a.status);
    if (statusFilter === "not_enrolled") return a.status === "not_enrolled";
    if (statusFilter === "paused") return a.status === "paused";
    if (statusFilter === "error") return a.status === "error";
    return true;
  });

  function openEnroll(agent: AdoptionAgent) {
    setEnrollingAgent(agent);
    setEnrollStep(1);
    setValidateResult(null);
    setSampleTrace(agent.agent_id === "order-routing-v2" ? DEMO_SAMPLE : "");
    setActionError("");
  }

  function closeModal() {
    setEnrollingAgent(null);
    setEnrollStep(1);
    setValidateResult(null);
    setActionError("");
  }

  const examplePayload = `{"actor":"your-agent-id","kind":"message","content":"User request here"}
{"actor":"your-agent-id","kind":"tool_call","tool_call":{"tool":"search_restaurants","arguments":{"cuisine":"Indian"}}}
{"actor":"your-agent-id","kind":"tool_result","tool_result":{"tool":"search_restaurants","output":{"restaurants":[]},"error":null}}
{"actor":"your-agent-id","kind":"decision","content":"Choosing best option"}`;

  return (
    <section className="content adoption-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">BLACKBOX ADOPTION COORDINATOR</div>
          <h1>Agent Adoption</h1>
          <p>
            Connect your internal agents to Blackbox and configure automated testing.
            This demo registry contains synthetic agents only.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="error-banner" role="alert">
          <span>!</span>
          <div>
            <strong>Error</strong>
            <small>{actionError}</small>
          </div>
          <button onClick={() => setActionError("")}>×</button>
        </div>
      )}

      {/* ── Dashboard Metrics ── */}
      {metrics && (
        <div className="metrics-row">
          <div className="stat-tile">
            <div className="stat-value">{metrics.total_discovered ?? 0}</div>
            <div className="stat-label">Discovered</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{metrics.enrolled ?? 0}</div>
            <div className="stat-label">Enrolled</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{(metrics.paused ?? 0) + (metrics.not_enrolled ?? 0)}</div>
            <div className="stat-label">Paused / Not enrolled</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{metrics.total_analyses ?? 0}</div>
            <div className="stat-label">Analyses run</div>
          </div>
        </div>
      )}

      {/* ── Agent Registry Table ── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title-row">
            <h2>Agent Registry</h2>
            <span className="ledger-count">{filteredAgents.length}</span>
          </div>
          <div className="role-filters">
            {["all", "enrolled", "not_enrolled", "paused", "error"].map((f) => (
              <button
                key={f}
                className={`role-filter-btn${statusFilter === f ? " active" : ""}`}
                onClick={() => setStatusFilter(f)}
              >
                {filterLabel(f)}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="list-loading">Loading registry…</div>
        ) : (
          <div className="ledger-table-wrap">
            <table className="registry-table">
              <thead>
                <tr>
                  <th>AGENT NAME</th>
                  <th>APPLICATION</th>
                  <th>OWNER</th>
                  <th>ENV</th>
                  <th>FORMAT</th>
                  <th>STATUS</th>
                  <th>LAST ANALYZED</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((agent) => (
                  <tr key={agent.agent_id}>
                    <td>
                      <strong className="check-name">{agent.agent_name}</strong>
                      <small>{agent.description.slice(0, 60)}{agent.description.length > 60 ? "…" : ""}</small>
                    </td>
                    <td>{agent.application}</td>
                    <td><small>{agent.owner_email}</small></td>
                    <td>
                      <span className={`env-badge env-${agent.environment}`}>{agent.environment}</span>
                    </td>
                    <td><code>{agent.trace_format}</code></td>
                    <td><StatusChip status={agent.status} /></td>
                    <td className="mono">
                      {agent.last_analyzed_at
                        ? new Date(agent.last_analyzed_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <div className="action-btns">
                        {agent.status === "not_enrolled" && (
                          <button className="action-btn primary" onClick={() => openEnroll(agent)}>
                            Enroll
                          </button>
                        )}
                        {agent.status === "setup_needed" && (
                          <button className="action-btn" onClick={() => openEnroll(agent)}>
                            Continue setup
                          </button>
                        )}
                        {agent.status === "sample_passed" && (
                          <button className="action-btn" onClick={() => openEnroll(agent)}>
                            Enable triggers
                          </button>
                        )}
                        {agent.status === "active" && (
                          <button className="action-btn warn" onClick={() => doPause(agent.agent_id)}>
                            Pause
                          </button>
                        )}
                        {agent.status === "paused" && (
                          <button className="action-btn" onClick={() => openEnroll(agent)}>
                            Resume
                          </button>
                        )}
                        {agent.status !== "not_enrolled" && (
                          <button className="action-btn danger" onClick={() => doUnenroll(agent.agent_id)}>
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Demo walkthrough ── */}
      <div className="demo-walkthrough panel">
        <button
          className="walkthrough-toggle"
          onClick={() => setDemoOpen((v) => !v)}
        >
          <Icon name="agent" /> Demo guided walkthrough
          <span className="demo-tag">SIMULATED</span>
          <span>{demoOpen ? "Hide" : "Show"}</span>
        </button>
        {demoOpen && (
          <div className="walkthrough-body">
            <p>
              Try the full adoption flow with the synthetic <strong>order-routing-v2</strong> demo
              agent — no real applications needed.
            </p>
            <ol className="walkthrough-steps">
              <li>Click <strong>Enroll</strong> on order-routing-v2 in the table above.</li>
              <li>The wizard walks through all 7 steps.</li>
              <li>Step 5 pre-fills a sample trace — click Validate.</li>
              <li>Step 6 shows the Blackbox analysis results.</li>
              <li>Step 7 enables test triggers.</li>
            </ol>
            <button
              className="button button-primary"
              onClick={() => {
                const agent = agents.find((a) => a.agent_id === "order-routing-v2");
                if (agent) openEnroll(agent);
              }}
            >
              Start demo walkthrough →
            </button>
          </div>
        )}
      </div>

      {/* ── Enrollment Modal ── */}
      {enrollingAgent && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Enroll agent: {enrollingAgent.agent_name}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>

            {/* Step wizard progress */}
            <div className="step-wizard">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <div
                  key={n}
                  className={`wizard-step${enrollStep === n ? " active" : ""}${enrollStep > n ? " done" : ""}`}
                >
                  <span className="wizard-num">{enrollStep > n ? "✓" : n}</span>
                </div>
              ))}
            </div>

            <div className="modal-body">
              {enrollStep === 1 && (
                <div className="wizard-content">
                  <h3>Step 1 — Confirm agent details</h3>
                  <dl className="agent-detail-list">
                    <dt>Agent</dt><dd>{enrollingAgent.agent_name}</dd>
                    <dt>Application</dt><dd>{enrollingAgent.application}</dd>
                    <dt>Owner</dt><dd>{enrollingAgent.owner_email}</dd>
                    <dt>Environment</dt><dd>{enrollingAgent.environment}</dd>
                    <dt>Trace format</dt><dd>{enrollingAgent.trace_format}</dd>
                    <dt>Description</dt><dd>{enrollingAgent.description}</dd>
                  </dl>
                  <p className="approval-notice">
                    <Icon name="shield" /> Enrollment requires owner or administrator approval.
                    This action will be logged.
                  </p>
                </div>
              )}

              {enrollStep === 2 && (
                <div className="wizard-content">
                  <h3>Step 2 — Choose integration method</h3>
                  <div className="integration-methods">
                    {[
                      { id: "api-push", name: "API Push", desc: "POST Flight Record JSON or JSONL to /v1/analyze after each run." },
                      { id: "sdk-hook", name: "SDK Hook", desc: "Use a framework adapter that wraps your agent and emits traces automatically." },
                      { id: "manual-upload", name: "Manual Upload", desc: "Export a trace file and upload via the Investigations page." },
                    ].map((m) => (
                      <div key={m.id} className="integration-method-card">
                        <strong>{m.name}</strong>
                        <p>{m.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {enrollStep === 3 && (
                <div className="wizard-content">
                  <h3>Step 3 — Map events to Blackbox fields</h3>
                  <p>Each line of your trace must be a JSON object. Map your agent's events to these fields:</p>
                  <div className="field-mapping-table">
                    {[
                      ["actor", "string", "Your agent's ID or 'user'"],
                      ["kind", "string", "message | tool_call | tool_result | handoff | decision | system_event"],
                      ["content", "string?", "Message text or decision reasoning"],
                      ["tool_call.tool", "string", "Name of the tool called"],
                      ["tool_call.arguments", "object", "Tool arguments dict"],
                      ["tool_result.tool", "string", "Name of the tool that responded"],
                      ["tool_result.output", "any", "Tool response data"],
                      ["tool_result.error", "string?", "Error message if tool failed"],
                    ].map(([field, type, desc]) => (
                      <div key={field} className="field-row">
                        <code>{field}</code>
                        <span className="field-type">{type}</span>
                        <span>{desc}</span>
                      </div>
                    ))}
                  </div>
                  <div className="example-payload">
                    <div className="example-header">
                      <span>EXAMPLE JSONL PAYLOAD</span>
                      <button onClick={() => void navigator.clipboard?.writeText(examplePayload)}>
                        <Icon name="copy" /> Copy
                      </button>
                    </div>
                    <pre>{examplePayload}</pre>
                  </div>
                </div>
              )}

              {enrollStep === 4 && (
                <div className="wizard-content">
                  <h3>Step 4 — Rulebook &amp; redaction settings</h3>
                  <div className="config-field">
                    <label className="config-label">Rulebook</label>
                    <select className="config-input">
                      <option value="retail-core">retail-core 1.2.0 (default)</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label className="config-label">PII redaction fields</label>
                    <input className="config-input" placeholder="e.g. customer_name, email (comma-separated)" />
                    <small>Fields listed here are removed from traces before analysis.</small>
                  </div>
                  <p className="approval-notice">
                    <Icon name="shield" /> Expanding collected trace data requires owner approval.
                  </p>
                </div>
              )}

              {enrollStep === 5 && (
                <div className="wizard-content">
                  <h3>Step 5 — Validate a sample trace</h3>
                  <div className="config-field">
                    <label className="config-label">Source format</label>
                    <select className="config-input" value={sampleFormat} onChange={(e) => setSampleFormat(e.target.value)}>
                      <option value="generic-jsonl">generic-jsonl</option>
                      <option value="flight-record-1">flight-record-1</option>
                    </select>
                  </div>
                  <div className="config-field">
                    <label className="config-label">Sample trace</label>
                    <textarea
                      className="trace-textarea"
                      rows={8}
                      value={sampleTrace}
                      onChange={(e) => setSampleTrace(e.target.value)}
                      placeholder="Paste JSONL trace here (one JSON object per line)…"
                    />
                  </div>
                  {enrollingAgent.agent_id === "order-routing-v2" && (
                    <button
                      className="button button-ghost"
                      onClick={() => setSampleTrace(DEMO_SAMPLE)}
                    >
                      Use demo trace
                    </button>
                  )}
                  <button
                    className="button button-primary"
                    disabled={validating || !sampleTrace.trim()}
                    onClick={() =>
                      doValidate({ agentId: enrollingAgent.agent_id, trace: sampleTrace, format: sampleFormat })
                    }
                  >
                    {validating ? "Validating…" : "Validate sample"}
                  </button>
                </div>
              )}

              {enrollStep === 6 && validateResult && (
                <div className="wizard-content">
                  <h3>Step 6 — Review first investigation</h3>
                  {(() => {
                    const vr = validateResult as Record<string, unknown>;
                    return (
                      <div className={`validation-result ${vr.valid ? "valid" : "invalid"}`}>
                        <strong>{vr.valid ? "✓ Sample passed validation" : "✗ Validation failed"}</strong>
                        {!!vr.investigation_id && (
                          <p>
                            Investigation created:{" "}
                            <a href={`/investigations/${String(vr.investigation_id)}`}>
                              {String(vr.investigation_id).slice(0, 16)}…
                            </a>
                          </p>
                        )}
                        {!!vr.summary && (
                          <dl className="agent-detail-list">
                            {Object.entries(vr.summary as Record<string, unknown>).map(([k, v]) => (
                              <><dt key={`dt-${k}`}>{k}</dt><dd key={`dd-${k}`}>{JSON.stringify(v)}</dd></>
                            ))}
                          </dl>
                        )}
                        {!!vr.errors && (
                          <ul className="error-list">
                            {(vr.errors as Array<Record<string, string>>).map((e, i) => (
                              <li key={i}><code>{e.path}</code>: {e.message}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {enrollStep === 7 && (
                <div className="wizard-content">
                  <h3>Step 7 — Enable test triggers</h3>
                  <p>Select when Blackbox should automatically analyze this agent's traces.</p>
                  <div className="trigger-list">
                    {TRIGGER_TYPES.map((t) => (
                      <label key={t.trigger_type} className="trigger-item">
                        <input
                          type="checkbox"
                          checked={selectedTriggers.has(t.trigger_type)}
                          onChange={(e) => {
                            setSelectedTriggers((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(t.trigger_type);
                              else next.delete(t.trigger_type);
                              return next;
                            });
                          }}
                        />
                        <div>
                          <strong>{t.label}</strong>
                          <span>{t.description}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="approval-notice">
                    <Icon name="shield" /> Production trigger activation requires owner approval.
                  </p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <div className="modal-footer-left">
                {enrollStep > 1 && (
                  <button className="button button-ghost" onClick={() => setEnrollStep((s) => Math.max(1, s - 1) as EnrollmentStep)}>
                    ← Back
                  </button>
                )}
              </div>
              <div className="modal-footer-right">
                <button className="button button-ghost" onClick={closeModal}>Cancel</button>
                {enrollStep < 7 && enrollStep !== 5 && (
                  <button
                    className="button button-primary"
                    disabled={enrolling}
                    onClick={() => {
                      if (enrollStep === 1) {
                        doEnroll(enrollingAgent.agent_id);
                      } else {
                        setEnrollStep((s) => Math.min(7, s + 1) as EnrollmentStep);
                      }
                    }}
                  >
                    {enrolling ? "Enrolling…" : enrollStep === 1 ? "Confirm & Enroll" : "Next →"}
                  </button>
                )}
                {enrollStep === 6 && (
                  <button className="button button-primary" onClick={() => setEnrollStep(7)}>
                    Continue →
                  </button>
                )}
                {enrollStep === 7 && (
                  <button
                    className="button button-primary"
                    onClick={() => doAddTriggers(enrollingAgent.agent_id)}
                  >
                    Complete Enrollment
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="page-footer">
        <span>BLACKBOX ADOPTION COORDINATOR <i>·</i> DEMO REGISTRY — SYNTHETIC AGENTS ONLY</span>
        <span>{agents.length} agents in registry</span>
      </footer>
    </section>
  );
}
