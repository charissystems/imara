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
		return this.executeSafely(
			() => this.db
				.selectFrom('members')
				.innerJoin('persons', 'persons.id', 'members.person_id')
				.select([
					'members.id',
					'members.member_number',
					'members.status',
					'persons.first_name',
					'persons.last_name',
					'persons.personal_email',
					'persons.primary_phone',
				])
				.where((eb) =>
					eb.or([
						eb('members.member_number', 'ilike', `%${query}%`),
						eb('persons.first_name', 'ilike', `%${query}%`),
						eb('persons.last_name', 'ilike', `%${query}%`),
						eb('persons.personal_email', 'ilike', `%${query}%`),
						eb('persons.primary_phone', 'ilike', `%${query}%`),
					])
				)
				.orderBy('members.created_at', 'desc')
				.limit(50)
				.execute(),
			'search',
			{ query }
		);
	}

	/**
	 * Get Member with Account Details // For later implementation
	async getMemberWithAccounts(memberId: string) {
	  return this.db
		.selectFrom('members')
		.innerJoin('persons', 'persons.id', 'members.person_id')
		.leftJoin('accounts', 'accounts.member_id', 'members.id')
		.select([
		  'members.id',
		  'members.member_number',
		  'members.status',
		  'persons.first_name',
		  'persons.last_name',
		  'persons.personal_email',
		  'accounts.id as account_id',
		  'accounts.account_number',
		  'accounts.account_type',
		  'accounts.balance',
		])
		.where('members.id', '=', memberId)
		.execute();
	}   */

}