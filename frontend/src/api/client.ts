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
