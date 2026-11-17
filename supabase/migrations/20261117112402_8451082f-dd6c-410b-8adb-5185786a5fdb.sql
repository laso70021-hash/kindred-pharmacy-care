ALTER TABLE public.delivery_jobs ADD COLUMN pickup_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX delivery_jobs_open_pickup_branch_idx ON public.delivery_jobs(pickup_branch_id) WHERE status NOT IN ('delivered','cancelled','returned');

CREATE OR REPLACE FUNCTION public.create_sale_delivery(_sale uuid,_dropoff text,_recipient text,_phone text,_note text,_pickup_lat double precision,_pickup_lng double precision,_dropoff_lat double precision,_dropoff_lng double precision,_pickup_address text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sales; v uuid; pickup text; trk text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT * INTO s FROM public.sales WHERE id=_sale FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
 IF NOT public.can_write_pharmacy(s.pharmacy_id,ARRAY['manager','pharmacist','cashier','inventory_manager']::public.user_role[]) OR NOT public.can_access_branch(s.pharmacy_id,s.branch_id) THEN RAISE EXCEPTION 'You cannot dispatch this sale'; END IF;
 SELECT id INTO v FROM public.delivery_jobs WHERE sale_id=_sale AND status NOT IN ('delivered','cancelled','returned'); IF FOUND THEN RETURN v; END IF;
 SELECT id INTO v FROM public.delivery_jobs WHERE sale_id=_sale AND status='delivered' ORDER BY created_at DESC LIMIT 1; IF FOUND THEN RETURN v; END IF;
 IF NOT public.pharmacy_has_plan_feature(s.pharmacy_id,'delivery') THEN RAISE EXCEPTION 'Delivery management requires an eligible current plan'; END IF;
 IF coalesce(trim(_dropoff),'')='' THEN RAISE EXCEPTION 'Delivery address is required'; END IF;
 PERFORM public.validate_delivery_coordinates(_pickup_lat,_pickup_lng);
 PERFORM public.validate_delivery_coordinates(_dropoff_lat,_dropoff_lng);
 -- Branches have no coordinates: canonical address wins over caller snapshots.
 SELECT coalesce(nullif(trim(b.address),''),nullif(concat_ws(', ',nullif(trim(p.address),''),nullif(trim(p.city),'')),'')) INTO pickup FROM public.pharmacies p LEFT JOIN public.branches b ON b.id=s.branch_id AND b.pharmacy_id=p.id WHERE p.id=s.pharmacy_id;
 LOOP
  trk:=public.next_tracking_number(s.pharmacy_id);
  BEGIN
   INSERT INTO public.delivery_jobs(tracking_number,pharmacy_id,sale_id,pickup_branch_id,status,pickup_address,pickup_lat,pickup_lng,dropoff_address,dropoff_lat,dropoff_lng,recipient_name,recipient_phone,note,created_by)
   VALUES(trk,s.pharmacy_id,_sale,s.branch_id,'in_process',pickup,NULL,NULL,trim(_dropoff),_dropoff_lat,_dropoff_lng,nullif(trim(_recipient),''),nullif(trim(_phone),''),nullif(trim(_note),''),auth.uid()) RETURNING id INTO v;
   EXIT;
  EXCEPTION WHEN unique_violation THEN
   SELECT id INTO v FROM public.delivery_jobs WHERE sale_id=_sale AND status NOT IN ('delivered','cancelled','returned'); IF FOUND THEN RETURN v; END IF;
  END;
 END LOOP;
 INSERT INTO public.delivery_job_events(job_id,status,actor_id,action,new_status,note) VALUES(v,'in_process',auth.uid(),'created','in_process','Sent from till');
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.create_delivery_job(_pharmacy uuid,_order uuid,_dropoff text,_recipient text,_phone text,_lat double precision,_lng double precision,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_trk text; v_buyer uuid; v_pickup text; v_branch uuid;
BEGIN
 IF NOT public.can_write_pharmacy(_pharmacy, ARRAY['manager','pharmacist','cashier','inventory_manager']::public.user_role[]) AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'You cannot create deliveries for this business'; END IF;
 IF coalesce(trim(_dropoff),'')='' THEN RAISE EXCEPTION 'Delivery address is required'; END IF;
 IF _order IS NOT NULL THEN
  SELECT buyer_pharmacy_id INTO v_buyer FROM public.wholesale_orders WHERE id=_order AND supplier_id=_pharmacy;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found for this supplier'; END IF;
  IF EXISTS(SELECT 1 FROM public.delivery_jobs WHERE wholesale_order_id=_order AND status<>'cancelled') THEN RAISE EXCEPTION 'This order already has a delivery'; END IF;
 END IF;
 SELECT b.id,coalesce(nullif(trim(b.address),''),nullif(concat_ws(', ',nullif(trim(p.address),''),nullif(trim(p.city),'')),'')) INTO v_branch,v_pickup
 FROM public.pharmacies p LEFT JOIN LATERAL (SELECT id,address FROM public.branches WHERE pharmacy_id=p.id AND is_main=true ORDER BY created_at,id LIMIT 1) b ON true WHERE p.id=_pharmacy;
 v_trk:=public.next_tracking_number(_pharmacy);
 INSERT INTO public.delivery_jobs(tracking_number,pharmacy_id,buyer_pharmacy_id,wholesale_order_id,pickup_branch_id,pickup_address,dropoff_address,recipient_name,recipient_phone,dropoff_lat,dropoff_lng,note,created_by)
 VALUES(v_trk,_pharmacy,v_buyer,_order,v_branch,v_pickup,trim(_dropoff),nullif(trim(_recipient),''),nullif(trim(_phone),''),_lat,_lng,nullif(trim(_note),''),auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.delivery_job_events(job_id,status,actor_id,note) VALUES(v_id,'pending',auth.uid(),'Tracking number '||v_trk||' created');
 RETURN v_id;
END $$;

CREATE FUNCTION public.refresh_delivery_pickup_location() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='branches' THEN
  UPDATE public.delivery_jobs j SET pickup_address=coalesce(nullif(trim(NEW.address),''),nullif(concat_ws(', ',nullif(trim(p.address),''),nullif(trim(p.city),'')),'')),pickup_lat=NULL,pickup_lng=NULL,updated_at=now()
  FROM public.pharmacies p WHERE j.pickup_branch_id=NEW.id AND j.pharmacy_id=NEW.pharmacy_id AND p.id=j.pharmacy_id AND j.status NOT IN ('delivered','cancelled','returned');
 ELSE
  UPDATE public.delivery_jobs j SET pickup_address=nullif(concat_ws(', ',nullif(trim(NEW.address),''),nullif(trim(NEW.city),'')),''),pickup_lat=NULL,pickup_lng=NULL,updated_at=now()
  WHERE j.pharmacy_id=NEW.id AND j.status NOT IN ('delivered','cancelled','returned') AND (j.pickup_branch_id IS NULL OR EXISTS(SELECT 1 FROM public.branches b WHERE b.id=j.pickup_branch_id AND b.pharmacy_id=NEW.id AND nullif(trim(b.address),'') IS NULL));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.refresh_delivery_pickup_location() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER branches_refresh_delivery_pickup AFTER UPDATE OF address ON public.branches FOR EACH ROW WHEN (OLD.address IS DISTINCT FROM NEW.address) EXECUTE FUNCTION public.refresh_delivery_pickup_location();
CREATE TRIGGER pharmacies_refresh_delivery_pickup AFTER UPDATE OF address,city ON public.pharmacies FOR EACH ROW WHEN (OLD.address IS DISTINCT FROM NEW.address OR OLD.city IS DISTINCT FROM NEW.city) EXECUTE FUNCTION public.refresh_delivery_pickup_location();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='delivery_jobs') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_jobs; END IF;
END $$;