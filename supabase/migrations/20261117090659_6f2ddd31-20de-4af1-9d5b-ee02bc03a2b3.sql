CREATE OR REPLACE FUNCTION public.get_public_delivery_tracking(_job uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id', j.id,
    'tracking_number', j.tracking_number,
    'status', j.status,
    'pickup_address', j.pickup_address,
    'dropoff_address', j.dropoff_address,
    'dropoff_lat', j.dropoff_lat,
    'dropoff_lng', j.dropoff_lng,
    'rider_lat', j.rider_lat,
    'rider_lng', j.rider_lng,
    'rider_seen_at', j.rider_seen_at,
    'created_at', j.created_at
  )
  FROM public.delivery_jobs j
  WHERE j.id = _job
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_delivery_tracking(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_delivery_tracking(uuid) TO authenticated;