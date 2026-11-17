-- Isolated PostgreSQL fixture only. Never run against the connected database.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE TYPE public.user_role AS ENUM ('super_admin','pharmacy_owner','supplier','manager','cashier','pharmacist','inventory_manager','accountant','delivery_rider');
CREATE TABLE public.pharmacies(id uuid PRIMARY KEY,owner_id uuid,address text,city text);
CREATE TABLE public.pharmacy_memberships(id uuid DEFAULT gen_random_uuid(),pharmacy_id uuid,user_id uuid,role public.user_role,is_active boolean,employment_status text);
CREATE TABLE public.user_roles(user_id uuid,role public.user_role);
CREATE TABLE public.branches(id uuid PRIMARY KEY,address text);
CREATE TABLE public.sales(id uuid PRIMARY KEY,pharmacy_id uuid,branch_id uuid);
CREATE TABLE public.notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,pharmacy_id uuid,kind text,title text,body text,link text);
CREATE TABLE public.delivery_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tracking_number text UNIQUE NOT NULL,pharmacy_id uuid NOT NULL,buyer_pharmacy_id uuid,wholesale_order_id uuid,sale_id uuid,rider_id uuid,status text NOT NULL DEFAULT 'pending',pickup_address text,dropoff_address text NOT NULL,recipient_name text,recipient_phone text,dropoff_lat double precision,dropoff_lng double precision,rider_lat double precision,rider_lng double precision,rider_seen_at timestamptz,signature text,signed_name text,delivered_at timestamptz,note text,created_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),CONSTRAINT delivery_jobs_status_check CHECK(status IN ('pending','accepted','picked_up','in_transit','arrived','delivered','cancelled')));
CREATE TABLE public.delivery_job_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid REFERENCES public.delivery_jobs(id),status text NOT NULL,actor_id uuid,lat double precision,lng double precision,note text,created_at timestamptz DEFAULT now());
ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_job_events ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.has_role(_user uuid,_role public.user_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user AND role=_role) $$;
CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_role(auth.uid(),'super_admin') $$;
CREATE FUNCTION public.can_write_pharmacy(_pharmacy uuid,_roles public.user_role[]) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_platform_admin() OR EXISTS(SELECT 1 FROM public.pharmacies WHERE id=_pharmacy AND owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.pharmacy_memberships WHERE pharmacy_id=_pharmacy AND user_id=auth.uid() AND is_active=true AND role=ANY(_roles)) $$;
-- Fixture businesses all have an eligible current plan and unrestricted branches.
CREATE FUNCTION public.pharmacy_has_plan_feature(_pharmacy uuid,_feature text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.can_access_branch(_pharmacy uuid,_branch uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.next_tracking_number(_pharmacy uuid) RETURNS text LANGUAGE sql AS $$ SELECT upper(substr(md5(gen_random_uuid()::text),1,12)) $$;
CREATE FUNCTION public.notify_user(_user uuid,_pharmacy uuid,_kind text,_title text,_body text,_link text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ INSERT INTO public.notifications(user_id,pharmacy_id,kind,title,body,link) SELECT _user,_pharmacy,_kind,_title,_body,_link WHERE _user IS NOT NULL $$;
CREATE POLICY jobs_fixture_read ON public.delivery_jobs FOR SELECT TO authenticated USING(public.is_platform_admin() OR EXISTS(SELECT 1 FROM public.pharmacies WHERE id=pharmacy_id AND owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.pharmacy_memberships WHERE pharmacy_id=delivery_jobs.pharmacy_id AND user_id=auth.uid() AND is_active=true));
CREATE PUBLICATION supabase_realtime;
INSERT INTO public.pharmacies VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','Pickup street','Test city'),('00000000-0000-0000-0000-000000000002',NULL,'Other pickup','Test city');
INSERT INTO public.pharmacy_memberships(pharmacy_id,user_id,role,is_active,employment_status) VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','delivery_rider',true,'active'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012','delivery_rider',true,'active'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000013','manager',true,'active'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000014','delivery_rider',false,'inactive'),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000015','delivery_rider',true,'active'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000016','delivery_rider',true,'active'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000017','cashier',true,'active');
INSERT INTO public.user_roles VALUES('00000000-0000-0000-0000-000000000016','super_admin');
INSERT INTO public.delivery_jobs(id,tracking_number,pharmacy_id,status,dropoff_address) VALUES('00000000-0000-0000-0000-000000000099','HISTORY','00000000-0000-0000-0000-000000000001','pending','Historical address');
INSERT INTO public.delivery_job_events(job_id,status,note) VALUES('00000000-0000-0000-0000-000000000099','pending','Original history');