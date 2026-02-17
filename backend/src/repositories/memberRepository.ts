import { Member, NewMember, MemberUpdate } from '../database/types';
import { BaseRepository } from './baseRepository';

export class MemberRepository extends BaseRepository {

	async findById(id: string): Promise<Member | undefined> {
		return this.executeSafely(
			() => this.db
				.selectFrom('members')
				.selectAll()
				.where('id', '=', id)
				.executeTakeFirst(),
			'findById',
			{ memberId: id }
		);
	}

	async findByMemberNumber(memberNumber: string): Promise<Member | undefined> {
		return this.executeSafely(
			() => this.db
				.selectFrom('members')
				.selectAll()
				.where('member_number', '=', memberNumber)
				.executeTakeFirst(),
			'findByMemberNumber',
			{ memberNumber }
		);
	}

	async findAll(status?: Member['status']): Promise<Member[]> {
		return this.executeSafely(
			async () => {
				let query = this.db.selectFrom('members').selectAll();
				if (status) {
					query = query.where('status', '=', status);
				}
				return query.execute();
			},
			'findAll',
			{ status }
		);
	}

	async create(member: NewMember): Promise<Member> {
		return this.executeSafely(
			() => this.db
				.insertInto('members')
				.values(member)
				.returningAll()
				.executeTakeFirstOrThrow(),
			'create',
			{ memberNumber: member.member_number }
		);
	}

	async update(id: string, updates: MemberUpdate): Promise<Member> {
		return this.executeSafely(
			() => this.db
				.updateTable('members')
				.set(updates)
				.where('id', '=', id)
				.returningAll()
				.executeTakeFirstOrThrow(),
			'update',
			{ memberId: id }
		);
	}

	async softDelete(id: string): Promise<void> {
		await this.executeSafely(
			() => this.db
				.updateTable('members')
				.set({ deleted_at: new Date() })
				.where('id', '=', id)
				.execute(),
			'softDelete',
			{ memberId: id }
		);
	}

	/**
	 * Search Members by Name, Email, Phone, or Member Number
	 */
	async search(query: string) {
		// Escape LIKE pattern characters to prevent pattern injection
		const escaped = query.replace(/[%_\\]/g, '\\$&');
		return this.executeSafely(
			() => this.db
				.selectFrom('members')
				.select([
					'id',
					'member_number',
					'status',
					'first_name',
					'last_name',
					'email',
					'phone',
				])
				.where('deleted_at', 'is', null)
				.where((eb) =>
					eb.or([
						eb('member_number', 'ilike', `%${escaped}%`),
						eb('first_name', 'ilike', `%${escaped}%`),
						eb('last_name', 'ilike', `%${escaped}%`),
						eb('email', 'ilike', `%${escaped}%`),
						eb('phone', 'ilike', `%${escaped}%`),
					])
				)
				.orderBy('created_at', 'desc')
				.limit(50)
				.execute(),
			'search',
			{ query }
		);
	}
}