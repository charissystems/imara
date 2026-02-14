#!/bin/bash
set -e

# ========= CONFIG =========
POSTGRES_SUPERUSER="postgres"
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
DB_PASSWORD="test"

# Fixed identifiers
DB_NAME="test_db"
DB_USER="postgres"

export PGPASSWORD="$DB_PASSWORD"

# Paths
BASE_DIR="./src/database"
PUBLIC_MIGRATIONS="$BASE_DIR/migrations-public"
TEMPLATE_MIGRATIONS="$BASE_DIR/migrations"
TEST_DIR="./tests"

echo "Starting SQL Test Setup..."
echo "Database: $DB_NAME"
echo "User:     $DB_USER"
echo "Password: $DB_PASSWORD"

# ========= 1. Ensure User Password =========
echo "Ensuring role password is set..."
psql \
  -U "$POSTGRES_SUPERUSER" \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE ${POSTGRES_SUPERUSER} WITH PASSWORD '${DB_PASSWORD}';"

# ========= 2. Reset: Disconnect and Drop existing DB =========
# This ensures the instance is disposable and clean every run.
echo "Resetting disposable database instance..."

# Terminate existing connections to avoid conflicts when dropping
psql \
  -U "$POSTGRES_SUPERUSER" \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}';" > /dev/null 2>&1 || true

# Drop the database if it exists
psql \
  -U "$POSTGRES_SUPERUSER" \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS ${DB_NAME};"

# ========= 3. Create database =========
echo "Creating fresh database instance..."
createdb \
  -U "$POSTGRES_SUPERUSER" \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -O "$DB_USER" \
  "$DB_NAME"

# ========= 4. Run public migrations =========
echo "Running public migrations..."
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$PUBLIC_MIGRATIONS/001_init_registry.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$PUBLIC_MIGRATIONS/002_init_tracking.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$PUBLIC_MIGRATIONS/003_tenant_engine.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$PUBLIC_MIGRATIONS/000_create_currencies.sql"

# ========= 5. Run template migrations (MVP Module-Based) =========
echo "Running template migrations..."
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$TEMPLATE_MIGRATIONS/001_authentication_and_authorization.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$TEMPLATE_MIGRATIONS/002_member_management.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$TEMPLATE_MIGRATIONS/003_accounting.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$TEMPLATE_MIGRATIONS/004_savings_and_accounts.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$TEMPLATE_MIGRATIONS/005_shares.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$TEMPLATE_MIGRATIONS/006_fixed_deposits.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$TEMPLATE_MIGRATIONS/007_loans.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$TEMPLATE_MIGRATIONS/008_messaging.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$TEMPLATE_MIGRATIONS/009_audit_and_security.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$TEMPLATE_MIGRATIONS/010_system_administration.sql"
psql -U "$DB_USER" -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d "$DB_NAME" -f "$TEMPLATE_MIGRATIONS/011_multitenancy_enhancements.sql"

echo "Test Database Setup Complete"
