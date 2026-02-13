import { IdentityDocument, NewIdentityDocument, IdentityDocumentUpdate } from '../database/types';
import { BaseRepository } from './baseRepository';

export class DocumentRepository extends BaseRepository {

    async create(document: NewIdentityDocument): Promise<IdentityDocument> {
        return this.executeSafely(
            () => this.db
                .insertInto('identity_documents')
                .values(document)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'create',
            { personId: document.person_id, documentType: document.document_type }
        );
    }

    async findByPersonId(personId: string): Promise<IdentityDocument[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('identity_documents')
                .selectAll()
                .where('person_id', '=', personId)
                .orderBy('created_at', 'desc')
                .execute(),
            'findByPersonId',
            { personId }
        );
    }

    async update(id: string, updates: IdentityDocumentUpdate): Promise<IdentityDocument> {
        return this.executeSafely(
            () => this.db
                .updateTable('identity_documents')
                .set(updates)
                .where('id', '=', id)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'update',
            { documentId: id }
        );
    }

    async updateVerificationStatus(
        id: string,
        status: 'pending' | 'approved' | 'rejected',
        verifiedBy: string
    ): Promise<IdentityDocument> {
        return this.update(id, {
            verification_status: status,
            verified_by: verifiedBy,
            verified_at: new Date()
        });
    }
}