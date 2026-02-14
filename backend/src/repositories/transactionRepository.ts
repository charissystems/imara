/**
 * @deprecated Use AccountRepository instead. Deposit, withdrawal, and transfer
 * operations are now handled directly by AccountRepository methods:
 *   - createDeposit / findDepositsByAccountId
 *   - createWithdrawal / findWithdrawalsByAccountId
 *   - createTransfer / findTransfersByAccountId
 *
 * This file is kept temporarily until all route imports are migrated.
 */
export { AccountRepository as TransactionRepository } from './accountRepository';
