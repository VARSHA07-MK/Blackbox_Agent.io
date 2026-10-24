import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { analyzeTrace, listInvestigations } from "../api/client";
import { Icon } from "../components/Icon";
import type { InvestigationSummary } from "../types";
import { demoTrace } from "../demo";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TaxonomyBadge({ code }: { code: string | null }) {
  if (!code) return <span className="taxonomy-none">—</span>;
  return <span className="taxonomy-code">{code}</span>;
}

function PnrBadge({ pnr }: { pnr: number | null }) {
  if (pnr === null) return <span className="pnr-clean">Clean</span>;
  return <span className="pnr-flagged">Step {pnr}</span>;
}

export function InvestigationsListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [analyzeError, setAnalyzeError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["investigations"],
    queryFn: listInvestigations,
    refetchOnWindowFocus: true,
  });

  const { mutate: runAnalyze, isPending } = useMutation({
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
    onError: (err) => {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed");
    },
  });

  async function loadFile(file?: File) {
    if (!file) return;
    setAnalyzeError("");
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
      setAnalyzeError(
        "Could not read this file. Choose a Flight Record JSON file or a JSONL trace.",
      );
    }
  }

  function runDemo() {
    setAnalyzeError("");
    runAnalyze({
      sourceFormat: "generic-jsonl",
      trace: demoTrace.map((step) => JSON.stringify(step)).join("\n"),
    });
  }

  const investigations = data?.investigations ?? [];

  return (
    <section className="content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            INVESTIGATION CONSOLE <span>·</span> RETAIL CORE 1.2.0
          </div>
          <h1>Investigations</h1>
          <p>Analyze AI-agent traces to find the Point of No Return and root cause.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={runDemo} disabled={isPending}>
            <Icon name="investigation" /> {isPending ? "Analyzing…" : "Run demo trace"}
          </button>
          <button
            className="button button-primary"
            onClick={() => inputRef.current?.click()}
            disabled={isPending}
          >
            <Icon name="upload" /> Import trace
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,.jsonl,.ndjson,application/json"
            hidden
            onChange={(e) => void loadFile(e.target.files?.[0])}
          />
        </div>
      </div>

      {analyzeError && (
        <div className="error-banner" role="alert">
          <span>!</span>
          <div>
            <strong>Could not analyze trace</strong>
            <small>{analyzeError}</small>
          </div>
          <button onClick={() => setAnalyzeError("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {isPending && (
        <div className="analyze-progress">
          <span className="live-dot" />
          Normalizing trace and scanning the active rulebook…
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title-row">
              <h2>All investigations</h2>
              <span className="ledger-count">{investigations.length}</span>
            </div>
            <p>Click a row to open the investigation console.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="list-loading">Loading…</div>
        ) : investigations.length === 0 ? (
          <div className="list-empty">
            <span>
              <Icon name="investigation" />
            </span>
            <strong>No investigations yet</strong>
            <small>Import a trace file or run the demo to get started.</small>
          </div>
        ) : (
          <div className="ledger-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TASK GOAL</th>
                  <th>STEPS</th>
                  <th>FINDINGS</th>
                  <th>PNR STEP</th>
                  <th>TAXONOMY</th>
                  <th>ANALYZED</th>
                </tr>
              </thead>
              <tbody>
                {investigations.map((inv: InvestigationSummary) => (
                  <tr
                    key={inv.id}
                    onClick={() => void navigate(`/investigations/${inv.id}`)}
                    className="inv-row"
                  >
                    <td>
                      <strong className="check-name">{inv.task_goal}</strong>
                      <small>{inv.record_id}</small>
                    </td>
                    <td className="mono">{inv.step_count}</td>
                    <td>
                      {inv.violation_count > 0 ? (
                        <span className="severity-pill">
                          <i /> {inv.violation_count}
                        </span>
                      ) : (
                        <span className="pnr-clean">0</span>
                      )}
                    </td>
                    <td>
                      <PnrBadge pnr={inv.pnr_step} />
                    </td>
                    <td>
                      <TaxonomyBadge code={inv.taxonomy_code} />
                    </td>
                    <td className="mono">{formatDate(inv.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <footer className="page-footer">
        <span>
          BLACKBOX FOR AGENTS <i>·</i> LOCAL PROTOTYPE
        </span>
        <span>
          {investigations.length}{" "}
          {investigations.length === 1 ? "investigation" : "investigations"} in local database
        </span>
      </footer>
    </section>
  );
}
