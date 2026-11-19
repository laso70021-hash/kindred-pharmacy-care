DO $migration$
DECLARE definition text; start_at int; end_at int;
BEGIN
 SELECT pg_get_functiondef('public.save_business_entry(uuid,text,jsonb,uuid)'::regprocedure) INTO definition;
 definition := replace(definition, 'v_branches uuid[]:=''{}''; v text;', 'v_branches uuid[]:=''{}''; v text; v_image text; v_quantity int; v_batch uuid; v_expiry date; v_received date; v_cost numeric;');
 IF position('v_image text' in definition)=0 THEN RAISE EXCEPTION 'Unexpected save_business_entry declaration'; END IF;
 start_at := position(' IF _module=''products'' THEN' in definition);
 end_at := position(' ELSIF _module=''batches'' THEN' in definition);
 IF start_at=0 OR end_at<=start_at THEN RAISE EXCEPTION 'Unexpected save_business_entry product section'; END IF;
 definition := substr(definition,1,start_at-1) || $product$
 IF _module='products' THEN
  v_image := nullif(btrim(_row->>'image_url'),'');
  IF _id IS NULL AND v_image IS NULL THEN RAISE EXCEPTION 'Product image_url is required for new products'; END IF;
  IF v_image IS NOT NULL THEN
   IF left(v_image,length(_pharmacy::text)+1) <> _pharmacy::text||'/'
      OR v_image !~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+$'
      OR v_image ~ '(^|/)\.{1,2}(/|$)' THEN
    RAISE EXCEPTION 'image_url must be a product-images path inside this pharmacy folder';
   END IF;
  END IF;
  IF btrim(coalesce(_row->>'name',''))='' OR nullif(btrim(_row->>'selling_price'),'') IS NULL THEN RAISE EXCEPTION 'Product name and selling price are required'; END IF;
  IF nullif(btrim(_row->>'quantity'),'') IS NULL THEN v_quantity:=0;
  ELSE
   IF btrim(_row->>'quantity') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Opening stock quantity must be a non-negative whole number'; END IF;
   v_quantity:=btrim(_row->>'quantity')::int;
  END IF;
  IF _id IS NOT NULL AND v_quantity>0 THEN RAISE EXCEPTION 'Use batch receipt to add stock to an existing product'; END IF;
  IF v_quantity>0 THEN
   IF nullif(btrim(_row->>'branch_code'),'') IS NULL OR nullif(btrim(_row->>'batch_number'),'') IS NULL OR nullif(btrim(_row->>'expiry_date'),'') IS NULL THEN RAISE EXCEPTION 'Opening stock requires branch_code, batch_number and expiry_date'; END IF;
   IF (SELECT count(*) FROM branches WHERE pharmacy_id=_pharmacy AND lower(code)=lower(btrim(_row->>'branch_code')) AND is_active IS TRUE)<>1 THEN RAISE EXCEPTION 'Unknown, ambiguous or closed branch_code'; END IF;
   SELECT id INTO v_branch FROM branches WHERE pharmacy_id=_pharmacy AND lower(code)=lower(btrim(_row->>'branch_code')) AND is_active IS TRUE FOR SHARE;
   IF NOT coalesce(public.can_access_branch(_pharmacy,v_branch),false) THEN RAISE EXCEPTION 'Branch access is not permitted'; END IF;
   v_expiry:=btrim(_row->>'expiry_date')::date;
   v_received:=coalesce(nullif(btrim(_row->>'received_date'),'')::date,current_date);
   IF v_expiry<v_received THEN RAISE EXCEPTION 'Expiry date must not be before received date'; END IF;
   v_cost:=coalesce(nullif(btrim(_row->>'cost_per_unit'),'')::numeric,nullif(btrim(_row->>'cost_price'),'')::numeric,0);
   IF v_cost<0 OR v_cost::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid opening stock cost_per_unit'; END IF;
  END IF;
  IF nullif(_row->>'category_name','') IS NOT NULL THEN
   SELECT id INTO v_category FROM categories WHERE pharmacy_id=_pharmacy AND lower(name)=lower(_row->>'category_name');
   IF v_category IS NULL OR (SELECT count(*) FROM categories WHERE pharmacy_id=_pharmacy AND lower(name)=lower(_row->>'category_name'))<>1 THEN RAISE EXCEPTION 'Unknown or ambiguous category_name'; END IF;
  END IF;
  IF nullif(_row->>'supplier_name','') IS NOT NULL THEN
   SELECT id INTO v_supplier FROM suppliers WHERE pharmacy_id=_pharmacy AND lower(name)=lower(_row->>'supplier_name');
   IF v_supplier IS NULL OR (SELECT count(*) FROM suppliers WHERE pharmacy_id=_pharmacy AND lower(name)=lower(_row->>'supplier_name'))<>1 THEN RAISE EXCEPTION 'Unknown or ambiguous supplier_name'; END IF;
  END IF;
  IF _id IS NULL THEN
   INSERT INTO products(pharmacy_id,name,generic_name,brand_name,description,sku,barcode,dosage_form,strength,unit_of_measurement,packaging,cost_price,selling_price,min_stock_level,is_prescription_required,category_id,supplier_id,is_active,image_url)
   VALUES(_pharmacy,_row->>'name',_row->>'generic_name',_row->>'brand_name',_row->>'description',nullif(_row->>'sku',''),_row->>'barcode',_row->>'dosage_form',_row->>'strength',_row->>'unit_of_measurement',_row->>'packaging',coalesce(nullif(_row->>'cost_price','')::numeric,0),(_row->>'selling_price')::numeric,coalesce(nullif(_row->>'min_stock_level','')::integer,0),coalesce(nullif(_row->>'is_prescription_required','')::boolean,false),v_category,v_supplier,coalesce(nullif(_row->>'is_active','')::boolean,true),v_image) RETURNING id INTO v_id;
  ELSE
   UPDATE products SET name=_row->>'name',generic_name=_row->>'generic_name',brand_name=_row->>'brand_name',description=_row->>'description',sku=nullif(_row->>'sku',''),barcode=_row->>'barcode',dosage_form=_row->>'dosage_form',strength=_row->>'strength',unit_of_measurement=_row->>'unit_of_measurement',packaging=_row->>'packaging',cost_price=coalesce(nullif(_row->>'cost_price','')::numeric,0),selling_price=(_row->>'selling_price')::numeric,min_stock_level=coalesce(nullif(_row->>'min_stock_level','')::int,0),is_prescription_required=coalesce(nullif(_row->>'is_prescription_required','')::boolean,false),category_id=v_category,supplier_id=v_supplier,is_active=coalesce(nullif(_row->>'is_active','')::boolean,true),image_url=coalesce(v_image,image_url),updated_at=now() WHERE id=_id AND pharmacy_id=_pharmacy RETURNING id INTO v_id;
  END IF;
  IF v_quantity>0 THEN
   INSERT INTO inventory_batches(pharmacy_id,product_id,branch_id,batch_number,quantity,cost_per_unit,manufacturing_date,expiry_date,received_date)
   VALUES(_pharmacy,v_id,v_branch,btrim(_row->>'batch_number'),v_quantity,v_cost,nullif(btrim(_row->>'manufacturing_date'),'')::date,v_expiry,v_received) RETURNING id INTO v_batch;
   INSERT INTO stock_movements(pharmacy_id,product_id,batch_id,movement_type,quantity,notes,created_by)
   VALUES(_pharmacy,v_id,v_batch,'stock_in',v_quantity,'Opening stock / product creation',auth.uid());
  END IF;
$product$ || substr(definition,end_at);
 EXECUTE definition;
END $migration$;

CREATE OR REPLACE FUNCTION public.import_business_rows(_pharmacy uuid,_module text,_rows jsonb,_fingerprint text,_file_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE r jsonb; n int:=0; message text;
BEGIN
 IF NOT public.can_write_pharmacy(_pharmacy,CASE WHEN _module='staff' THEN ARRAY[]::user_role[] WHEN _module='branches' THEN ARRAY['manager']::user_role[] ELSE ARRAY['manager','inventory_manager','pharmacist']::user_role[] END) THEN RAISE EXCEPTION 'Import is not permitted'; END IF;
 IF _module NOT IN ('products','batches','branches','suppliers','categories','staff') THEN RAISE EXCEPTION 'Unsupported import module'; END IF;
 IF _rows IS NULL OR jsonb_typeof(_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Import between 1 and 5000 rows at a time'; END IF;
 IF jsonb_array_length(_rows)<1 OR jsonb_array_length(_rows)>5000 THEN RAISE EXCEPTION 'Import between 1 and 5000 rows at a time'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_pharmacy::text||_module||_fingerprint,0));
 IF EXISTS(SELECT 1 FROM import_history WHERE pharmacy_id=_pharmacy AND module=_module AND fingerprint=_fingerprint) THEN RAISE EXCEPTION 'This file was already processed; review import history before retrying'; END IF;
 BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
   n:=n+1;
   IF jsonb_typeof(r) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Each import row must be an object'; END IF;
   PERFORM public.save_business_entry(_pharmacy,_module,r,NULL);
  END LOOP;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  INSERT INTO import_history(pharmacy_id,created_by,module,fingerprint,file_name,failed_count,status,error_message) VALUES(_pharmacy,auth.uid(),_module,_fingerprint,left(_file_name,200),jsonb_array_length(_rows),'failed','Row '||n||': '||message);
  RETURN jsonb_build_object('status','failed','successful_count',0,'failed_count',jsonb_array_length(_rows),'error','Row '||n||': '||message);
 END;
 INSERT INTO import_history(pharmacy_id,created_by,module,fingerprint,file_name,successful_count,status) VALUES(_pharmacy,auth.uid(),_module,_fingerprint,left(_file_name,200),n,'completed');
 RETURN jsonb_build_object('status','completed','successful_count',n,'failed_count',0);
END $function$;
-- CREATE OR REPLACE preserves both existing RPC ACLs. No table grants or policies change.