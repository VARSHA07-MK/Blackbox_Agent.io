FROM python:3.14-slim
WORKDIR /app
COPY pyproject.toml ./
COPY blackbox ./blackbox
RUN pip install --no-cache-dir .
CMD ["uvicorn", "blackbox.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
