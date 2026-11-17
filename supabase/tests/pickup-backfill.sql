-- Same active-job data backfill applied through the connected database data tool.
WITH sources AS (
 SELECT j.id,p.id AS pharmacy_id,CASE WHEN j.sale_id IS NOT NULL THEN s.branch_id ELSE main.id END AS branch_id
 FROM public.delivery_jobs j JOIN public.pharmacies p ON p.id=j.pharmacy_id
 LEFT JOIN public.sales s ON s.id=j.sale_id AND s.pharmacy_id=j.pharmacy_id
 LEFT JOIN LATERAL (SELECT b.id FROM public.branches b WHERE b.pharmacy_id=p.id AND b.is_main=true ORDER BY b.created_at,b.id LIMIT 1) main ON j.sale_id IS NULL
 WHERE j.status NOT IN ('delivered','cancelled','returned')
)
UPDATE public.delivery_jobs j SET pickup_branch_id=src.branch_id,pickup_address=coalesce(nullif(trim(b.address),''),nullif(concat_ws(', ',nullif(trim(p.address),''),nullif(trim(p.city),'')),'')),pickup_lat=NULL,pickup_lng=NULL,updated_at=now()
FROM sources src JOIN public.pharmacies p ON p.id=src.pharmacy_id LEFT JOIN public.branches b ON b.id=src.branch_id AND b.pharmacy_id=src.pharmacy_id
WHERE j.id=src.id;