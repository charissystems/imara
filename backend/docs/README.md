# Backend Documentation

Comprehensive documentation for the Imara SACCO Management System backend.

## Structure

### 📁 `/api`
Comprehensive API documentation with guides, examples, and interactive specs.
- **README.md** - API documentation hub and quick reference
- **getting-started.md** - Getting started guide, authentication basics, common patterns
- **authentication.md** - Detailed authentication, authorization, roles, security
- **error-handling.md** - Error codes, debugging, solutions
- **openapi.yaml** - Complete OpenAPI specification
- **domains/** - Domain-specific API documentation (auth, members, accounts, loans, etc.)
- **guides/** - Workflow guides and pagination/filtering examples

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

- **API Documentation**: Start with [API README](./api/README.md) or [Getting Started](./api/getting-started.md)
- **API Endpoints**: Browse [domain-specific endpoints](./api/domains/) or see [OpenAPI spec](./api/openapi.yaml)
- **Workflows**: See [complete examples](./api/guides/workflows.md)
- **Error Handling**: Review [error codes and solutions](./api/error-handling.md)
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
1. Start with [API Getting Started](./api/getting-started.md) to understand the API
2. Browse [domain-specific endpoints](./api/domains/) for your use case
3. Review [complete workflow examples](./api/guides/workflows.md) for your scenario
4. Check [database migration guide](./database/MIGRATION_GUIDE.md) for data structure
5. Reference [error handling guide](./api/error-handling.md) for debugging

For API integrators:
1. Review [API README](./api/README.md) for overview
2. Check [authentication guide](./api/authentication.md)
3. See [pagination & filtering guide](./api/guides/pagination-filtering.md) for list endpoints
4. Browse [domain API documentation](./api/domains/) for specific endpoints
5. Test with [OpenAPI spec](./api/openapi.yaml) or cURL examples

For administrators:
1. Review [MULTITENANCY ENHANCEMENTS](./architecture/MULTITENANCY_ENHANCEMENTS.md) for operations
2. Check [MIGRATION GUIDE](./database/MIGRATION_GUIDE.md) for maintenance
3. Reference `/architecture` and `/diagrams` for system overview
