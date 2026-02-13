#!/usr/bin/env tsx
/**
 * Tenant Management CLI Tool
 * 
 * Usage:
 *   npx tsx scripts/tenant-cli.ts create "Tenant Name" subdomain
 *   npx tsx scripts/tenant-cli.ts list
 *   npx tsx scripts/tenant-cli.ts show <tenant-id>
 *   npx tsx scripts/tenant-cli.ts update <tenant-id> --status active
 *   npx tsx scripts/tenant-cli.ts delete <tenant-id> [--hard]
 *   npx tsx scripts/tenant-cli.ts suspend <tenant-id>
 *   npx tsx scripts/tenant-cli.ts activate <tenant-id>
 *   npx tsx scripts/tenant-cli.ts extend <tenant-id> --days 30
 *   npx tsx scripts/tenant-cli.ts health <tenant-id>
 *   npx tsx scripts/tenant-cli.ts stats <tenant-id>
 *   npx tsx scripts/tenant-cli.ts search <query>
 */

import 'dotenv/config';
import { publicDb } from '../src/config/database';
import { TenantService } from '../src/services/tenantService';
import { TenantRepository } from '../src/repositories/tenantRepository';

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

const log = {
    success: (msg: string) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
    error: (msg: string) => console.error(`${colors.red}✗ ${msg}${colors.reset}`),
    info: (msg: string) => console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`),
    warn: (msg: string) => console.warn(`${colors.yellow}⚠ ${msg}${colors.reset}`),
    header: (msg: string) => console.log(`\n${colors.bright}${colors.blue}${msg}${colors.reset}\n`),
};

// Simple table formatting helper
function formatTable(headers: string[], rows: (string | number)[][]): void {
    const colWidths = headers.map((h, i) => {
        const headerLen = h.length;
        const maxRowLen = rows.reduce((max, row) => Math.max(max, String(row[i]).length), 0);
        return Math.max(headerLen, maxRowLen) + 2;
    });

    // Print header
    const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join('│');
    console.log(headerRow);
    console.log('─'.repeat(headerRow.length));

    // Print rows
    rows.forEach(row => {
        const dataRow = row.map((cell, i) => String(cell).padEnd(colWidths[i])).join('│');
        console.log(dataRow);
    });
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

async function createTenant() {
    const tenantName = args[1];
    const subdomain = args[2];
    const adminPassword = args[3] || `temp_${Date.now()}`;
    const contactEmail = args[4] || `admin@${subdomain}.local`;

    if (!tenantName || !subdomain) {
        log.error('Usage: tenant-cli create "Tenant Name" subdomain [password] [email]');
        process.exit(1);
    }

    try {
        log.header(`Creating Tenant: ${tenantName}`);
        console.log('Please wait...');

        const service = new TenantService();
        const tenant = await service.createTenant(
            tenantName,
            subdomain,
            adminPassword,
            contactEmail
        );

        log.success(`Tenant created successfully!`);
        console.log('\nTenant Details:');
        console.log(`  ID: ${tenant.id}`);
        console.log(`  Name: ${tenant.sacco_name}`);
        console.log(`  Code: ${tenant.code}`);
        console.log(`  Subdomain: ${tenant.subdomain}`);
        console.log(`  Schema: ${tenant.schema_name}`);
        console.log(`  Status: ${tenant.status}`);
        console.log(`  Admin Email: ${contactEmail}`);
        console.log(`  Temp Password: ${adminPassword}`);
        console.log(`  Created: ${tenant.created_at}`);
    } catch (error) {
        log.error(`Failed to create tenant: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function listTenants() {
    try {
        log.header('Listing All Tenants');

        const tenants = await publicDb
            .selectFrom('tenants')
            .selectAll()
            .orderBy('created_at', 'desc')
            .execute();

        if (tenants.length === 0) {
            log.info('No tenants found');
            return;
        }

        const headers = ['ID', 'Name', 'Code', 'Subdomain', 'Status', 'Schema', 'Created'];
        const rows = tenants.map(t => [
            t.id.substring(0, 8),
            t.sacco_name.substring(0, 19),
            t.code,
            t.subdomain,
            t.status,
            t.schema_name,
            new Date(t.created_at).toLocaleDateString()
        ]);

        formatTable(headers, rows);
        log.info(`Total: ${tenants.length} tenant(s)`);
    } catch (error) {
        log.error(`Failed to list tenants: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function showTenant() {
    const tenantId = args[1];

    if (!tenantId) {
        log.error('Usage: tenant-cli show <tenant-id>');
        process.exit(1);
    }

    try {
        log.header(`Tenant Details: ${tenantId}`);

        const repo = new TenantRepository(publicDb);
        const tenant = await repo.findById(tenantId);

        if (!tenant) {
            log.error(`Tenant not found: ${tenantId}`);
            process.exit(1);
        }

        console.log('General Information:');
        console.log(`  ID: ${tenant.id}`);
        console.log(`  Name: ${tenant.sacco_name}`);
        console.log(`  Short Name: ${tenant.short_name || '(none)'}`);
        console.log(`  Code: ${tenant.code}`);
        console.log(`  Subdomain: ${tenant.subdomain}`);
        console.log(`  Schema: ${tenant.schema_name}`);
        
        console.log('\nStatus & Subscription:');
        console.log(`  Status: ${tenant.status}`);
        console.log(`  Subscription Tier: ${tenant.subscription_tier}`);
        console.log(`  Expires: ${tenant.subscription_expires_at ? new Date(tenant.subscription_expires_at).toLocaleDateString() : 'Never'}`);
        console.log(`  Max Users: ${tenant.max_users}`);
        console.log(`  Max Members: ${tenant.max_members}`);
        
        console.log('\nContact:');
        console.log(`  Email: ${tenant.contact_email}`);
        console.log(`  Phone: ${tenant.contact_phone}`);
        console.log(`  Website: ${tenant.website || '(none)'}`);
        
        console.log('\nTimestamps:');
        console.log(`  Created: ${new Date(tenant.created_at).toLocaleString()}`);
        console.log(`  Updated: ${new Date(tenant.updated_at).toLocaleString()}`);
        console.log(`  Deleted: ${tenant.deleted_at ? new Date(tenant.deleted_at).toLocaleString() : 'Active'}`);
    } catch (error) {
        log.error(`Failed to show tenant: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function updateTenant() {
    const tenantId = args[1];

    if (!tenantId) {
        log.error('Usage: tenant-cli update <tenant-id> [--status active|suspended|inactive] [--name "New Name"] [--email new@example.com]');
        process.exit(1);
    }

    try {
        log.info(`Updating tenant: ${tenantId}`);

        const updates: Record<string, any> = {};

        // Parse flags
        for (let i = 2; i < args.length; i += 2) {
            if (args[i] === '--status' && args[i + 1]) {
                updates.status = args[i + 1];
            } else if (args[i] === '--name' && args[i + 1]) {
                updates.sacco_name = args[i + 1];
            } else if (args[i] === '--email' && args[i + 1]) {
                updates.contact_email = args[i + 1];
            }
        }

        if (Object.keys(updates).length === 0) {
            log.error('No updates specified');
            process.exit(1);
        }

        const tenant = await publicDb
            .updateTable('tenants')
            .set({
                ...updates,
                updated_at: new Date()
            })
            .where('id', '=', tenantId)
            .returningAll()
            .executeTakeFirst();

        if (!tenant) {
            log.error(`Tenant not found: ${tenantId}`);
            process.exit(1);
        }

        log.success(`Tenant updated successfully!`);
        console.log('\nUpdated Fields:');
        Object.entries(updates).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
        });
    } catch (error) {
        log.error(`Failed to update tenant: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function deleteTenant() {
    const tenantId = args[1];
    const hard = args.includes('--hard');

    if (!tenantId) {
        log.error('Usage: tenant-cli delete <tenant-id> [--hard]');
        process.exit(1);
    }

    try {
        log.header(`Deleting Tenant: ${tenantId}`);
        
        if (hard) {
            log.warn('HARD DELETE - This will drop the schema and all data!');
        }

        const service = new TenantService();

        if (hard) {
            // Get schema name first
            const tenant = await publicDb
                .selectFrom('tenants')
                .select('schema_name')
                .where('id', '=', tenantId)
                .executeTakeFirst();

            if (!tenant) {
                log.error(`Tenant not found: ${tenantId}`);
                process.exit(1);
            }

            await service.hardDeleteTenant(tenant.schema_name);
            log.success('Tenant schema dropped successfully!');
        } else {
            await service.softDeleteTenant(tenantId);
            log.success('Tenant marked as deleted (soft delete)');
        }
    } catch (error) {
        log.error(`Failed to delete tenant: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function suspendTenant() {
    const tenantId = args[1];

    if (!tenantId) {
        log.error('Usage: tenant-cli suspend <tenant-id>');
        process.exit(1);
    }

    try {
        const tenant = await publicDb
            .updateTable('tenants')
            .set({ status: 'suspended', updated_at: new Date() })
            .where('id', '=', tenantId)
            .returningAll()
            .executeTakeFirst();

        if (!tenant) {
            log.error(`Tenant not found: ${tenantId}`);
            process.exit(1);
        }

        log.success(`Tenant suspended: ${tenant.sacco_name}`);
    } catch (error) {
        log.error(`Failed to suspend tenant: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function activateTenant() {
    const tenantId = args[1];

    if (!tenantId) {
        log.error('Usage: tenant-cli activate <tenant-id>');
        process.exit(1);
    }

    try {
        const tenant = await publicDb
            .updateTable('tenants')
            .set({ status: 'active', updated_at: new Date() })
            .where('id', '=', tenantId)
            .returningAll()
            .executeTakeFirst();

        if (!tenant) {
            log.error(`Tenant not found: ${tenantId}`);
            process.exit(1);
        }

        log.success(`Tenant activated: ${tenant.sacco_name}`);
    } catch (error) {
        log.error(`Failed to activate tenant: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function extendSubscription() {
    const tenantId = args[1];
    const daysStr = args[args.indexOf('--days') + 1];
    const days = parseInt(daysStr, 10);

    if (!tenantId || !daysStr || isNaN(days) || days <= 0) {
        log.error('Usage: tenant-cli extend <tenant-id> --days <number>');
        process.exit(1);
    }

    try {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);

        const tenant = await publicDb
            .updateTable('tenants')
            .set({ subscription_expires_at: expiryDate, updated_at: new Date() })
            .where('id', '=', tenantId)
            .returningAll()
            .executeTakeFirst();

        if (!tenant) {
            log.error(`Tenant not found: ${tenantId}`);
            process.exit(1);
        }

        log.success(`Subscription extended by ${days} days`);
        console.log(`  Tenant: ${tenant.sacco_name}`);
        console.log(`  New Expiry: ${expiryDate.toLocaleDateString()}`);
    } catch (error) {
        log.error(`Failed to extend subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function healthCheck() {
    const tenantId = args[1];

    if (!tenantId) {
        log.error('Usage: tenant-cli health <tenant-id>');
        process.exit(1);
    }

    try {
        log.header(`Health Check: ${tenantId}`);

        const service = new TenantService();
        const health = await service.checkHealth(tenantId);

        console.log('Health Status:');
        console.log(JSON.stringify(health, null, 2));

        if (health.status === 'healthy') {
            log.success('Tenant is healthy');
        } else {
            log.warn(`Tenant health: ${health.status}`);
        }
    } catch (error) {
        log.error(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function showStats() {
    const tenantId = args[1];

    if (!tenantId) {
        log.error('Usage: tenant-cli stats <tenant-id>');
        process.exit(1);
    }

    try {
        log.header(`Tenant Statistics: ${tenantId}`);

        const repo = new TenantRepository(publicDb);
        const tenant = await repo.findById(tenantId);

        if (!tenant) {
            log.error(`Tenant not found: ${tenantId}`);
            process.exit(1);
        }

        console.log('Tenant Information:');
        console.log(`  Name: ${tenant.sacco_name}`);
        console.log(`  Code: ${tenant.code}`);
        console.log(`  Status: ${tenant.status}`);
        console.log(`  Created: ${new Date(tenant.created_at).toLocaleDateString()}`);
        
        if (tenant.subscription_expires_at) {
            const expiryDate = new Date(tenant.subscription_expires_at);
            const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            console.log(`  Subscription Expires: ${expiryDate.toLocaleDateString()} (${daysLeft} days left)`);
        }
    } catch (error) {
        log.error(`Failed to get stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function searchTenants() {
    const query = args[1];

    if (!query || query.length < 2) {
        log.error('Usage: tenant-cli search <query>');
        process.exit(1);
    }

    try {
        log.header(`Search Results: "${query}"`);

        const tenants = await publicDb
            .selectFrom('tenants')
            .selectAll()
            .where((eb) => eb.or([
                eb('sacco_name', 'ilike', `%${query}%`),
                eb('code', 'ilike', `%${query}%`),
                eb('subdomain', 'ilike', `%${query}%`)
            ]))
            .orderBy('created_at', 'desc')
            .limit(20)
            .execute();

        if (tenants.length === 0) {
            log.info('No tenants found matching query');
            return;
        }

        const headers = ['Name', 'Code', 'Subdomain', 'Status'];
        const rows = tenants.map(t => [t.sacco_name, t.code, t.subdomain, t.status]);

        formatTable(headers, rows);
        log.info(`Found ${tenants.length} tenant(s)`);
    } catch (error) {
        log.error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function showHelp() {
    log.header('Tenant Management CLI');
    console.log(`
Usage: tenant-cli <command> [options]

Commands:
  create <name> <subdomain> [password] [email]  Create a new tenant
  list                                           List all tenants
  show <tenant-id>                               Show tenant details
  update <tenant-id> [options]                   Update tenant
  delete <tenant-id> [--hard]                    Delete tenant (--hard drops schema)
  suspend <tenant-id>                            Suspend a tenant
  activate <tenant-id>                           Activate a tenant
  extend <tenant-id> --days <number>             Extend subscription
  health <tenant-id>                             Check tenant health
  stats <tenant-id>                              Show tenant statistics
  search <query>                                 Search tenants
  help                                           Show this help message

Examples:
  npx tsx scripts/tenant-cli.ts create "My SACCO" mysacco admin123 admin@example.com
  npx tsx scripts/tenant-cli.ts list
  npx tsx scripts/tenant-cli.ts show tenant-abc123
  npx tsx scripts/tenant-cli.ts update tenant-abc123 --status suspended
  npx tsx scripts/tenant-cli.ts extend tenant-abc123 --days 30
  npx tsx scripts/tenant-cli.ts delete tenant-abc123 --hard
    `);
}

// Main execution
async function main() {
    try {
        switch (command) {
            case 'create':
                await createTenant();
                break;
            case 'list':
                await listTenants();
                break;
            case 'show':
                await showTenant();
                break;
            case 'update':
                await updateTenant();
                break;
            case 'delete':
                await deleteTenant();
                break;
            case 'suspend':
                await suspendTenant();
                break;
            case 'activate':
                await activateTenant();
                break;
            case 'extend':
                await extendSubscription();
                break;
            case 'health':
                await healthCheck();
                break;
            case 'stats':
                await showStats();
                break;
            case 'search':
                await searchTenants();
                break;
            case 'help':
            case '--help':
            case '-h':
                showHelp();
                break;
            default:
                log.error(`Unknown command: ${command}`);
                showHelp();
                process.exit(1);
        }
    } catch (error) {
        log.error(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error(error);
        process.exit(1);
    }
}

main().then(() => process.exit(0));
