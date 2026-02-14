import { IdentityDocument, NewIdentityDocument, IdentityDocumentUpdate } from '../database/types';
import { BaseRepository } from './baseRepository';

/**
 * Repository for identity documents.
 *
 * Column reference (identity_documents table):
 *   id, member_id, document_type, document_number, issue_date, expiry_date,
 *   document_url, document_data, is_verified (boolean), verified_by, verified_at,
 *   created_by, created_at, updated_at, deleted_at
 */
export class DocumentRepository extends BaseRepository {

    async create(document: NewIdentityDocument): Promise<IdentityDocument> {
        return this.executeSafely(
            () => this.db
                .insertInto('identity_documents')
                .values(document)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'create',
            { memberId: document.member_id, documentType: document.document_type }
        );
    }

    async findByMemberId(memberId: string): Promise<IdentityDocument[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('identity_documents')
                .selectAll()
                .where('member_id', '=', memberId)
                .where('deleted_at', 'is', null)
                .orderBy('created_at', 'desc')
                .execute(),
            'findByMemberId',
            { memberId }
        );
    }

    async update(id: string, updates: IdentityDocumentUpdate): Promise<IdentityDocument> {
        return this.executeSafely(
            () => this.db
                .updateTable('identity_documents')
                .set({ ...updates, updated_at: new Date() })
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'update',
            { documentId: id }
        );
    }

    async updateVerificationStatus(
        id: string,
        verified: boolean,
        verifiedBy: string
    ): Promise<IdentityDocument> {
        return this.update(id, {
            is_verified: verified,
            verified_by: verifiedBy,
            verified_at: new Date(),
        });
    }
}