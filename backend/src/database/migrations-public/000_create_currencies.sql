-- REFERENCE DATA: Currencies
CREATE TABLE public.currencies(
    code varchar(3) PRIMARY KEY,
    name varchar(100) NOT NULL,
    symbol varchar(10),
    decimal_places smallint DEFAULT 2,
    is_active boolean DEFAULT TRUE NOT NULL,
    
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- Unique index for soft deletes (prevents duplicate active currencies)
CREATE UNIQUE INDEX currencies_code_active_idx 
ON public.currencies(code) 
WHERE deleted_at IS NULL;

-- Index for soft delete queries
CREATE INDEX currencies_deleted_at_idx 
ON public.currencies(deleted_at);

-- Trigger: Auto-update updated_at
CREATE TRIGGER currencies_set_updated_at
    BEFORE UPDATE ON public.currencies
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Seed Data
INSERT INTO public.currencies(code, name, symbol, decimal_places)
VALUES
    ('UGX', 'Uganda Shilling', 'USh', 0),
    ('KES', 'Kenya Shilling', 'KSh', 2),
    ('USD', 'US Dollar', '$', 2),
    ('EUR', 'Euro', '€', 2);
