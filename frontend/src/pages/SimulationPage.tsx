import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  startSimulation,
  listScenarios,
  exportSimulation,
  type SimEvent,
  type SimRunFull,
} from "../api/client";
import { Icon } from "../components/Icon";

const DEFAULT_ROLE_COUNTS: Record<string, number> = {
  customer: 60,
  restaurant: 15,
  courier: 15,
  dispatch: 3,
  support: 3,
  payments: 2,
  platform_ops: 2,
};

const ROLE_COLORS: Record<string, string> = {
  customer: "#6366f1",
  restaurant: "#f59e0b",
  courier: "#14b8a6",
  dispatch: "#0ea5e9",
  support: "#a855f7",
  payments: "#ef4444",
  platform_ops: "#64748b",
};

const SPEED_MS: Record<string, number> = {
  slow: 500,
  normal: 150,
  fast: 50,
  instant: 0,
};

type PlaybackStatus = "configuring" | "running" | "paused" | "completed" | "stopped";

type OrderSummary = {
  order_id: string;
  scenario_id: string;
  violation_count: number;
  pnr_step: number | null;
  step_count: number;
  investigation_id: string;
};

function roleColor(role: string): string {
  return ROLE_COLORS[role] ?? "#94a3b8";
}

function eventDescription(ev: SimEvent): string {
  if (ev.event_type === "tool_call") {
    const args = ev.payload.arguments as Record<string, unknown> | undefined;
    const tool = ev.payload.tool as string;
    if (args?.order_id) return `${tool} → ${String(args.order_id)}`;
    return tool;
  }
  if (ev.event_type === "tool_result") {
    const tool = ev.payload.tool as string;
    const err = ev.payload.error as string | null;
    if (err) return `${tool} ✕ ${err.slice(0, 40)}`;
    return `${tool} ✓`;
  }
  if (ev.event_type === "message") {
    const content = ev.payload.content as string;
    return content?.slice(0, 60) ?? "message";
  }
  if (ev.event_type === "handoff") {
    return `→ ${String(ev.payload.to ?? "?")}`;
  }
  if (ev.event_type === "decision") {
    return `decided: ${String(ev.payload.chosen ?? "")}`.slice(0, 50);
  }
  return ev.event_type;
}

export function SimulationPage() {
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({ ...DEFAULT_ROLE_COUNTS });
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 10000));
  const [numOrders, setNumOrders] = useState(20);
  const [speed, setSpeed] = useState<keyof typeof SPEED_MS>("normal");
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(new Set());
  const [allScenariosSelected, setAllScenariosSelected] = useState(true);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("configuring");
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [runData, setRunData] = useState<SimRunFull | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [analysisFilter, setAnalysisFilter] = useState<"all" | "violations" | "pnr">("all");
  const [configOpen, setConfigOpen] = useState(true);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const { data: scenariosData } = useQuery({
    queryKey: ["scenarios"],
    queryFn: listScenarios,
  });

  const totalAgents = Object.values(roleCounts).reduce((a, b) => a + b, 0);

  const { mutate: launchSim, isPending } = useMutation({
    mutationFn: () =>
      startSimulation({
        seed,
        agent_counts: roleCounts,
        scenario_mix: allScenariosSelected
          ? scenariosData?.scenarios.filter(s => s.scenario_id !== "normal_completion").map(s => s.scenario_id)
          : [...selectedScenarios],
        num_orders: numOrders,
      }),
    onSuccess: (data) => {
      setRunData(data);
      setPlaybackIndex(0);
      setPlaybackStatus("running");
      setConfigOpen(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Simulation failed");
    },
  });

  // Playback ticker
  useEffect(() => {
    if (!runData) return;
    const total = runData.events.length;

    if (playbackStatus === "running") {
      if (speed === "instant") {
        setPlaybackIndex(total);
        setPlaybackStatus("completed");
        return;
      }
      timerRef.current = setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev >= total - 1) {
            setPlaybackStatus("completed");
            if (timerRef.current) clearInterval(timerRef.current);
            return total;
          }
          return prev + 1;
        });
      }, SPEED_MS[speed]);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playbackStatus, speed, runData]);

  const visibleEvents = runData?.events.slice(0, playbackIndex) ?? [];
  const filteredEvents =
    roleFilter === "all" ? visibleEvents : visibleEvents.filter((e) => e.role === roleFilter);

  // Derive order summaries
  const orderSummaries: OrderSummary[] = [];
  if (runData?.metrics) {
    const perOrder = (runData.metrics as Record<string, unknown>).per_order as Record<string, Record<string, unknown>> | undefined;
    if (perOrder) {
      for (const [oid, data] of Object.entries(perOrder)) {
        orderSummaries.push({
          order_id: oid,
          scenario_id: String(data.scenario_id ?? "normal_completion"),
          violation_count: Number(data.violation_count ?? 0),
          pnr_step: data.pnr_step as number | null,
          step_count: Number(data.step_count ?? 0),
          investigation_id: String(data.investigation_id ?? ""),
        });
      }
    }
  }

  // Aggregate metrics from visible events
  const toolCalls = visibleEvents.filter((e) => e.event_type === "tool_call").length;
  const toolErrors = visibleEvents.filter((e) => e.event_type === "tool_result" && e.payload.error).length;
  const placedOrders = new Set(visibleEvents.filter((e) => e.event_type === "tool_result" && (e.payload.tool as string) === "place_order" && !e.payload.error).map((e) => e.order_id)).size;
  const deliveredOrders = visibleEvents.filter((e) => e.event_type === "tool_result" && (e.payload.tool as string) === "update_delivery_status" && (e.payload.output as Record<string, unknown>)?.status === "delivered").length;
  const cancelledOrders = visibleEvents.filter((e) => e.event_type === "tool_result" && (e.payload.tool as string) === "cancel_order" && !e.payload.error).length;

  function handleStop() {
    setPlaybackStatus("stopped");
  }

  function handlePause() {
    setPlaybackStatus((s) => (s === "paused" ? "running" : "paused"));
  }

  function handleExport() {
    if (!runData) return;
    void exportSimulation(runData.run_id).then((data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sim-${runData.run_id.slice(0, 8)}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const filteredAnalysis = orderSummaries.filter((o) => {
    if (analysisFilter === "violations") return o.violation_count > 0;
    if (analysisFilter === "pnr") return o.pnr_step !== null;
    return true;
  });

  const selectedOrderEvents = selectedOrderId
    ? runData?.events.filter((e) => e.order_id === selectedOrderId) ?? []
    : [];

  const selectedOrderSummary = selectedOrderId
    ? orderSummaries.find((o) => o.order_id === selectedOrderId)
    : null;

  return (
    <section className="content simulation-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">FOOD DELIVERY SIMULATION <span>·</span> SANDBOX</div>
          <h1>Agent Simulation</h1>
          <p>
            Run up to 100 synthetic agents through a food-delivery marketplace. All data is
            simulated — no real services are connected.
          </p>
        </div>
        <div className="heading-actions">
          {runData && (
            <button className="button button-secondary" onClick={handleExport}>
              <Icon name="export" /> Export run
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>!</span>
          <div>
            <strong>Simulation error</strong>
            <small>{error}</small>
          </div>
          <button onClick={() => setError("")}>×</button>
        </div>
      )}

      {/* ── Config Panel ── */}
      <div className={`sim-config-panel panel${configOpen ? "" : " collapsed"}`}>
        <div className="panel-header">
          <div className="panel-title-row">
            <h2>Configuration</h2>
            {runData && (
              <span className="sim-seed-badge" title="Click to copy seed" onClick={() => void navigator.clipboard?.writeText(String(runData.seed))}>
                Seed: {runData.seed} <Icon name="copy" />
              </span>
            )}
          </div>
          <button className="button button-ghost" onClick={() => setConfigOpen((v) => !v)}>
            {configOpen ? "Hide" : "Show"}
          </button>
        </div>
        {configOpen && (
          <div className="sim-config-body">
            <div className="sim-config-row">
              <div className="sim-config-col">
                <label className="config-label">Seed</label>
                <input
                  type="number"
                  className="config-input"
                  value={seed}
                  min={0}
                  max={99999}
                  onChange={(e) => setSeed(Number(e.target.value))}
                />
                <label className="config-label" style={{ marginTop: 12 }}>Number of orders</label>
                <input
                  type="range"
                  min={5}
                  max={50}
                  value={numOrders}
                  onChange={(e) => setNumOrders(Number(e.target.value))}
                />
                <span className="config-range-val">{numOrders} orders</span>

                <label className="config-label" style={{ marginTop: 12 }}>Playback speed</label>
                <div className="speed-selector">
                  {Object.keys(SPEED_MS).map((s) => (
                    <button
                      key={s}
                      className={`speed-btn${speed === s ? " active" : ""}`}
                      onClick={() => setSpeed(s as keyof typeof SPEED_MS)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sim-config-col">
                <label className="config-label">
                  Role distribution <span className="config-sum">{totalAgents} agents total</span>
                </label>
                <div className="role-sliders">
                  {Object.entries(roleCounts).map(([role, count]) => (
                    <div key={role} className="role-slider-row">
                      <span className="role-label" style={{ background: roleColor(role) }}>
                        {role.replace("_", " ")}
                      </span>
                      <input
                        type="range"
                        min={1}
                        max={70}
                        value={count}
                        onChange={(e) =>
                          setRoleCounts((prev) => ({ ...prev, [role]: Number(e.target.value) }))
                        }
                      />
                      <span className="role-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sim-config-col">
                <label className="config-label">
                  Scenarios
                  <button
                    className="config-select-all"
                    onClick={() => setAllScenariosSelected((v) => !v)}
                  >
                    {allScenariosSelected ? "Deselect all" : "Select all"}
                  </button>
                </label>
                <div className="scenario-list">
                  {scenariosData?.scenarios
                    .filter((s) => s.scenario_id !== "normal_completion")
                    .map((sc) => (
                      <label key={sc.scenario_id} className="scenario-item">
                        <input
                          type="checkbox"
                          checked={allScenariosSelected || selectedScenarios.has(sc.scenario_id)}
                          onChange={(e) => {
                            setAllScenariosSelected(false);
                            setSelectedScenarios((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(sc.scenario_id);
                              else next.delete(sc.scenario_id);
                              return next;
                            });
                          }}
                        />
                        <span className="scenario-name">{sc.name}</span>
                        <span className="scenario-desc">{sc.description}</span>
                      </label>
                    ))}
                </div>
              </div>
            </div>

            <div className="sim-launch-row">
              <button
                className="button button-primary button-lg"
                disabled={isPending}
                onClick={() => launchSim()}
              >
                <Icon name="play" /> {isPending ? "Running simulation…" : "Launch Simulation"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Run controls ── */}
      {runData && (
        <div className="sim-controls panel">
          <div className="sim-status-row">
            <span className={`sim-status-badge status-${playbackStatus}`}>
              {playbackStatus.toUpperCase()}
            </span>
            <span className="sim-seed-badge">
              Seed: {runData.seed}
            </span>
            <div className="sim-progress-bar">
              <div
                className="sim-progress-fill"
                style={{ width: `${Math.round((playbackIndex / Math.max(runData.total_events, 1)) * 100)}%` }}
              />
            </div>
            <span className="sim-progress-label">
              {playbackIndex} / {runData.total_events} events
            </span>
            <div className="sim-controls-buttons">
              <button
                className={`control-btn${playbackStatus === "paused" ? " active" : ""}`}
                onClick={handlePause}
                disabled={playbackStatus === "completed" || playbackStatus === "stopped"}
                title={playbackStatus === "paused" ? "Resume" : "Pause"}
              >
                <Icon name={playbackStatus === "paused" ? "play" : "pause"} />
              </button>
              <button
                className="control-btn"
                onClick={handleStop}
                disabled={playbackStatus === "completed" || playbackStatus === "stopped"}
                title="Stop"
              >
                <Icon name="stop" />
              </button>
            </div>
            <div className="speed-selector">
              {Object.keys(SPEED_MS).map((s) => (
                <button
                  key={s}
                  className={`speed-btn${speed === s ? " active" : ""}`}
                  onClick={() => setSpeed(s as keyof typeof SPEED_MS)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Metrics row ── */}
      {runData && (
        <div className="metrics-row">
          <div className="stat-tile">
            <div className="stat-value">{totalAgents}</div>
            <div className="stat-label">Agents configured</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">
              {placedOrders} <span className="stat-sub">placed</span>
              &nbsp;·&nbsp;
              {deliveredOrders} <span className="stat-sub">delivered</span>
              &nbsp;·&nbsp;
              {cancelledOrders} <span className="stat-sub">cancelled</span>
            </div>
            <div className="stat-label">Orders</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">
              {toolCalls} <span className="stat-sub">calls</span>
              &nbsp;·&nbsp;
              <span className={toolErrors > 0 ? "stat-error" : ""}>{toolErrors}</span>
              <span className="stat-sub"> errors</span>
            </div>
            <div className="stat-label">Tool calls</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">
              {orderSummaries.filter((o) => o.violation_count > 0).length}
              <span className="stat-sub"> orders with violations</span>
            </div>
            <div className="stat-label">Policy violations</div>
          </div>
        </div>
      )}

      {/* ── Main two-column content ── */}
      {runData && (
        <div className="sim-main-grid">
          {/* Agent activity feed */}
          <div className="panel agent-feed-panel">
            <div className="panel-header">
              <div className="panel-title-row">
                <h2>Agent Activity</h2>
                <span className="ledger-count">{filteredEvents.length}</span>
              </div>
              <div className="role-filters">
                <button
                  className={`role-filter-btn${roleFilter === "all" ? " active" : ""}`}
                  onClick={() => setRoleFilter("all")}
                >
                  All
                </button>
                {Object.keys(ROLE_COLORS).map((r) => (
                  <button
                    key={r}
                    className={`role-filter-btn${roleFilter === r ? " active" : ""}`}
                    style={{ "--role-color": roleColor(r) } as React.CSSProperties}
                    onClick={() => setRoleFilter(r)}
                  >
                    {r.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
            <div className="agent-feed" ref={feedRef}>
              {[...filteredEvents].reverse().slice(0, 200).map((ev) => (
                <div
                  key={ev.event_id}
                  className={`feed-event feed-${ev.event_type}${ev.order_id === selectedOrderId ? " feed-highlight" : ""}`}
                  onClick={() => setSelectedOrderId(ev.order_id)}
                >
                  <span className="feed-ts">{ev.ts.slice(11, 19)}</span>
                  <span className="feed-agent" style={{ color: roleColor(ev.role) }}>
                    {ev.agent_id}
                  </span>
                  <span className="feed-type-tag">{ev.event_type}</span>
                  <span className="feed-desc">{eventDescription(ev)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Order timeline */}
          <div className="panel order-list-panel">
            <div className="panel-header">
              <div className="panel-title-row">
                <h2>Orders</h2>
                <span className="ledger-count">{orderSummaries.length}</span>
              </div>
            </div>
            <div className="order-list">
              {orderSummaries.map((o) => {
                const isSelected = o.order_id === selectedOrderId;
                return (
                  <button
                    key={o.order_id}
                    className={`order-card${isSelected ? " selected" : ""}${o.violation_count > 0 ? " has-violation" : ""}`}
                    onClick={() => setSelectedOrderId(isSelected ? null : o.order_id)}
                  >
                    <div className="order-card-top">
                      <span className="order-id">{o.order_id}</span>
                      {o.violation_count > 0 && (
                        <span className="order-violation-badge">{o.violation_count} violation{o.violation_count !== 1 ? "s" : ""}</span>
                      )}
                      {o.pnr_step !== null && (
                        <span className="order-pnr-badge">PNR @{o.pnr_step}</span>
                      )}
                    </div>
                    <div className="order-card-meta">
                      <span className="scenario-tag">{o.scenario_id.replace(/_/g, " ")}</span>
                      <span className="step-count">{o.step_count} steps</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Order inspector */}
            {selectedOrderSummary && (
              <div className="order-inspector">
                <div className="order-inspector-header">
                  <strong>{selectedOrderSummary.order_id}</strong>
                  <a
                    href={`/investigations/${selectedOrderSummary.investigation_id}`}
                    className="inspector-inv-link"
                  >
                    Open investigation →
                  </a>
                </div>
                <div className="order-event-timeline">
                  {selectedOrderEvents.map((ev, i) => (
                    <div
                      key={ev.event_id}
                      className={`order-timeline-step step-${ev.event_type}`}
                    >
                      <span className="step-idx">{String(i).padStart(2, "0")}</span>
                      <span className="step-kind">{ev.event_type}</span>
                      <span className="step-agent" style={{ color: roleColor(ev.role) }}>
                        {ev.agent_id}
                      </span>
                      <span className="step-desc">{eventDescription(ev)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Analysis Summary ── */}
      {runData && orderSummaries.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <div className="panel-title-row">
              <h2>Analysis Summary</h2>
              <span className="ledger-count">{filteredAnalysis.length}</span>
            </div>
            <div className="analysis-filters">
              {(["all", "violations", "pnr"] as const).map((f) => (
                <button
                  key={f}
                  className={`analysis-filter-btn${analysisFilter === f ? " active" : ""}`}
                  onClick={() => setAnalysisFilter(f)}
                >
                  {f === "all" ? "All orders" : f === "violations" ? "Violations only" : "PNR only"}
                </button>
              ))}
            </div>
          </div>
          <div className="ledger-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ORDER ID</th>
                  <th>SCENARIO</th>
                  <th>STEPS</th>
                  <th>VIOLATIONS</th>
                  <th>PNR STEP</th>
                  <th>INVESTIGATION</th>
                </tr>
              </thead>
              <tbody>
                {filteredAnalysis.map((o) => (
                  <tr
                    key={o.order_id}
                    className="inv-row"
                    onClick={() => setSelectedOrderId(o.order_id)}
                  >
                    <td><code>{o.order_id}</code></td>
                    <td><span className="scenario-tag">{o.scenario_id.replace(/_/g, " ")}</span></td>
                    <td className="mono">{o.step_count}</td>
                    <td>
                      {o.violation_count > 0 ? (
                        <span className="severity-pill"><i /> {o.violation_count}</span>
                      ) : (
                        <span className="pnr-clean">0</span>
                      )}
                    </td>
                    <td>
                      {o.pnr_step !== null ? (
                        <span className="pnr-flagged">Step {o.pnr_step}</span>
                      ) : (
                        <span className="pnr-clean">Clean</span>
                      )}
                    </td>
                    <td>
                      <a href={`/investigations/${o.investigation_id}`} className="inv-link">
                        View →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!runData && !isPending && (
        <div className="sim-empty">
          <div className="sim-empty-icon">⬡</div>
          <strong>No simulation running</strong>
          <small>Configure and launch a simulation above to see agent activity.</small>
        </div>
      )}

      <footer className="page-footer">
        <span>SIMULATION SANDBOX <i>·</i> SYNTHETIC DATA ONLY — NO REAL SERVICES</span>
        {runData && <span>Run {runData.run_id.slice(0, 8)} · {runData.total_events} events</span>}
      </footer>
    </section>
  );
}
