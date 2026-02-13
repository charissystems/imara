import { Staff, NewStaff, StaffUpdate, Role } from '../database/types';
import { BaseRepository } from './baseRepository';

export class StaffRepository extends BaseRepository {

    async findById(id: string): Promise<Staff | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('staff')
                .selectAll()
                .where('id', '=', id)
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
                .set(updates)
                .where('id', '=', id)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'update',
            { staffId: id }
        );
    }

    /**
     * Get Staff with their Role details and Person details
     */
    async getStaffWithDetails(staffId: string) {
        return this.executeSafely(
            () => this.db
                .selectFrom('staff')
                .innerJoin('persons', 'persons.id', 'staff.person_id')
                .leftJoin('roles', 'roles.id', 'staff.role_id')
                .select([
                    'staff.id',
                    'staff.staff_number',
                    'staff.work_email',
                    'staff.department',
                    'staff.job_title',
                    'staff.employment_status',
                    'roles.name as role_name',
                    'roles.display_name as role_display_name',
                    'persons.first_name',
                    'persons.last_name',
                    'persons.personal_email',
                    'persons.primary_phone',
                ])
                .where('staff.id', '=', staffId)
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
                .where('work_email', '=', email)
                .executeTakeFirst(),
            'findByEmail',
            { email }
        );
    }
}