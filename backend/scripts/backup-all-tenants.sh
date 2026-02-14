#!/bin/bash
# backup-all-tenants.sh
# Backup all tenant schemas for disaster recovery
# Usage: ./backup-all-tenants.sh
# Output: /backups/tenant/[tenant_schema]/[timestamp]/

set -e

# ========= CONFIG =========
POSTGRES_HOST="${DB_HOST:-localhost}"
POSTGRES_PORT="${DB_PORT:-5432}"
POSTGRES_DB="${DB_NAME:-postgres}"
POSTGRES_USER="${DB_USER:-postgres}"
BACKUP_BASE_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESS="${COMPRESS_BACKUPS:-true}"

export PGPASSWORD="$DB_PASSWORD"

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

# ========= MAIN =========
log_info "Starting tenant backup process..."
log_info "Host: $POSTGRES_HOST, DB: $POSTGRES_DB"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_ROOT="${BACKUP_BASE_DIR}/tenant"
mkdir -p "$BACKUP_ROOT"

# Get all tenant schemas from public.tenants
SCHEMAS=$(psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -t -c "SELECT schema_name FROM public.tenants WHERE deleted_at IS NULL ORDER BY schema_name;")

if [ -z "$SCHEMAS" ]; then
    log_error "No active tenants found"
    exit 1
fi

BACKUP_COUNT=0
FAILED_COUNT=0

for SCHEMA in $SCHEMAS; do
    log_info "Backing up schema: $SCHEMA"
    
    SCHEMA_BACKUP_DIR="${BACKUP_ROOT}/${SCHEMA}/${TIMESTAMP}"
    mkdir -p "$SCHEMA_BACKUP_DIR"
    
    BACKUP_FILE="${SCHEMA_BACKUP_DIR}/${SCHEMA}_backup.sql"
    
    # Dump schema
    if pg_dump \
        -h "$POSTGRES_HOST" \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        -n "$SCHEMA" \
        -v \
        > "$BACKUP_FILE" 2>"${SCHEMA_BACKUP_DIR}/dump.log"; then
        
        FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        
        # Compress if enabled
        if [ "$COMPRESS" = "true" ]; then
            gzip "$BACKUP_FILE"
            BACKUP_FILE="${BACKUP_FILE}.gz"
            log_success "Backed up $SCHEMA (${FILE_SIZE}) - compressed"
        else
            log_success "Backed up $SCHEMA (${FILE_SIZE})"
        fi
        
        # Record backup in database
        psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<EOSQL
INSERT INTO public.tenant_backups (
    tenant_id, 
    backup_number, 
    backup_type, 
    backup_location, 
    status,
    retention_days
)
SELECT 
    id, 
    'BKP_${SCHEMA}_${TIMESTAMP}',
    'full',
    '${SCHEMA_BACKUP_DIR}',
    'created',
    $RETENTION_DAYS
FROM public.tenants 
WHERE schema_name = '$SCHEMA' 
  AND deleted_at IS NULL;
EOSQL
        
        ((BACKUP_COUNT++))
    else
        log_error "Failed to backup $SCHEMA"
        ((FAILED_COUNT++))
    fi
done

log_info "Backup complete. Successful: $BACKUP_COUNT, Failed: $FAILED_COUNT"

# Cleanup old backups
log_info "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_ROOT" -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true

if [ $FAILED_COUNT -gt 0 ]; then
    log_error "Some backups failed"
    exit 1
else
    log_success "All backups completed successfully"
    exit 0
fi
