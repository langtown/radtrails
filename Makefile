SHELL := /bin/sh

WRANGLER ?= npx wrangler
DB ?= DB
BACKUP_DIR ?= .local/d1-backups
LOCAL_STATE_DIR ?= .wrangler/state/v3/d1

# Keep schema changes in migrations. These are the application tables whose rows
# (including profile image BLOBs) are copied by the data-sync targets.
D1_TABLES := users sessions user_data personas user_personas profiles profile_images profile_image_uploads published_profiles
TABLE_FLAGS := $(foreach table,$(D1_TABLES),--table $(table))
STAMP := $(shell date -u +%Y%m%dT%H%M%SZ)
LOCAL_BACKUP := $(BACKUP_DIR)/local-$(STAMP).sql
REMOTE_BACKUP := $(BACKUP_DIR)/prod-$(STAMP).sql
LOCAL_DATA := $(BACKUP_DIR)/local-data-$(STAMP).sql
REMOTE_DATA := $(BACKUP_DIR)/prod-data-$(STAMP).sql

.PHONY: help db-migrate-local db-migrate-prod db-backup-local db-backup-prod \
	db-pull-prod db-push-prod db-export-local-data db-export-prod-data

help:
	@printf '%s\n' \
		'Local schema:' \
		'  make db-migrate-local       Apply pending migrations to local D1' \
		'  make db-migrate-prod        Apply pending migrations to production D1' \
		'Backups/exports:' \
		'  make db-backup-local        Full local schema + data SQL backup' \
		'  make db-backup-prod         Full production schema + data SQL backup' \
		'  make db-export-local-data   Data-only local export (application tables)' \
		'  make db-export-prod-data    Data-only production export (application tables)' \
		'Data sync (destructive; read docs first):' \
		'  make db-pull-prod           Replace local D1 with a production data snapshot' \
		'  make db-push-prod CONFIRM_PROD_SYNC=YES' \
		'                              Replace production rows with local data (backs up first)'

db-migrate-local:
	$(WRANGLER) d1 migrations apply $(DB) --local

db-migrate-prod:
	$(WRANGLER) d1 migrations apply $(DB) --remote

db-backup-local:
	mkdir -p $(BACKUP_DIR)
	$(WRANGLER) d1 export $(DB) --local --output $(LOCAL_BACKUP) --skip-confirmation
	@printf 'Local backup: %s\n' '$(LOCAL_BACKUP)'

db-backup-prod:
	mkdir -p $(BACKUP_DIR)
	$(WRANGLER) d1 export $(DB) --remote --output $(REMOTE_BACKUP) --skip-confirmation
	@printf 'Production backup: %s\n' '$(REMOTE_BACKUP)'

db-export-local-data:
	mkdir -p $(BACKUP_DIR)
	$(WRANGLER) d1 export $(DB) --local --no-schema $(TABLE_FLAGS) --output $(LOCAL_DATA) --skip-confirmation
	@printf 'Local data export: %s\n' '$(LOCAL_DATA)'

db-export-prod-data:
	mkdir -p $(BACKUP_DIR)
	$(WRANGLER) d1 export $(DB) --remote --no-schema $(TABLE_FLAGS) --output $(REMOTE_DATA) --skip-confirmation
	@printf 'Production data export: %s\n' '$(REMOTE_DATA)'

# This replaces the local D1 persistence directory with a recoverable move,
# applies the checked-in schema, then imports production rows. Stop dev first.
db-pull-prod:
	mkdir -p $(BACKUP_DIR)
	$(WRANGLER) d1 export $(DB) --local --output $(LOCAL_BACKUP) --skip-confirmation
	$(WRANGLER) d1 export $(DB) --remote --no-schema $(TABLE_FLAGS) --output $(REMOTE_DATA) --skip-confirmation
	@if [ -d "$(LOCAL_STATE_DIR)" ]; then \
		mv "$(LOCAL_STATE_DIR)" "$(BACKUP_DIR)/local-state-$(STAMP)"; \
		printf 'Moved old local D1 state to %s\n' "$(BACKUP_DIR)/local-state-$(STAMP)"; \
	fi
	$(WRANGLER) d1 migrations apply $(DB) --local
	$(WRANGLER) d1 execute $(DB) --local --file $(REMOTE_DATA) --yes
	@printf '%s\n' 'Local D1 now contains the production application data.'

# This intentionally logs users out and replaces all application rows in prod.
# The full production export is created before any remote mutation.
db-push-prod:
	@if [ "$(CONFIRM_PROD_SYNC)" != "YES" ]; then \
		printf '%s\n' 'Refusing to modify production. Re-run with CONFIRM_PROD_SYNC=YES.' >&2; \
		exit 1; \
	fi
	mkdir -p $(BACKUP_DIR)
	$(WRANGLER) d1 export $(DB) --remote --output $(REMOTE_BACKUP) --skip-confirmation
	$(WRANGLER) d1 export $(DB) --local --no-schema $(TABLE_FLAGS) --output $(LOCAL_DATA) --skip-confirmation
	$(WRANGLER) d1 execute $(DB) --remote --command 'PRAGMA foreign_keys=OFF; DELETE FROM sessions; DELETE FROM user_data; DELETE FROM user_personas; DELETE FROM profile_image_uploads; DELETE FROM published_profiles; DELETE FROM profiles; DELETE FROM profile_images; DELETE FROM users; DELETE FROM personas; PRAGMA foreign_keys=ON;' --yes
	$(WRANGLER) d1 execute $(DB) --remote --file $(LOCAL_DATA) --yes
	@printf '%s\n' 'Production D1 now contains the local application data; migration history was not copied.'
