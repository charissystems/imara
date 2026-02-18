import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';
import { randomBytes, randomInt, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';

export class MemberCredentialService {
    constructor(private db: Kysely<TenantDatabase>) {}

    async setPin(memberId: string, pin: string, createdBy?: string) {
        const salt = randomBytes(16).toString('hex');
        const pinHash = await this.hashPin(pin, salt);

        // Upsert: update if exists, insert if not
        const existing = await this.db
            .selectFrom('member_credentials')
            .select('id')
            .where('member_id', '=', memberId)
            .executeTakeFirst();

        if (existing) {
            await this.db
                .updateTable('member_credentials')
                .set({
                    pin_hash: pinHash,
                    pin_salt: salt,
                    pin_attempts: 0,
                    is_locked: false,
                    locked_at: undefined,
                    last_pin_change: new Date(),
                    force_change: false,
                    updated_at: new Date(),
                })
                .where('member_id', '=', memberId)
                .execute();
        } else {
            await this.db
                .insertInto('member_credentials')
                .values({
                    member_id: memberId,
                    pin_hash: pinHash,
                    pin_salt: salt,
                    created_by: createdBy || null,
                })
                .execute();
        }

        return { success: true };
    }

    async verifyPin(memberId: string, pin: string): Promise<{ valid: boolean; locked: boolean }> {
        const cred = await this.db
            .selectFrom('member_credentials')
            .select([
                'member_id',
                'pin_hash',
                'pin_salt',
                'pin_attempts',
                'max_attempts',
                'is_locked',
            ])
            .where('member_id', '=', memberId)
            .executeTakeFirst();

        if (!cred) {
            return { valid: false, locked: false };
        }

        if (cred.is_locked) {
            return { valid: false, locked: true };
        }

        const isValid = await this.verifyPinHash(pin, cred.pin_hash);
        if (isValid) {
            // Reset attempts on success
            await this.db
                .updateTable('member_credentials')
                .set({ pin_attempts: 0, updated_at: new Date() })
                .where('member_id', '=', memberId)
                .execute();
            return { valid: true, locked: false };
        }

        // Increment failed attempts
        const newAttempts = Number(cred.pin_attempts) + 1;
        const shouldLock = newAttempts >= Number(cred.max_attempts);

        await this.db
            .updateTable('member_credentials')
            .set({
                pin_attempts: newAttempts,
                is_locked: shouldLock,
                locked_at: shouldLock ? new Date() : undefined,
                updated_at: new Date(),
            })
            .where('member_id', '=', memberId)
            .execute();

        return { valid: false, locked: shouldLock };
    }

    async resetPin(memberId: string, resetBy: string): Promise<{ temporary_pin: string }> {
        const tempPin = String(randomInt(1000, 10000)); // 4-digit CSPRNG
        const salt = randomBytes(16).toString('hex');
        const pinHash = await this.hashPin(tempPin, salt);

        const existing = await this.db
            .selectFrom('member_credentials')
            .select('id')
            .where('member_id', '=', memberId)
            .executeTakeFirst();

        if (existing) {
            await this.db
                .updateTable('member_credentials')
                .set({
                    pin_hash: pinHash,
                    pin_salt: salt,
                    pin_attempts: 0,
                    is_locked: false,
                    locked_at: undefined,
                    last_pin_change: new Date(),
                    force_change: true,
                    updated_at: new Date(),
                })
                .where('member_id', '=', memberId)
                .execute();
        } else {
            await this.db
                .insertInto('member_credentials')
                .values({
                    member_id: memberId,
                    pin_hash: pinHash,
                    pin_salt: salt,
                    force_change: true,
                    created_by: resetBy,
                })
                .execute();
        }

        return { temporary_pin: tempPin };
    }

    private async hashPin(pin: string, _salt?: string): Promise<string> {
        // Use bcrypt with cost 12 instead of SHA-256 for PIN hashing
        // 4-digit PINs have only 10,000 possibilities — SHA-256 is trivially brute-forced
        return bcrypt.hash(pin, 12);
    }

    private async verifyPinHash(pin: string, hash: string): Promise<boolean> {
        return bcrypt.compare(pin, hash);
    }
}
