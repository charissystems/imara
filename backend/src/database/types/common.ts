import { ColumnType } from 'kysely';
import { Decimal } from 'decimal.js';

/*
 * UTILITY & MAPPING TYPES
 * Core type definitions for database column mappings and utility types used across all tables
 */

export type DecimalColumn = ColumnType<Decimal, Decimal.Value, Decimal.Value>;
export type DateColumn = ColumnType<Date, string | undefined>;
export type NullableDateColumn = ColumnType<Date, string | undefined> | null;
