export type Step = {
  index: number;
  actor: string;
  kind: string;
  content?: string | null;
  tool_call?: { tool: string; arguments?: Record<string, unknown> } | null;
  tool_result?: { tool: string; output?: unknown; error?: string | null } | null;
  handoff?: { from: string; to: string; payload?: unknown } | null;
  ts?: string | null;
  meta?: Record<string, unknown>;
};

export type LedgerEntry = {
  seq: number;
  step_idx: number;
  check_id: string;
  title: string;
  severity: string;
  taxonomy: string;
  observed: unknown;
  expected: string;
  message: string;
  excerpt: string;
  irreversible: boolean;
  previous_hash: string;
  hash: string;
};

export type Analysis = {
  record: {
    record_id: string;
    source_format: string;
    task: { goal: string; constraints?: string[] };
    steps: Step[];
    tools?: Array<{ name: string }>;
    policies?: Array<{ policy_id: string }>;
  };
  summary: {
    step_count: number;
    violation_count: number;
    pnr_step: number | null;
    taxonomy_code: string | null;
    basis: string;
    first_violation_step: number | null;
    trace_hash: string;
  };
  candidates: LedgerEntry[];
  ledger: LedgerEntry[];
  checks: string[];
};

export type InvestigationSummary = {
  id: string;
  created_at: string;
  record_id: string;
  task_goal: string;
  step_count: number;
  violation_count: number;
  pnr_step: number | null;
  taxonomy_code: string | null;
  basis: string;
  trace_hash: string;
};
