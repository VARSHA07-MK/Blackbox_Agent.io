import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listApiKeys, createApiKey, revokeApiKey, type ApiKeyRecord } from "../api/client";
import { Icon } from "../components/Icon";

const SDK_TABS = ["Python", "LangChain", "OpenAI Assistants", "CrewAI", "AutoGen", "Generic"] as const;
type SdkTab = (typeof SDK_TABS)[number];

const SDK_CODE: Record<SdkTab, string> = {
  Python: `pip install ./sdk   # or: pip install blackbox-client

from blackbox_client import BlackboxClient, TraceBuilder

client = BlackboxClient(
    base_url="http://localhost:8000",
    api_key="bb_live_YOUR_KEY_HERE",
)

trace = (
    TraceBuilder(agent_id="my-agent", goal="Process refund for order ORD-001")
    .message("Customer requested refund for ORD-001")
    .tool_call("get_order", {"order_id": "ORD-001"})
    .tool_result("get_order", output={"status": "delivered", "total": 450.0})
    .tool_call("issue_refund", {"order_id": "ORD-001", "amount": 450.0, "evidence": ""})
    .tool_result("issue_refund", output={"refund_id": "ref_abc", "status": "refunded"})
)
result = client.ingest(trace.to_jsonl())
print(f"Investigation: {result['investigation_id']}")
print(f"Violations:    {result['summary']['violation_count']}")`,

  LangChain: `from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from blackbox_client import BlackboxClient
from blackbox_client.adapters.langchain import BlackboxLangChainHandler

client = BlackboxClient(api_key="bb_live_YOUR_KEY_HERE")
handler = BlackboxLangChainHandler(client, goal="Answer customer query")

llm = ChatOpenAI(model="gpt-4o")
agent = create_tool_calling_agent(llm, tools=[...], prompt=...)
executor = AgentExecutor(agent=agent, tools=[...])

executor.invoke({"input": "..."}, config={"callbacks": [handler]})
# → trace auto-submitted on chain end
print(handler.investigation_result)`,

  "OpenAI Assistants": `import openai
from blackbox_client import BlackboxClient
from blackbox_client.adapters.openai_assistants import capture_assistant_run

oai = openai.OpenAI()
bb = BlackboxClient(api_key="bb_live_YOUR_KEY_HERE")

thread = oai.beta.threads.create()
oai.beta.threads.messages.create(
    thread_id=thread.id, role="user", content="Handle my request"
)

with oai.beta.threads.runs.stream(
    thread_id=thread.id, assistant_id="asst_xxx"
) as stream:
    result = capture_assistant_run(stream, blackbox=bb, goal="Handle query")

print(result["summary"])`,

  CrewAI: `from crewai import Crew, Agent, Task
from blackbox_client import BlackboxClient
from blackbox_client.adapters.crewai import BlackboxCrewCallback

bb = BlackboxClient(api_key="bb_live_YOUR_KEY_HERE")
hook = BlackboxCrewCallback(bb, goal="Research and summarise")

crew = Crew(agents=[...], tasks=[...], step_callback=hook.on_step)
crew.kickoff()
result = hook.submit()
print(result["summary"])`,

  AutoGen: `import autogen
from blackbox_client import BlackboxClient
from blackbox_client.adapters.autogen import BlackboxAutoGenHook

bb = BlackboxClient(api_key="bb_live_YOUR_KEY_HERE")
hook = BlackboxAutoGenHook(bb, goal="Automate data pipeline")

user = autogen.UserProxyAgent("user", ...)
assistant = autogen.AssistantAgent("assistant", ...)

# Instrument receive
orig = assistant.receive
assistant.receive = lambda msg, sender, **kw: (
    hook.on_message(msg, sender), orig(msg, sender, **kw)
)[-1]

user.initiate_chat(assistant, message="Start pipeline")
result = hook.submit()
print(result["summary"])`,

  Generic: `from blackbox_client import BlackboxClient
from blackbox_client.adapters.generic import capture

bb = BlackboxClient(api_key="bb_live_YOUR_KEY_HERE")

with capture(bb, goal="Place delivery order", agent_id="order-bot") as t:
    t.message("User requested order from SpiceRoute")
    t.tool_call("place_order", {"customer_id": "cust_001", "restaurant_id": "rest_001"})
    result = place_order(customer_id="cust_001", restaurant_id="rest_001")
    t.tool_result("place_order", output=result)
# trace auto-submitted on context exit`,
};

const API_ENDPOINTS = [
  { method: "POST", path: "/v1/ingest", auth: "API key", desc: "Submit a trace for analysis" },
  { method: "GET", path: "/v1/investigations", auth: "—", desc: "List investigations" },
  { method: "GET", path: "/v1/investigations/{id}", auth: "—", desc: "Get investigation detail" },
  { method: "POST", path: "/v1/api-keys", auth: "—", desc: "Generate a new API key" },
  { method: "GET", path: "/v1/api-keys", auth: "—", desc: "List all API keys" },
  { method: "DELETE", path: "/v1/api-keys/{id}", auth: "—", desc: "Revoke an API key" },
];

function NewKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const [name, setName] = useState("");
  const [appId, setAppId] = useState("");
  const mutation = useMutation({
    mutationFn: () => createApiKey(name || "Unnamed key", appId || undefined),
    onSuccess: (data) => onCreated(data.key),
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <strong>New API Key</strong>
          <button onClick={onClose}><Icon name="cross" /></button>
        </div>
        <div className="modal-body">
          <label className="modal-label">
            Name
            <input
              className="modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production LangChain Agent"
            />
          </label>
          <label className="modal-label" style={{ marginTop: 12 }}>
            App ID <span style={{ color: "var(--text-muted)" }}>(optional)</span>
            <input
              className="modal-input"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="e.g. quickbite-platform"
            />
          </label>
          {mutation.error && (
            <div className="conn-error-msg">
              {(mutation.error as Error).message}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Creating…" : "Create key"}
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyRevealModal({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(rawKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-header">
          <strong>API Key created</strong>
        </div>
        <div className="modal-body">
          <div className="new-key-generated">
            <div style={{ marginBottom: 8, color: "var(--violation)", fontWeight: 600 }}>
              Copy now — this key won't be shown again.
            </div>
            <div className="new-key-copy">{rawKey}</div>
          </div>
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={copy}>
            <Icon name="copy" /> {copied ? "Copied!" : "Copy key"}
          </button>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ApiKeysPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["api-keys"], queryFn: listApiKeys });
  const [showNew, setShowNew] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);

  const revoke = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const handleCreated = (key: string) => {
    setShowNew(false);
    setRevealKey(key);
    qc.invalidateQueries({ queryKey: ["api-keys"] });
  };

  const keys = data?.keys ?? [];

  return (
    <div className="conn-panel">
      <div className="conn-panel-header">
        <div>
          <strong>API Keys</strong>
          <span className="conn-panel-sub">Authenticate with Bearer token</span>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowNew(true)}>
          <Icon name="plus" /> New key
        </button>
      </div>

      {isLoading ? (
        <div className="conn-empty">Loading keys…</div>
      ) : keys.length === 0 ? (
        <div className="conn-empty">No API keys yet. Create one to start ingesting traces.</div>
      ) : (
        <table className="conn-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key prefix</th>
              <th>App</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Uses</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k: ApiKeyRecord) => (
              <tr key={k.id} className={k.active ? "" : "conn-row-inactive"}>
                <td>{k.name || <span style={{ color: "var(--text-muted)" }}>Unnamed</span>}</td>
                <td><span className="key-prefix-mono">{k.key_prefix}…</span></td>
                <td>{k.app_id ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                <td>{new Date(k.created_at).toLocaleDateString()}</td>
                <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "—"}</td>
                <td>{k.use_count}</td>
                <td>
                  <span className={`conn-badge ${k.active ? "conn-badge-active" : "conn-badge-revoked"}`}>
                    {k.active ? "Active" : "Revoked"}
                  </span>
                </td>
                <td>
                  {k.active && (
                    <button
                      className="revoke-btn"
                      onClick={() => {
                        if (confirm(`Revoke key "${k.name || k.id}"? This cannot be undone.`)) {
                          revoke.mutate(k.id);
                        }
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showNew && (
        <NewKeyModal onClose={() => setShowNew(false)} onCreated={handleCreated} />
      )}
      {revealKey && (
        <KeyRevealModal rawKey={revealKey} onClose={() => setRevealKey(null)} />
      )}
    </div>
  );
}

function SdkPanel() {
  const [activeTab, setActiveTab] = useState<SdkTab>("Python");
  const [apiRefOpen, setApiRefOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(SDK_CODE[activeTab]).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="conn-panel" style={{ marginTop: 20 }}>
      <div className="conn-panel-header">
        <div>
          <strong>SDK Quick-start</strong>
          <span className="conn-panel-sub">Instrument any agent framework in minutes</span>
        </div>
      </div>

      <div className="sdk-tabs">
        {SDK_TABS.map((tab) => (
          <button
            key={tab}
            className={`sdk-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="sdk-code-panel">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button className="sdk-copy-btn" onClick={copyCode}>
            <Icon name="copy" /> {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre>{SDK_CODE[activeTab]}</pre>
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="conn-section-label">Environment variables</div>
        <div className="env-hint-box">
          <div>BLACKBOX_URL=http://localhost:8000</div>
          <div>BLACKBOX_API_KEY=bb_live_...</div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          className="conn-collapsible-hdr"
          onClick={() => setApiRefOpen((v) => !v)}
          aria-expanded={apiRefOpen}
        >
          <span>API Reference</span>
          <span>{apiRefOpen ? "▲" : "▼"}</span>
        </button>
        {apiRefOpen && (
          <table className="api-ref-table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Auth</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {API_ENDPOINTS.map((ep) => (
                <tr key={ep.path}>
                  <td><span className={`method-badge method-${ep.method.toLowerCase()}`}>{ep.method}</span></td>
                  <td><span className="key-prefix-mono">{ep.path}</span></td>
                  <td>{ep.auth}</td>
                  <td>{ep.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function ConnectorsPage() {
  return (
    <div className="connectors-page">
      <div className="conn-header">
        <h1 className="conn-title">Connectors &amp; API Keys</h1>
        <p className="conn-subtitle">
          Generate API keys to push traces from your applications.
          Pull the SDK to instrument any agent framework.
        </p>
      </div>
      <ApiKeysPanel />
      <SdkPanel />
    </div>
  );
}
