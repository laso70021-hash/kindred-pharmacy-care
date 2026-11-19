DO $m$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.save_business_entry(uuid,text,jsonb,uuid)'::regprocedure) INTO d;
 IF position('IF _id IS NULL AND v_image IS NULL THEN RAISE EXCEPTION ''Product image_url is required for new products''; END IF;' in d)=0 THEN RAISE EXCEPTION 'Unexpected save_business_entry image rule'; END IF;
 d := replace(d,'IF _id IS NULL AND v_image IS NULL THEN RAISE EXCEPTION ''Product image_url is required for new products''; END IF;','');
 EXECUTE d;
END $m$;