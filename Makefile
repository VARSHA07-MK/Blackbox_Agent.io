PY ?= python3.12
VENV := .venv

.PHONY: venv test lint migrate seed up

venv:
	$(PY) -m venv $(VENV)
	$(VENV)/bin/pip install -e "backend[dev]"

test:
	$(VENV)/bin/pytest --cov=blackbox --cov-fail-under=85

lint:
	$(VENV)/bin/ruff check backend tests
	$(VENV)/bin/mypy backend/blackbox

migrate:
	cd backend && ../$(VENV)/bin/alembic upgrade head

seed:
	@echo "seed: not implemented yet (see docs/12 §5)"

up:
	docker compose -f deploy/docker-compose.yml up --build
