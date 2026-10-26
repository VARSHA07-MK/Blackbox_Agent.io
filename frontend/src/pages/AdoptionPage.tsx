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

const INTERNAL_APPS = [
  {
    id: "quickbite",
    name: "QuickBite Platform",
    description: "Food delivery marketplace — order routing, dispatch, and fulfilment agents.",
    icon: "🍴",
    color: "#f59e0b",
    ownerEmail: "platform-team@quickbite.internal",
    agentIds: ["order-routing-v2", "dispatch-coordinator"],
  },
  {
    id: "cx-suite",
    name: "CX Suite",
    description: "Customer experience — support, escalation, and satisfaction agents.",
    icon: "💬",
    color: "#6366f1",
    ownerEmail: "cx-team@internal",
    agentIds: ["support-escalation-bot", "cx-sentiment-agent"],
  },
  {
    id: "finance-ops",
    name: "Finance Ops",
    description: "Payments, refunds, fraud detection, and reconciliation agents.",
    icon: "💳",
    color: "#ef4444",
    ownerEmail: "finops@internal",
    agentIds: ["payment-processor-v3", "fraud-risk-scorer"],
  },
  {
    id: "merchant-hub",
    name: "Merchant Hub",
    description: "Restaurant onboarding, menu management, and analytics agents.",
    icon: "🏪",
    color: "#14b8a6",
    ownerEmail: "merchant-success@internal",
    agentIds: ["merchant-onboarding-agent", "menu-sync-agent"],
  },
];

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
];

type EnrollmentStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const OAUTH_STORAGE_KEY = "bb_connected_apps";

function getConnectedApps(): Set<string> {
  try {
    const val = localStorage.getItem(OAUTH_STORAGE_KEY);
    if (val) return new Set(JSON.parse(val) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function saveConnectedApps(apps: Set<string>) {
  try {
    localStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify([...apps]));
  } catch { /* ignore */ }
}

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#94a3b8";
  return (
    <span className="adoption-status-chip" style={{ "--chip-color": color } as React.CSSProperties}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function AdoptionPage() {
  const queryClient = useQueryClient();
  const [connectedApps, setConnectedApps] = useState<Set<string>>(getConnectedApps);
  const [oauthTarget, setOauthTarget] = useState<typeof INTERNAL_APPS[0] | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [enrollingAgent, setEnrollingAgent] = useState<AdoptionAgent | null>(null);
  const [enrollStep, setEnrollStep] = useState<EnrollmentStep>(1);
  const [sampleTrace, setSampleTrace] = useState("");
  const [sampleFormat, setSampleFormat] = useState("generic-jsonl");
  const [validateResult, setValidateResult] = useState<Record<string, unknown> | null>(null);
  const [selectedTriggers, setSelectedTriggers] = useState<Set<string>>(new Set(["manual"]));
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
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adoption-agents"] }),
    onError: (e) => setActionError(e instanceof Error ? e.message : "Pause failed"),
  });

  const { mutate: doUnenroll } = useMutation({
    mutationFn: (agentId: string) => unenrollAgent(agentId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adoption-agents"] }),
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

  function handleConnectApp(app: typeof INTERNAL_APPS[0]) {
    setOauthTarget(app);
  }

  function handleOAuthAllow() {
    if (!oauthTarget) return;
    const next = new Set(connectedApps);
    next.add(oauthTarget.id);
    setConnectedApps(next);
    saveConnectedApps(next);
    const appId = oauthTarget.id;
    setOauthTarget(null);
    setExpandedApp(appId);
  }

  function handleOAuthDeny() {
    setOauthTarget(null);
  }

  function handleDisconnect(appId: string) {
    const next = new Set(connectedApps);
    next.delete(appId);
    setConnectedApps(next);
    saveConnectedApps(next);
    if (expandedApp === appId) setExpandedApp(null);
  }

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

  function getAppAgents(app: typeof INTERNAL_APPS[0]): AdoptionAgent[] {
    return agents.filter((a) => app.agentIds.includes(a.agent_id));
  }

  return (
    <section className="content adoption-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">BLACKBOX ADOPTION COORDINATOR</div>
          <h1>Agent Adoption</h1>
          <p>
            Connect your internal applications to Blackbox via OAuth and enroll their agents
            for automated policy analysis. This demo uses localStorage — no real OAuth tokens are issued.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="error-banner" role="alert">
          <span>!</span>
          <div><strong>Error</strong><small>{actionError}</small></div>
          <button onClick={() => setActionError("")}>×</button>
        </div>
      )}

      {/* Dashboard metrics */}
      {metrics && (
        <div className="metrics-row">
          <div className="stat-tile">
            <div className="stat-value">{INTERNAL_APPS.filter((a) => connectedApps.has(a.id)).length} / {INTERNAL_APPS.length}</div>
            <div className="stat-label">Apps connected</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{metrics.total_discovered ?? 0}</div>
            <div className="stat-label">Agents discovered</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{metrics.enrolled ?? 0}</div>
            <div className="stat-label">Enrolled</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{metrics.total_analyses ?? 0}</div>
            <div className="stat-label">Analyses run</div>
          </div>
        </div>
      )}

      {/* App cards 2×2 grid */}
      <div className="adoption-apps-grid">
        {INTERNAL_APPS.map((app) => {
          const isConnected = connectedApps.has(app.id);
          const isExpanded = expandedApp === app.id;
          const appAgents = getAppAgents(app);
          const enrolledCount = appAgents.filter((a) =>
            ["active", "sample_passed", "setup_needed"].includes(a.status),
          ).length;

          return (
            <div key={app.id} className={`adoption-app-card${isConnected ? " connected" : ""}`}>
              <div className="adoption-app-header">
                <span className="adoption-app-icon" style={{ background: app.color + "22", color: app.color }}>
                  {app.icon}
                </span>
                <div className="adoption-app-info">
                  <strong className="adoption-app-name">{app.name}</strong>
                  <small className="adoption-app-owner">{app.ownerEmail}</small>
                </div>
                <div className="adoption-app-status-area">
                  {isConnected ? (
                    <>
                      <span className="oauth-connected-badge">✓ Connected</span>
                      <button
                        className="adoption-expand-btn"
                        onClick={() => setExpandedApp(isExpanded ? null : app.id)}
                      >
                        {enrolledCount > 0 && <span className="enrolled-count">{enrolledCount}</span>}
                        {isExpanded ? "▲" : "▼"}
                      </button>
                    </>
                  ) : (
                    <button className="oauth-connect-btn" onClick={() => handleConnectApp(app)}>
                      Connect via OAuth
                    </button>
                  )}
                </div>
              </div>
              <p className="adoption-app-desc">{app.description}</p>

              {/* Expanded agent list */}
              {isConnected && isExpanded && (
                <div className="adoption-agent-list">
                  <div className="adoption-agent-list-header">
                    <span>{appAgents.length} agent{appAgents.length !== 1 ? "s" : ""} in this application</span>
                    <button className="adoption-disconnect-btn" onClick={() => handleDisconnect(app.id)}>
                      Disconnect app
                    </button>
                  </div>
                  {isLoading ? (
                    <div className="list-loading">Loading agents…</div>
                  ) : appAgents.length === 0 ? (
                    <div className="list-loading">No agents found for this application in the registry.</div>
                  ) : (
                    appAgents.map((agent) => (
                      <div key={agent.agent_id} className="adoption-agent-row">
                        <div className="adoption-agent-main">
                          <span className="check-name">{agent.agent_name}</span>
                          <small>{agent.description.slice(0, 80)}{agent.description.length > 80 ? "…" : ""}</small>
                          <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                            <span className={`env-badge env-${agent.environment}`}>{agent.environment}</span>
                            <StatusChip status={agent.status} />
                          </div>
                        </div>
                        <div className="action-btns">
                          {agent.status === "not_enrolled" && (
                            <button className="action-btn primary" onClick={() => openEnroll(agent)}>Enroll</button>
                          )}
                          {(agent.status === "setup_needed" || agent.status === "sample_passed") && (
                            <button className="action-btn" onClick={() => openEnroll(agent)}>Continue</button>
                          )}
                          {agent.status === "active" && (
                            <button className="action-btn warn" onClick={() => doPause(agent.agent_id)}>Pause</button>
                          )}
                          {agent.status === "paused" && (
                            <button className="action-btn" onClick={() => openEnroll(agent)}>Resume</button>
                          )}
                          {agent.status !== "not_enrolled" && (
                            <button className="action-btn danger" onClick={() => doUnenroll(agent.agent_id)}>Remove</button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* OAuth Consent Modal — centered, not side panel */}
      {oauthTarget && (
        <div className="modal-overlay oauth-overlay" onClick={handleOAuthDeny}>
          <div className="oauth-modal" onClick={(e) => e.stopPropagation()}>
            <div className="oauth-modal-brand">
              <div className="oauth-bb-logo">BB</div>
              <span className="oauth-arrow">↔</span>
              <div className="oauth-app-logo" style={{ background: oauthTarget.color + "22", color: oauthTarget.color }}>
                {oauthTarget.icon}
              </div>
            </div>
            <h2 className="oauth-title">
              <strong>Blackbox</strong> is requesting access to <strong>{oauthTarget.name}</strong>
            </h2>
            <p className="oauth-subtitle">This will allow Blackbox to:</p>
            <ul className="oauth-permissions">
              <li><Icon name="check" /> Discover agents registered under <strong>{oauthTarget.name}</strong></li>
              <li><Icon name="check" /> Receive anonymised trace logs for enrolled agents</li>
              <li><Icon name="check" /> Run automated policy analysis on captured traces</li>
              <li><Icon name="check" /> Send analysis findings to your team dashboard</li>
            </ul>
            <div className="oauth-no-list">
              <strong>Blackbox will NOT:</strong>
              <ul>
                <li>Change agent behaviour, prompts, or permissions</li>
                <li>Enroll agents without your explicit approval</li>
                <li>Access secrets or credentials</li>
                <li>Store real customer data in the repo or tests</li>
              </ul>
            </div>
            <p className="oauth-owner-line">
              <Icon name="shield" /> Authorising as owner: <code>{oauthTarget.ownerEmail}</code>
            </p>
            <div className="oauth-actions">
              <button className="button button-ghost" onClick={handleOAuthDeny}>Deny</button>
              <button className="button button-primary" onClick={handleOAuthAllow}>Allow access</button>
            </div>
            <p className="oauth-disclaimer">
              Prototype demo — no real OAuth tokens are issued.
              Connection state is stored in localStorage only.
            </p>
          </div>
        </div>
      )}

      {/* Enrollment wizard modal — side panel */}
      {enrollingAgent && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Enroll: {enrollingAgent.agent_name}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="step-wizard">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <div key={n} className={`wizard-step${enrollStep === n ? " active" : ""}${enrollStep > n ? " done" : ""}`}>
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
                    <Icon name="shield" /> Enrollment requires owner or administrator approval. This action will be logged.
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
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                    Each line of your trace must be a JSON object with these fields:
                  </p>
                  <div className="field-mapping-table">
                    {[
                      ["actor", "string", "Your agent ID or 'user'"],
                      ["kind", "string", "message | tool_call | tool_result | handoff | decision | system_event"],
                      ["content", "string?", "Message text or decision reasoning"],
                      ["tool_call.tool", "string", "Name of the tool called"],
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
                </div>
              )}

              {enrollStep === 4 && (
                <div className="wizard-content">
                  <h3>Step 4 — Rulebook &amp; redaction</h3>
                  <div className="config-field">
                    <label className="config-label">Rulebook</label>
                    <select className="config-input"><option value="retail-core">retail-core 1.2.0 (default)</option></select>
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
                      rows={7}
                      value={sampleTrace}
                      onChange={(e) => setSampleTrace(e.target.value)}
                      placeholder="Paste JSONL trace here (one JSON object per line)…"
                    />
                  </div>
                  {enrollingAgent.agent_id === "order-routing-v2" && (
                    <button className="button button-ghost" style={{ marginBottom: 10 }} onClick={() => setSampleTrace(DEMO_SAMPLE)}>
                      Use demo trace
                    </button>
                  )}
                  <button
                    className="button button-primary"
                    disabled={validating || !sampleTrace.trim()}
                    onClick={() => doValidate({ agentId: enrollingAgent.agent_id, trace: sampleTrace, format: sampleFormat })}
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
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                    Select when Blackbox should automatically analyze this agent's traces.
                  </p>
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
                      if (enrollStep === 1) doEnroll(enrollingAgent.agent_id);
                      else setEnrollStep((s) => Math.min(7, s + 1) as EnrollmentStep);
                    }}
                  >
                    {enrolling ? "Enrolling…" : enrollStep === 1 ? "Confirm & Enroll" : "Next →"}
                  </button>
                )}
                {enrollStep === 6 && (
                  <button className="button button-primary" onClick={() => setEnrollStep(7)}>Continue →</button>
                )}
                {enrollStep === 7 && (
                  <button className="button button-primary" onClick={() => doAddTriggers(enrollingAgent.agent_id)}>
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
        <span>{agents.length} agents · {connectedApps.size} app{connectedApps.size !== 1 ? "s" : ""} connected</span>
      </footer>
    </section>
  );
}
