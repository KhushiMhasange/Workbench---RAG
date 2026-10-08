PY      := ./venv/bin/python
PIP     := ./venv/bin/pip
HOST    ?= 127.0.0.1
PORT    ?= 8000
WEB     ?= web

.PHONY: help venv install health test eval serve dev web web-build web-lint clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

venv: ## Create the Python virtualenv
	python3 -m venv venv
	$(PIP) install -r requirements.txt

install: venv ## Install backend dependencies (and web, if present)
	$(PIP) install -r requirements.txt
	@[ -d "$(WEB)/package.json" ] && (cd $(WEB) && npm install) || true

health: ## Check Ollama, Qdrant, models
	$(PY) -m rag.cli health

test: ## Run backend tests
	$(PY) -m pytest -q

eval: ## Full evaluation (both suites)
	$(PY) -m rag.cli eval run

eval-check: ## Regression check
	$(PY) -m rag.cli eval check

serve: ## Run the FastAPI backend on $(HOST):$(PORT)
	$(PY) -m rag.cli serve --host $(HOST) --port $(PORT) --reload

dev: serve ## Alias for serve

web: ## Run the Next.js dev server on :3000
	cd $(WEB) && npm run dev

web-build: ## Production build of the web app
	cd $(WEB) && npm run build

web-lint: ## Typecheck the web app
	cd $(WEB) && npm run typecheck

clean: ## Remove caches and build output
	rm -rf .pytest_cache data/eval_results.json
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
