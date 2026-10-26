# blackbox-client

Python client and framework adapters for **Blackbox for Agents** — submit traces from any agent, get back investigation reports with violation detection and Point of No Return analysis.

## Installation

```bash
# Local install (from repo root)
pip install ./sdk

# Framework extras
pip install ./sdk[langchain]   # adds langchain-core
pip install ./sdk[openai]      # adds openai
```

## Quick start

Get an API key from the **Connectors** page in the Blackbox UI, then:

```python
from blackbox_client import BlackboxClient, TraceBuilder

client = BlackboxClient(
    base_url="http://localhost:8000",   # or your deployed URL
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
print(f"Violations: {result['summary']['violation_count']}")
```

## Environment variables

```bash
export BLACKBOX_URL=http://localhost:8000
export BLACKBOX_API_KEY=bb_live_...
```

You can then construct the client from env:

```python
import os
from blackbox_client import BlackboxClient

client = BlackboxClient(
    base_url=os.environ.get("BLACKBOX_URL", "http://localhost:8000"),
    api_key=os.environ["BLACKBOX_API_KEY"],
)
```

## TraceBuilder reference

```python
trace = TraceBuilder(agent_id="bot", goal="Handle order")
trace.message("text")                              # role message
trace.tool_call("tool_name", {"arg": "val"})       # tool invocation
trace.tool_result("tool_name", output=..., error=None)  # tool response
trace.decision("reasoning text")                   # agent decision
trace.handoff(to="other_agent", payload={...})     # handoff event
jsonl = trace.to_jsonl()                           # serialize
```

## Framework adapters

### LangChain

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from blackbox_client import BlackboxClient
from blackbox_client.adapters.langchain import BlackboxLangChainHandler

client = BlackboxClient(api_key="bb_live_YOUR_KEY_HERE")
handler = BlackboxLangChainHandler(client, goal="Answer customer query")

llm = ChatOpenAI(model="gpt-4o")
agent = create_tool_calling_agent(llm, tools=[...], prompt=...)
executor = AgentExecutor(agent=agent, tools=[...])

executor.invoke({"input": "..."}, config={"callbacks": [handler]})
print(handler.investigation_result)
```

### OpenAI Assistants

```python
import openai
from blackbox_client import BlackboxClient
from blackbox_client.adapters.openai_assistants import capture_assistant_run

oai = openai.OpenAI()
bb = BlackboxClient(api_key="bb_live_YOUR_KEY_HERE")

thread = oai.beta.threads.create()
oai.beta.threads.messages.create(thread_id=thread.id, role="user", content="...")

with oai.beta.threads.runs.stream(thread_id=thread.id, assistant_id="asst_xxx") as stream:
    result = capture_assistant_run(stream, blackbox=bb, goal="Handle query")

print(result["summary"])
```

### CrewAI

```python
from crewai import Crew, Agent, Task
from blackbox_client import BlackboxClient
from blackbox_client.adapters.crewai import BlackboxCrewCallback

bb = BlackboxClient(api_key="bb_live_YOUR_KEY_HERE")
hook = BlackboxCrewCallback(bb, goal="Research and summarise")

crew = Crew(agents=[...], tasks=[...], step_callback=hook.on_step)
crew.kickoff()
result = hook.submit()
print(result["summary"])
```

### AutoGen

```python
import autogen
from blackbox_client import BlackboxClient
from blackbox_client.adapters.autogen import BlackboxAutoGenHook

bb = BlackboxClient(api_key="bb_live_YOUR_KEY_HERE")
hook = BlackboxAutoGenHook(bb, goal="Automate data pipeline")

user = autogen.UserProxyAgent("user", ...)
assistant = autogen.AssistantAgent("assistant", ...)

orig = assistant.receive
assistant.receive = lambda msg, sender, **kw: (
    hook.on_message(msg, sender), orig(msg, sender, **kw)
)[-1]

user.initiate_chat(assistant, message="Start pipeline")
result = hook.submit()
print(result["summary"])
```

### Generic (decorator / context manager)

```python
from blackbox_client import BlackboxClient
from blackbox_client.adapters.generic import capture, trace

bb = BlackboxClient(api_key="bb_live_YOUR_KEY_HERE")

# Context manager
with capture(bb, goal="Place delivery order", agent_id="order-bot") as t:
    t.message("User requested order")
    t.tool_call("place_order", {"customer_id": "cust_001"})
    result = place_order(customer_id="cust_001")
    t.tool_result("place_order", output=result)
# trace submitted on exit

# Decorator
@trace(bb, goal="Process refund", agent_id="refund-bot")
def handle_refund(order_id: str, *, _trace):
    _trace.tool_call("get_order", {"order_id": order_id})
    order = get_order(order_id)
    _trace.tool_result("get_order", output=order)
```
