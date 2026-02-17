-- SHARED FUNCTIONS: Must exist before any table migration uses them
-- Trigger function for auto-updating updated_at columns
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS TRIGGER
    AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$
LANGUAGE plpgsql;
