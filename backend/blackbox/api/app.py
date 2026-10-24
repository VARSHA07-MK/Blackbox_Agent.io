from fastapi import FastAPI

app = FastAPI(title="Blackbox for Agents", version="0.0.1")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
