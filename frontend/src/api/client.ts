import type { Analysis, InvestigationSummary } from "../types";

export type AnalyzeResponse = Analysis & { investigation_id: string };

export async function analyzeTrace(
  sourceFormat: string,
  trace: string | object,
  opts?: { task?: object; recordId?: string },
): Promise<AnalyzeResponse> {
  const response = await fetch("/v1/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_format: sourceFormat,
      trace,
      task: opts?.task,
      record_id: opts?.recordId,
    }),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const detail = result["detail"];
    throw new Error(
      typeof detail === "object" && detail !== null
        ? `${(detail as Record<string, string>)["path"] ?? "trace"}: ${(detail as Record<string, string>)["message"] ?? "Invalid trace"}`
        : "Analysis failed",
    );
  }
  return result as AnalyzeResponse;
}

export async function listInvestigations(): Promise<{ investigations: InvestigationSummary[] }> {
  const response = await fetch("/v1/investigations");
  if (!response.ok) throw new Error("Failed to load investigations");
  return response.json() as Promise<{ investigations: InvestigationSummary[] }>;
}

export async function getInvestigation(
  id: string,
): Promise<Analysis & { id: string; created_at: string }> {
  const response = await fetch(`/v1/investigations/${id}`);
  if (!response.ok) throw new Error(`Investigation ${id} not found`);
  return response.json() as Promise<Analysis & { id: string; created_at: string }>;
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch("/healthz");
    return response.ok;
  } catch {
    return false;
  }
}

// ── Simulation API ────────────────────────────────────────────────────────────

export type SimEvent = {
  event_id: string;
  run_id: string;
  ts: string;
  agent_id: string;
  role: string;
  event_type: string;
  payload: Record<string, unknown>;
  order_id: string | null;
  scenario_id: string | null;
};

export type SimRunSummary = {
  run_id: string;
  created_at: string;
  seed: number;
  num_orders: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  metrics: Record<string, unknown>;
  scenario_mix: string[];
  agent_counts: Record<string, number>;
};

export type SimRunFull = SimRunSummary & {
  total_events: number;
  events: SimEvent[];
};

export type SimulationConfig = {
  seed?: number;
  agent_counts?: Record<string, number>;
  scenario_mix?: string[];
  num_orders?: number;
};

export async function startSimulation(config: SimulationConfig): Promise<SimRunFull> {
  const response = await fetch("/v1/simulations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const detail = (await response.json()) as Record<string, unknown>;
    throw new Error(JSON.stringify(detail["detail"] ?? "Simulation failed"));
  }
  return response.json() as Promise<SimRunFull>;
}

export async function listSimulations(): Promise<{ simulations: SimRunSummary[] }> {
  const response = await fetch("/v1/simulations");
  if (!response.ok) throw new Error("Failed to load simulations");
  return response.json() as Promise<{ simulations: SimRunSummary[] }>;
}

export async function getSimulation(runId: string): Promise<SimRunFull> {
  const response = await fetch(`/v1/simulations/${runId}`);
  if (!response.ok) throw new Error(`Simulation ${runId} not found`);
  return response.json() as Promise<SimRunFull>;
}

export async function getSimulationOrders(runId: string): Promise<{ run_id: string; orders: Record<string, unknown> }> {
  const response = await fetch(`/v1/simulations/${runId}/orders`);
  if (!response.ok) throw new Error(`Could not load orders for ${runId}`);
  return response.json() as Promise<{ run_id: string; orders: Record<string, unknown> }>;
}

export async function exportSimulation(runId: string): Promise<unknown> {
  const response = await fetch(`/v1/simulations/${runId}/export`);
  if (!response.ok) throw new Error(`Could not export simulation ${runId}`);
  return response.json();
}

export async function listScenarios(): Promise<{ scenarios: Array<{ scenario_id: string; name: string; description: string; inject_at_order: number }> }> {
  const response = await fetch("/v1/simulations/scenarios");
  if (!response.ok) throw new Error("Could not load scenarios");
  return response.json() as Promise<{ scenarios: Array<{ scenario_id: string; name: string; description: string; inject_at_order: number }> }>;
}

// ── Adoption API ──────────────────────────────────────────────────────────────

export type AdoptionAgent = {
  agent_id: string;
  agent_name: string;
  application: string;
  owner_email: string;
  environment: string;
  trace_format: string;
  status: string;
  description: string;
  rulebook: string | null;
  triggers: Array<Record<string, unknown>> | null;
  last_analyzed_at: string | null;
  analysis_count: number;
  violation_count: number;
  pnr_count: number;
  enrolled_at: string | null;
  notes: string;
};

export async function listAdoptionAgents(): Promise<{ agents: AdoptionAgent[]; registry_note: string }> {
  const response = await fetch("/v1/adoption/agents");
  if (!response.ok) throw new Error("Failed to load adoption agents");
  return response.json() as Promise<{ agents: AdoptionAgent[]; registry_note: string }>;
}

export async function enrollAgent(agentId: string, opts: { rulebook?: string; notes?: string } = {}): Promise<unknown> {
  const response = await fetch(`/v1/adoption/agents/${agentId}/enroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rulebook: opts.rulebook ?? "retail-core", notes: opts.notes ?? "" }),
  });
  if (!response.ok) throw new Error("Enrollment failed");
  return response.json();
}

export async function pauseAgent(agentId: string): Promise<unknown> {
  const response = await fetch(`/v1/adoption/agents/${agentId}/pause`, { method: "POST" });
  if (!response.ok) throw new Error("Pause failed");
  return response.json();
}

export async function unenrollAgent(agentId: string): Promise<unknown> {
  const response = await fetch(`/v1/adoption/agents/${agentId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Unenroll failed");
  return response.json();
}

export async function validateSample(agentId: string, trace: string, sourceFormat = "generic-jsonl"): Promise<unknown> {
  const response = await fetch(`/v1/adoption/agents/${agentId}/validate-sample`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trace, source_format: sourceFormat }),
  });
  if (!response.ok) throw new Error("Validation failed");
  return response.json();
}

export async function addTrigger(agentId: string, trigger: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`/v1/adoption/agents/${agentId}/triggers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trigger),
  });
  if (!response.ok) throw new Error("Failed to add trigger");
  return response.json();
}

export async function getAdoptionDashboard(): Promise<unknown> {
  const response = await fetch("/v1/adoption/dashboard");
  if (!response.ok) throw new Error("Failed to load adoption dashboard");
  return response.json();
}
