CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $body$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$body$;
