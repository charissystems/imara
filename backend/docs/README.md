# Backend Documentation

Comprehensive documentation for the Imara SACCO Management System backend.

## Structure

### 📁 `/api`
API endpoint documentation and testing guides.
- **ENDPOINTS.md** - Complete API endpoint reference with curl examples and response formats

### 📁 `/database`
Database schema and migration documentation.
- **MIGRATION_GUIDE.md** - Comprehensive guide to database migrations, table structures, and relationships
- Related: `../diagrams/` for schema visualizations

### 📁 `/architecture`
Architecture and system design documentation.
- **MULTITENANCY_ENHANCEMENTS.md** - Multi-tenancy implementation, isolation, backup, and disaster recovery

### 📁 `/diagrams`
Visual documentation and diagrams.
- **architecture.drawio** - System architecture diagram (DrawIO format)
- **srs.yaml** - Software Requirements Specification document

## Quick Links

- **Getting Started**: See [API ENDPOINTS](./api/ENDPOINTS.md) to test the API
- **Database Setup**: Refer to [MIGRATION GUIDE](./database/MIGRATION_GUIDE.md)
- **System Architecture**: Review [MULTITENANCY ENHANCEMENTS](./architecture/MULTITENANCY_ENHANCEMENTS.md)
- **Visual Diagrams**: Check `/diagrams` for visual references

## Key Features Documented

✅ **API Documentation**
- Complete REST endpoint reference
- Request/response examples with curl
- Error codes and handling
- Multi-tenancy integration

✅ **Database Architecture**
- 11 migration files with module descriptions
- Table structures and relationships
- Data integrity strategies
- Performance considerations

✅ **Multi-Tenancy System**
- Tenant isolation mechanisms
- Schema management per tenant
- Backup and disaster recovery
- Audit and compliance features

## Navigation

For developers:
1. Start with [API ENDPOINTS](./api/ENDPOINTS.md) to understand available endpoints
2. Review [MIGRATION GUIDE](./database/MIGRATION_GUIDE.md) for database structure
3. Check [MULTITENANCY ENHANCEMENTS](./architecture/MULTITENANCY_ENHANCEMENTS.md) for system design

For administrators:
1. Review [MULTITENANCY ENHANCEMENTS](./architecture/MULTITENANCY_ENHANCEMENTS.md) for operational details
2. Check [MIGRATION GUIDE](./database/MIGRATION_GUIDE.md) for maintenance procedures
3. Reference `/diagrams` for visual system overview
