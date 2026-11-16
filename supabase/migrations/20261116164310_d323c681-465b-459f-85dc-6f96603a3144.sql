CREATE OR REPLACE FUNCTION public.next_tracking_number(_pharmacy uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_trk text; v_prefix text;
BEGIN
  LOOP
    SELECT string_agg(chr(65 + floor(random() * 26)::int), '') INTO v_prefix FROM generate_series(1, 3);
    v_trk := v_prefix || to_char(now() AT TIME ZONE 'Africa/Dar_es_Salaam', 'DDMMYYYY');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.delivery_jobs WHERE tracking_number = v_trk);
  END LOOP;
  RETURN v_trk;
END $function$;