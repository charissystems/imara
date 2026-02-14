#!/bin/bash
# restore-tenant.sh
# Restore a tenant schema from backup
# Usage: ./restore-tenant.sh <schema_name> <backup_path> [--to-new-schema <new_schema_name>]

set -e

# ========= CONFIG =========
POSTGRES_HOST="${DB_HOST:-localhost}"
POSTGRES_PORT="${DB_PORT:-5432}"
POSTGRES_DB="${DB_NAME:-postgres}"
POSTGRES_USER="${DB_USER:-postgres}"

export PGPASSWORD="$DB_PASSWORD"

# ========= PARSE ARGUMENTS =========
if [ $# -lt 2 ]; then
    echo "Usage: $0 <schema_name> <backup_path> [--to-new-schema <new_schema_name>]"
    echo ""
    echo "Examples:"
    echo "  $0 tenant_1 /backups/tenant/tenant_1/20240214_120000/tenant_1_backup.sql.gz"
    echo "  $0 tenant_1 /backups/tenant/tenant_1/20240214_120000/tenant_1_backup.sql.gz --to-new-schema tenant_1_restored"
    exit 1
fi

SCHEMA_NAME=$1
BACKUP_PATH=$2
RESTORE_SCHEMA=$SCHEMA_NAME
FORCE_RESTORE=false

# Parse optional arguments
while [[ $# -gt 2 ]]; do
    case $3 in
        --to-new-schema)
            RESTORE_SCHEMA=$4
            shift 2
            ;;
        --force)
            FORCE_RESTORE=true
            shift
            ;;
        *)
            echo "Unknown option: $3"
            exit 1
            ;;
    esac
done

# ========= LOGGING =========
log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $*"
}

log_success() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $*"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $*" >&2
}

# ========= VALIDATION =========
log_info "Restoring tenant schema: $SCHEMA_NAME"
log_info "Backup path: $BACKUP_PATH"
log_info "Restore to: $RESTORE_SCHEMA"

if [ ! -f "$BACKUP_PATH" ]; then
    log_error "Backup file not found: $BACKUP_PATH"
    exit 1
fi

# Check if backup is compressed
if [[ "$BACKUP_PATH" == *.gz ]]; then
    TEMP_FILE=$(mktemp)
    log_info "Decompressing backup..."
    gunzip -c "$BACKUP_PATH" > "$TEMP_FILE"
    BACKUP_FILE="$TEMP_FILE"
else
    BACKUP_FILE="$BACKUP_PATH"
fi

# ========= CHECK EXISTING SCHEMA =========
SCHEMA_EXISTS=$(psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -t -c "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = '$RESTORE_SCHEMA');")

if [ "$SCHEMA_EXISTS" = "t" ]; then
    if [ "$FORCE_RESTORE" = "true" ]; then
        log_info "Schema $RESTORE_SCHEMA exists. Dropping due to --force flag..."
        psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
            -c "DROP SCHEMA IF EXISTS $RESTORE_SCHEMA CASCADE;"
    else
        log_error "Schema $RESTORE_SCHEMA already exists. Use --force to overwrite."
        [ -f "$TEMP_FILE" ] && rm "$TEMP_FILE"
        exit 1
    fi
fi

# ========= PERFORM RESTORE =========
log_info "Restoring schema from backup..."

if psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -f "$BACKUP_FILE" > /dev/null 2>&1; then
    
    log_success "Schema restored successfully"
    
    # If restoring to a different schema name, rename it
    if [ "$RESTORE_SCHEMA" != "$SCHEMA_NAME" ]; then
        log_info "Renaming schema from $SCHEMA_NAME to $RESTORE_SCHEMA..."
        psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
            -c "ALTER SCHEMA $SCHEMA_NAME RENAME TO $RESTORE_SCHEMA;" || true
    fi
    
    # Record restore in database
    log_info "Recording restore operation..."
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<EOSQL
UPDATE public.tenant_backups 
SET 
    last_restored_at = now(),
    can_restore = true
WHERE backup_location LIKE '%${SCHEMA_NAME}%'
  AND status IN ('created', 'verified')
LIMIT 1;
EOSQL
    
    log_success "Restore completed successfully"
    log_info "Schema $RESTORE_SCHEMA is ready to use"
else
    log_error "Restore failed"
    [ -f "$TEMP_FILE" ] && rm "$TEMP_FILE"
    exit 1
fi

# ========= CLEANUP =========
[ -f "$TEMP_FILE" ] && rm "$TEMP_FILE"

log_success "All operations completed"
exit 0
