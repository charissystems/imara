import { TenantService } from '../src/services/tenantService';
import crypto from 'crypto';

async function main() {
    const tenantName = process.argv[2];
    const subdomain = process.argv[3];
    let adminPassword = process.argv[4];

    // Validation
    if (!tenantName || !subdomain) {
        console.error('Usage: npm run create-tenant "Tenant Name" subdomain [admin_password]');
        console.error('Example: npm run create-tenant "My Company" mycompany');
        console.error('Example: npm run create-tenant "My Company" mycompany "securePass123"');
        process.exit(1);
    }

    // Generate password if not provided
    if (!adminPassword) {
        // Generate a random 16-character password
        adminPassword = crypto.randomBytes(16).toString('hex');
        console.log('⚠️  No admin password provided. Generated a secure one:');
        console.log(`   Password: ${adminPassword}`);
        console.log('   Please save this password for your records.\n');
    }

    const tenantService = new TenantService();

    try {
        console.log(`Creating tenant: ${tenantName} (${subdomain})...`);

        const tenant = await tenantService.createTenant(tenantName, subdomain, adminPassword);

        console.log('✅ Tenant created successfully!');
        console.log(`   ID: ${tenant.id}`);
        console.log(`   Schema: ${tenant.schema_name}`);
        console.log(`   Subdomain: ${tenant.subdomain}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to create tenant:', error);
        process.exit(1);
    }
}

main().catch(console.error);