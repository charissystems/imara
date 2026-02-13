import { NewPerson, Person, PersonUpdate } from '../database/types';
import { BaseRepository } from './baseRepository';
import { sql } from 'kysely';

export class PersonRepository extends BaseRepository {
    async findById(id: string): Promise<Person | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('persons')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirst(),
            'findById',
            { personId: id }
        );
    }

    async findDetailsById(id: string) {
        // Join with identity documents if needed, or just person data
        return this.findById(id);
    }

    async create(person: NewPerson): Promise<Person> {
        return this.executeSafely(
            () => this.db
                .insertInto('persons')
                .values(person)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'create',
            { firstName: person.first_name, lastName: person.last_name }
        );
    }

    async update(id: string, updates: PersonUpdate): Promise<Person> {
        return this.executeSafely(
            () => this.db
                .updateTable('persons')
                .set(updates)
                .where('id', '=', id)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'update',
            { personId: id }
        );
    }
}