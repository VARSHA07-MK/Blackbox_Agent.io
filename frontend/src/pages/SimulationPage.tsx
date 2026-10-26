import { useEffect, useRef, useState } from "react";
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
  customer: 30,
  restaurant: 8,
  courier: 8,
  dispatch: 2,
  support: 1,
  payments: 1,
  platform_ops: 0,
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

const RESTAURANTS = [
  { id: "rest_001", name: "SpiceRoute", cuisine: "Indian", emoji: "🍛", rating: 4.5 },
  { id: "rest_002", name: "Wok Express", cuisine: "Chinese", emoji: "🥡", rating: 4.2 },
  { id: "rest_003", name: "PizzaCraft", cuisine: "Italian", emoji: "🍕", rating: 4.7 },
  { id: "rest_004", name: "GreenBowl", cuisine: "Salads", emoji: "🥗", rating: 4.3 },
  { id: "rest_005", name: "BurgerVault", cuisine: "Burgers", emoji: "🍔", rating: 4.4 },
];

const STATUS_STEPS = ["placed", "accepted", "preparing", "picked_up", "delivering", "delivered"];

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
  if (ev.event_type === "handoff") return `→ ${String(ev.payload.to ?? "?")}`;
  if (ev.event_type === "decision") return `decided: ${String(ev.payload.chosen ?? "")}`.slice(0, 50);
  return ev.event_type;
}

function deriveOrderStatus(events: SimEvent[]): string {
  let status = "placed";
  for (const ev of events) {
    if (ev.event_type === "tool_result" && !ev.payload.error) {
      const tool = ev.payload.tool as string;
      const out = ev.payload.output as Record<string, unknown> | null;
      if (tool === "accept_order") status = "accepted";
      if (tool === "update_preparation_status" && (out?.status as string) === "preparing") status = "preparing";
      if (tool === "accept_delivery") status = "picked_up";
      if (tool === "update_delivery_status") {
        const s = out?.status as string;
        if (s === "in_transit") status = "delivering";
        if (s === "delivered") status = "delivered";
      }
      if (tool === "cancel_order") status = "cancelled";
    }
  }
  return status;
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
  const [configOpen, setConfigOpen] = useState(false);
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
          ? scenariosData?.scenarios.filter((s) => s.scenario_id !== "normal_completion").map((s) => s.scenario_id)
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
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playbackStatus, speed, runData]);

  const visibleEvents = runData?.events.slice(0, playbackIndex) ?? [];
  const filteredFeedEvents = roleFilter === "all" ? visibleEvents : visibleEvents.filter((e) => e.role === roleFilter);

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

  const toolCalls = visibleEvents.filter((e) => e.event_type === "tool_call").length;
  const deliveredOrders = visibleEvents.filter(
    (e) => e.event_type === "tool_result" &&
      (e.payload.tool as string) === "update_delivery_status" &&
      (e.payload.output as Record<string, unknown>)?.status === "delivered",
  ).length;
  const violatingOrderIds = new Set(orderSummaries.filter((o) => o.violation_count > 0).map((o) => o.order_id));
  const violatingCount = violatingOrderIds.size;

  const liveOrderIds = [...new Set(visibleEvents.filter((e) => e.order_id).map((e) => e.order_id!))];
  const liveOrders = liveOrderIds.slice(-10).map((oid) => ({
    order_id: oid,
    status: deriveOrderStatus(visibleEvents.filter((e) => e.order_id === oid)),
    hasViolation: violatingOrderIds.has(oid),
    scenario: orderSummaries.find((o) => o.order_id === oid)?.scenario_id ?? "normal_completion",
  }));

  const recentRestEvents = visibleEvents.filter((e) => e.role === "restaurant").slice(-40);
  const activeRestIds = new Set(recentRestEvents.map((e) => e.agent_id));

  const recentCourierEvents = visibleEvents.filter((e) => e.role === "courier").slice(-30);
  const activeCourierIds = [...new Set(recentCourierEvents.map((e) => e.agent_id))].slice(0, 8);

  const selectedOrderEvents = selectedOrderId ? runData?.events.filter((e) => e.order_id === selectedOrderId) ?? [] : [];
  const selectedOrderSummary = selectedOrderId ? orderSummaries.find((o) => o.order_id === selectedOrderId) : null;

  function handleStop() { setPlaybackStatus("stopped"); }
  function handlePause() { setPlaybackStatus((s) => (s === "paused" ? "running" : "paused")); }
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

  return (
    <div className="sim-split-page">
      {/* ── QuickBite Top Bar ── */}
      <div className="sim-topbar">
        <div className="sim-topbar-brand">
          <span className="qb-logo">🍴</span>
          <span className="qb-name">QuickBite</span>
          <span className="qb-tag">Agent Simulation</span>
          <span className="qb-location">📍 Bengaluru</span>
        </div>

        {runData && (
          <div className="sim-topbar-status">
            <span className={`sim-status-badge status-${playbackStatus}`}>{playbackStatus.toUpperCase()}</span>
            <div className="sim-progress-bar-mini">
              <div
                className="sim-progress-fill"
                style={{ width: `${Math.round((playbackIndex / Math.max(runData.total_events, 1)) * 100)}%` }}
              />
            </div>
            <span className="sim-topbar-count">{playbackIndex} / {runData.total_events} events</span>
          </div>
        )}

        <div className="sim-topbar-controls">
          {runData && (
            <>
              <div className="speed-selector">
                {Object.keys(SPEED_MS).map((s) => (
                  <button key={s} className={`speed-btn${speed === s ? " active" : ""}`} onClick={() => setSpeed(s as keyof typeof SPEED_MS)}>{s}</button>
                ))}
              </div>
              <button className="control-btn" onClick={handlePause} disabled={playbackStatus === "completed" || playbackStatus === "stopped"} title={playbackStatus === "paused" ? "Resume" : "Pause"}>
                <Icon name={playbackStatus === "paused" ? "play" : "pause"} />
              </button>
              <button className="control-btn" onClick={handleStop} disabled={playbackStatus === "completed" || playbackStatus === "stopped"} title="Stop">
                <Icon name="stop" />
              </button>
              <button className="control-btn" onClick={handleExport} title="Export run">
                <Icon name="export" />
              </button>
            </>
          )}
          <button className="sim-config-btn" disabled={isPending} onClick={() => setConfigOpen(true)}>
            <Icon name="simulation" /> {isPending ? "Running…" : runData ? "New Run" : "Configure & Launch"}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner sim-error-bar" role="alert">
          <span>!</span>
          <div><strong>Simulation error</strong><small>{error}</small></div>
          <button onClick={() => setError("")}>×</button>
        </div>
      )}

      {/* ── Split body or idle screen ── */}
      {runData ? (
        <div className="sim-body">
          {/* ── Left: QuickBite delivery app ── */}
          <div className="sim-left-panel">
            <div className="qb-app">
              {/* Restaurant grid */}
              <div className="qb-section">
                <div className="qb-section-title">Restaurants</div>
                <div className="qb-restaurant-grid">
                  {RESTAURANTS.map((r) => (
                    <div key={r.id} className={`restaurant-card${activeRestIds.has(r.id) ? " active" : ""}`}>
                      <span className="restaurant-emoji">{r.emoji}</span>
                      <div className="restaurant-info">
                        <span className="restaurant-name">{r.name}</span>
                        <span className="restaurant-cuisine">{r.cuisine}</span>
                      </div>
                      <div className="restaurant-right">
                        <span className="restaurant-rating">★ {r.rating}</span>
                        {activeRestIds.has(r.id) && <span className="rest-active-dot" title="Active" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live orders */}
              <div className="qb-section">
                <div className="qb-section-title">
                  Live Orders <span className="qb-count">{liveOrders.length}</span>
                </div>
                <div className="qb-orders-list">
                  {liveOrders.length === 0 ? (
                    <div className="qb-empty">Orders will appear as the simulation runs…</div>
                  ) : (
                    liveOrders.map((o) => (
                      <div
                        key={o.order_id}
                        className={`qb-order-row${o.hasViolation ? " has-violation" : ""}${selectedOrderId === o.order_id ? " selected" : ""}`}
                        onClick={() => setSelectedOrderId((prev) => (prev === o.order_id ? null : o.order_id))}
                      >
                        <div className="qb-order-header">
                          <span className="qb-order-id">{o.order_id.replace("order-", "#")}</span>
                          {o.hasViolation && <span className="qb-violation-dot" title="Policy violation">⚠</span>}
                          <span className={`qb-order-status qb-status-${o.status}`}>{o.status}</span>
                        </div>
                        <div className="qb-progress-dots">
                          {STATUS_STEPS.map((step, i) => {
                            const statusIdx = STATUS_STEPS.indexOf(o.status);
                            const isCancelled = o.status === "cancelled";
                            return (
                              <span
                                key={step}
                                className={`progress-dot${(!isCancelled && statusIdx >= i) ? " done" : ""}${isCancelled ? " cancelled" : ""}`}
                                title={step}
                              />
                            );
                          })}
                        </div>
                        <div className="qb-scenario-tag">{o.scenario.replace(/_/g, " ")}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Active couriers */}
              <div className="qb-section">
                <div className="qb-section-title">
                  Active Couriers <span className="qb-count">{activeCourierIds.length}</span>
                </div>
                <div className="qb-courier-chips">
                  {activeCourierIds.length === 0 ? (
                    <div className="qb-empty">No couriers active yet</div>
                  ) : (
                    activeCourierIds.map((cid) => (
                      <span key={cid} className="courier-chip">🛵 {cid.replace("courier-", "C")}</span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: Blackbox forensics ── */}
          <div className="sim-right-panel">
            {/* Stat tiles */}
            <div className="bb-stat-tiles">
              <div className="stat-tile">
                <div className="stat-value">{totalAgents}</div>
                <div className="stat-label">Agents</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{deliveredOrders}</div>
                <div className="stat-label">Delivered</div>
              </div>
              <div className="stat-tile">
                <div className={`stat-value${violatingCount > 0 ? " stat-error-val" : ""}`}>{violatingCount}</div>
                <div className="stat-label">Violations</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{toolCalls}</div>
                <div className="stat-label">Tool calls</div>
              </div>
            </div>

            {/* Agent activity feed */}
            <div className="bb-panel">
              <div className="bb-panel-header">
                <span className="bb-panel-title">Agent Activity</span>
                <span className="bb-count">{filteredFeedEvents.length}</span>
                <div className="role-filters" style={{ marginLeft: "auto" }}>
                  <button className={`role-filter-btn${roleFilter === "all" ? " active" : ""}`} onClick={() => setRoleFilter("all")}>All</button>
                  {Object.keys(ROLE_COLORS).filter((r) => r !== "platform_ops").map((r) => (
                    <button
                      key={r}
                      className={`role-filter-btn${roleFilter === r ? " active" : ""}`}
                      style={{ "--role-color": roleColor(r) } as React.CSSProperties}
                      onClick={() => setRoleFilter(r)}
                    >{r.replace("_", " ")}</button>
                  ))}
                </div>
              </div>
              <div className="bb-feed" ref={feedRef}>
                {[...filteredFeedEvents].reverse().slice(0, 150).map((ev) => (
                  <div
                    key={ev.event_id}
                    className={`feed-event feed-${ev.event_type}${ev.order_id === selectedOrderId ? " feed-highlight" : ""}`}
                    onClick={() => ev.order_id && setSelectedOrderId((prev) => (prev === ev.order_id ? null : ev.order_id))}
                  >
                    <span className="feed-ts">{ev.ts.slice(11, 19)}</span>
                    <span className="feed-agent-chip" style={{ background: roleColor(ev.role) + "22", color: roleColor(ev.role) }}>
                      {ev.role.slice(0, 3).toUpperCase()}
                    </span>
                    <span className="feed-agent" style={{ color: roleColor(ev.role) }}>{ev.agent_id}</span>
                    <span className="feed-type-tag">{ev.event_type}</span>
                    <span className="feed-desc">{eventDescription(ev)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Order inspector — shown when an order is selected */}
            {selectedOrderSummary && (
              <div className="bb-panel bb-inspector">
                <div className="bb-panel-header">
                  <span className="bb-panel-title">Inspector</span>
                  <span className="bb-inspector-id">{selectedOrderSummary.order_id.replace("order-", "#")}</span>
                  {selectedOrderSummary.violation_count > 0 && (
                    <span className="order-violation-badge">{selectedOrderSummary.violation_count} violation{selectedOrderSummary.violation_count !== 1 ? "s" : ""}</span>
                  )}
                  {selectedOrderSummary.pnr_step !== null && (
                    <span className="order-pnr-badge">PNR @{selectedOrderSummary.pnr_step}</span>
                  )}
                  <a href={`/investigations/${selectedOrderSummary.investigation_id}`} className="inspector-inv-link" style={{ marginLeft: "auto" }}>
                    Open investigation →
                  </a>
                </div>
                <div className="bb-timeline">
                  {selectedOrderEvents.slice(0, 30).map((ev, i) => (
                    <div key={ev.event_id} className={`order-timeline-step step-${ev.event_type}`}>
                      <span className="step-idx">{String(i).padStart(2, "0")}</span>
                      <span className="step-kind">{ev.event_type}</span>
                      <span className="step-agent" style={{ color: roleColor(ev.role) }}>{ev.agent_id}</span>
                      <span className="step-desc">{eventDescription(ev)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All orders table */}
            {orderSummaries.length > 0 && (
              <div className="bb-panel">
                <div className="bb-panel-header">
                  <span className="bb-panel-title">All Orders</span>
                  <span className="bb-count">{orderSummaries.length}</span>
                </div>
                <div className="ledger-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ORDER</th>
                        <th>SCENARIO</th>
                        <th>STEPS</th>
                        <th>VIOLATIONS</th>
                        <th>PNR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderSummaries.map((o) => (
                        <tr
                          key={o.order_id}
                          className={`inv-row${selectedOrderId === o.order_id ? " row-selected" : ""}`}
                          onClick={() => setSelectedOrderId((prev) => (prev === o.order_id ? null : o.order_id))}
                        >
                          <td><code>{o.order_id.replace("order-", "#")}</code></td>
                          <td><span className="scenario-tag">{o.scenario_id.replace(/_/g, " ")}</span></td>
                          <td className="mono">{o.step_count}</td>
                          <td>
                            {o.violation_count > 0
                              ? <span className="severity-pill"><i /> {o.violation_count}</span>
                              : <span className="pnr-clean">0</span>}
                          </td>
                          <td>
                            {o.pnr_step !== null
                              ? <span className="pnr-flagged">Step {o.pnr_step}</span>
                              : <span className="pnr-clean">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bb-footer">
              <span>SIMULATION SANDBOX · SYNTHETIC DATA ONLY</span>
              <span>Seed {runData.seed} · Run {runData.run_id.slice(0, 8)}</span>
            </div>
          </div>
        </div>
      ) : (
        /* ── Idle screen ── */
        <div className="sim-idle-screen">
          <div className="sim-idle-content">
            <div className="sim-idle-logo">🍴</div>
            <h2>QuickBite Agent Simulation</h2>
            <p>
              Watch {totalAgents} autonomous agents process food delivery orders end-to-end.
              Blackbox records every step and flags policy violations in real time.
            </p>
            <button className="button button-primary button-lg" disabled={isPending} onClick={() => setConfigOpen(true)}>
              <Icon name="play" /> {isPending ? "Running simulation…" : "Configure & Launch"}
            </button>
            <div className="sim-idle-pills">
              {Object.entries(DEFAULT_ROLE_COUNTS).filter(([, v]) => v > 0).map(([role, count]) => (
                <span key={role} className="sim-idle-pill" style={{ background: roleColor(role) + "22", color: roleColor(role) }}>
                  {count} {role.replace("_", " ")}
                </span>
              ))}
            </div>
            <p className="sim-idle-note">All data synthetic — no real services connected</p>
          </div>
        </div>
      )}

      {/* ── Config Modal ── */}
      {configOpen && (
        <div className="modal-overlay" onClick={() => setConfigOpen(false)}>
          <div className="modal-panel sim-config-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Simulation Configuration</h2>
              <button className="modal-close" onClick={() => setConfigOpen(false)}>×</button>
            </div>
            <div className="modal-body sim-config-body">
              <div className="sim-config-row">
                <div className="sim-config-col">
                  <label className="config-label">Seed</label>
                  <input type="number" className="config-input" value={seed} min={0} max={99999} onChange={(e) => setSeed(Number(e.target.value))} />
                  <label className="config-label" style={{ marginTop: 12 }}>Number of orders</label>
                  <input type="range" min={5} max={50} value={numOrders} onChange={(e) => setNumOrders(Number(e.target.value))} />
                  <span className="config-range-val">{numOrders} orders</span>
                  <label className="config-label" style={{ marginTop: 12 }}>Playback speed</label>
                  <div className="speed-selector">
                    {Object.keys(SPEED_MS).map((s) => (
                      <button key={s} className={`speed-btn${speed === s ? " active" : ""}`} onClick={() => setSpeed(s as keyof typeof SPEED_MS)}>{s}</button>
                    ))}
                  </div>
                </div>

                <div className="sim-config-col">
                  <label className="config-label">Agent roles <span className="config-sum">{totalAgents} total</span></label>
                  <div className="role-sliders">
                    {Object.entries(roleCounts).map(([role, count]) => (
                      <div key={role} className="role-slider-row">
                        <span className="role-label" style={{ background: roleColor(role) }}>{role.replace("_", " ")}</span>
                        <input type="range" min={0} max={70} value={count} onChange={(e) => setRoleCounts((prev) => ({ ...prev, [role]: Number(e.target.value) }))} />
                        <span className="role-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="sim-config-col">
                  <label className="config-label">
                    Scenarios
                    <button className="config-select-all" onClick={() => setAllScenariosSelected((v) => !v)}>
                      {allScenariosSelected ? "Deselect all" : "Select all"}
                    </button>
                  </label>
                  <div className="scenario-list">
                    {scenariosData?.scenarios.filter((s) => s.scenario_id !== "normal_completion").map((sc) => (
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
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <div className="modal-footer-left" />
              <div className="modal-footer-right">
                <button className="button button-ghost" onClick={() => setConfigOpen(false)}>Cancel</button>
                <button className="button button-primary" disabled={isPending} onClick={() => launchSim()}>
                  <Icon name="play" /> {isPending ? "Running…" : "Launch Simulation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
