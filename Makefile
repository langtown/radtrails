SHELL := /bin/sh

WRANGLER ?= npx wrangler
DB ?= DB
BACKUP_DIR ?= .local/d1-backups
LOCAL_STATE_DIR ?= .wrangler/state/v3/d1

STAMP := $(shell date -u +%Y%m%dT%H%M%SZ)
REMOTE_BACKUP := $(BACKUP_DIR)/prod-$(STAMP).sql

.PHONY: help dev db-migrate-local db-backup-prod db-pull-prod

help:
	@printf '%s\n' \
		'Local development:' \
		'  make dev                    Select project Node version and start the dev server' \
		'Local schema:' \
		'  make db-migrate-local       Apply pending migrations to local D1' \
		'Production backup (read-only):' \
		'  make db-backup-prod         Full production schema + data SQL backup' \
		'Data sync (local write only; never touches production):' \
		'  make db-pull-prod           Replace local D1 with a production data snapshot' \
		'' \
		'Production migrations and production writes are intentionally not available' \
		'here. Migrations reach production only through the Cloudflare Workers Build' \
		'pipeline (scripts/build.mjs, npm run db:migrate:remote under WORKERS_CI=1).'

dev:
	@. "$${NVM_DIR:-$$HOME/.nvm}/nvm.sh" && nvm use && npm run dev

db-migrate-local:
	$(WRANGLER) d1 migrations apply $(DB) --local

db-backup-prod:
	mkdir -p $(BACKUP_DIR)
	$(WRANGLER) d1 export $(DB) --remote --output $(REMOTE_BACKUP) --skip-confirmation
	@printf 'Production backup: %s\n' '$(REMOTE_BACKUP)'

# Stage and validate a full snapshot before replacing local state. Stop dev first.
db-pull-prod:
	python3 scripts/pull-prod-db.py --wrangler "$(WRANGLER)" --database "$(DB)" --backup-dir "$(BACKUP_DIR)" --state-dir "$(LOCAL_STATE_DIR)"
