import { Staff, NewStaff, StaffUpdate } from '../database/types';
import { BaseRepository } from './baseRepository';

/**
 * Repository for staff management.
 *
 * Column reference (staff table):
 *   id, staff_number, status, first_name, middle_name, last_name,
 *   email, phone, department, position, hire_date, exit_date,
 *   role_id, branch_id, created_by, updated_by, created_at, updated_at, deleted_at
 */
export class StaffRepository extends BaseRepository {

    async findById(id: string): Promise<Staff | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('staff')
                .selectAll()
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findById',
            { staffId: id }
        );
    }

    async create(staff: NewStaff): Promise<Staff> {
        return this.executeSafely(
            () => this.db
                .insertInto('staff')
                .values(staff)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'create',
            { staffNumber: staff.staff_number }
        );
    }

    async update(id: string, updates: StaffUpdate): Promise<Staff> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff')
                .set({ ...updates, updated_at: new Date() })
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'update',
            { staffId: id }
        );
    }

    /**
     * Get staff with their role details
     */
    async getStaffWithDetails(staffId: string) {
        return this.executeSafely(
            () => this.db
                .selectFrom('staff')
                .leftJoin('roles', 'roles.id', 'staff.role_id')
                .select([
                    'staff.id',
                    'staff.staff_number',
                    'staff.first_name',
                    'staff.last_name',
                    'staff.email',
                    'staff.phone',
                    'staff.department',
                    'staff.position',
                    'staff.status',
                    'staff.hire_date',
                    'roles.name as role_name',
                ])
                .where('staff.id', '=', staffId)
                .where('staff.deleted_at', 'is', null)
                .executeTakeFirst(),
            'getStaffWithDetails',
            { staffId }
        );
    }

    async findByEmail(email: string): Promise<Staff | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('staff')
                .selectAll()
                .where('email', '=', email)
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findByEmail',
            { email }
        );
    }

    async findAll(status?: Staff['status']): Promise<Staff[]> {
        return this.executeSafely(
            async () => {
                let query = this.db
                    .selectFrom('staff')
                    .selectAll()
                    .where('deleted_at', 'is', null);

                if (status) {
                    query = query.where('status', '=', status);
                }

                return query.orderBy('created_at', 'desc').execute();
            },
            'findAll',
            { status }
        );
    }
}