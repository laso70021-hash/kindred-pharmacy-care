DO $$
DECLARE before_value jsonb; after_value jsonb;
BEGIN
 SELECT value INTO before_value FROM public.platform_settings WHERE key='branding' FOR UPDATE;
 IF before_value IS NULL OR jsonb_typeof(before_value)<>'object' THEN RAISE EXCEPTION 'Existing branding setting required'; END IF;
 UPDATE public.platform_settings SET value=jsonb_set(jsonb_set(value,'{support_email}',to_jsonb('support@afyadawa.co.tz'::text),true),'{website}',to_jsonb('https://www.afyadawa.co.tz'::text),true),updated_at=now() WHERE key='branding';
 SELECT value INTO after_value FROM public.platform_settings WHERE key='branding';
 IF after_value->>'support_email' IS DISTINCT FROM 'support@afyadawa.co.tz' OR after_value->>'website' IS DISTINCT FROM 'https://www.afyadawa.co.tz' THEN RAISE EXCEPTION 'Branding verification failed'; END IF;
 IF (before_value-'support_email'-'website') IS DISTINCT FROM (after_value-'support_email'-'website') THEN RAISE EXCEPTION 'Unrelated branding changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_settings WHERE value::text ILIKE '%swahivo.com%') THEN RAISE EXCEPTION 'Legacy domain remains in global settings'; END IF;
END $$;