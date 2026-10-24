from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BB_", env_file=".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./data/blackbox.db"
    max_trace_mb: int = 50
    max_steps: int = 5000
    judge_provider: str = "fake"


settings = Settings()
