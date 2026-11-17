# Existing delivery backend: workflow handoff

Applied 17 November 2026; React UI unchanged. No second delivery system.

## Applied migrations and preservation

- `20261117104000_6c7c6bd2-b520-4c7c-a4d9-2d051c3ff87a.sql`: additive fields, workflow RPCs, uniqueness, audit, Realtime and notifications.
- `20261117104039_3925ed55-319e-4e85-b43e-b5509434ae7d.sql`: revoke internal helper access, audit/notify previous rider, new-delivery plan guard.
- `20261117104518_93e9c6a0-7be6-48ad-a295-5592fbfc457a.sql`: null-safe note authorization.
- Live before/after: **8 jobs, 8 events**. Original-column digests match exactly: jobs `30618cfc3499bf8cde3337e8a30a31b4`, events `03d962f690af2b44ad7aaa346eaab80a`.
- Only assignment-state backfill: `assigned` where an existing rider ID is present, otherwise `available`. No fabricated acceptance/operational timestamps, coordinates, or historical event metadata. All eight live jobs were pending/unassigned.

## Exact public RPC signatures

All operational RPCs require an authenticated caller; only tracking is anonymous.

```sql
create_sale_delivery(_sale uuid, _dropoff text, _recipient text,
  _phone text, _note text) RETURNS uuid

create_sale_delivery(_sale uuid, _dropoff text, _recipient text,
  _phone text, _note text, _pickup_lat double precision,
  _pickup_lng double precision, _dropoff_lat double precision,
  _dropoff_lng double precision, _pickup_address text DEFAULT NULL) RETURNS uuid

accept_delivery_offer(_job uuid) RETURNS void
arrive_delivery_pickup(_job uuid, _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL) RETURNS void
advance_delivery_job(_job uuid, _status text, _lat double precision,
  _lng double precision, _note text, _signature text, _signed_name text) RETURNS void
ping_delivery_location(_job uuid, _lat double precision,
  _lng double precision) RETURNS void
delivery_exception(_job uuid, _action text, _reason text) RETURNS void
add_delivery_note(_job uuid, _note text, _lat double precision,
  _lng double precision) RETURNS void
get_public_delivery_tracking(_job uuid) RETURNS json

-- Existing wholesale/manual creator remains signature-compatible and pending:
create_delivery_job(_pharmacy uuid, _order uuid, _dropoff text,
  _recipient text, _phone text, _lat double precision,
  _lng double precision, _note text) RETURNS uuid
```

Pass all four coordinate parameters explicitly (NULL when unknown) to select the extended dispatch overload. The five-argument wrapper dispatches without coordinates. Pickup address prefers the explicit address, then sale branch address, then business address. Coordinate pairs must both be present or both NULL; valid ranges are latitude −90..90 and longitude −180..180.

## Lifecycle and legacy mapping

1. Cashier dispatch creates `in_process`, assignment `available`.
2. `accept_delivery_offer` sets assignment `assigned`, `rider_id=auth.uid()`, and `accepted_at`. It leaves the shipment status unchanged.
3. `advance_delivery_job(...,'pickup',...)` records `pickup_started_at`.
4. `arrive_delivery_pickup` records `pickup_arrived_at` and an event; status stays `pickup`, `collected_at` stays NULL.
5. `advance_delivery_job(...,'in_transit',...)` requires pickup arrival and records collection.
6. `advance_delivery_job(...,'arrived',...)` records destination arrival.
7. `advance_delivery_job(...,'delivered',...)` requires recipient name (1–200 characters) and a PNG data-URL signature (PNG header/base64 format, maximum 400,000 characters), stores proof and completion time.

Exact sequence: `in_process → pickup → in_transit → arrived → delivered`; skips/backtracking fail.

Legacy `pending` and `accepted` normalize to `in_process`; legacy `picked_up` normalizes to `in_transit`. Other statuses map to themselves. Stored legacy values remain readable. Public tracking returns both raw `status` and normalized `workflow_status`. Existing pending jobs remain pending after acceptance; their next operational transition is `pickup`.

**UI handoff required later:** existing `accepted`, `picked_up` or `cancelled` requests to `advance_delivery_job` are now rejected. The future UI must use separate accept/exception calls and the exact new stage sequence; no UI was changed in this task.

## Authorization, concurrency and exceptions

- Dispatch locks the sale row before checking existing jobs; repeated/concurrent calls return the same active job. A partial unique index guarantees at most one active job per sale even outside that RPC. Delivered-job retries also return the delivered job. Cancelled/returned jobs permit a fresh dispatch; failed/returning jobs still occupy the active slot.
- Acceptance locks the job. Exactly one competing rider succeeds; repeats/losers receive `Delivery offer already accepted`.
- Operational actions require the assigned user to have a same-business membership with role `delivery_rider`, `is_active=true`, `employment_status='active'`, plus an eligible current delivery plan. No owner/admin/manager shortcut applies. Owner accounts, platform administrators and supplier/provider roles are explicitly excluded even if they have a rider membership. Role-preview state is ignored.
- `delivery_exception` actions `cancel` and `reassign` require owner/manager/admin authorization; all need a reason, max 500 characters. Reassignment is allowed only before collection, releases the offer, resets pickup/acceptance fields, audits the former rider and notifies them. A new rider must accept it.
- Assigned active riders use `failed → start_return → returned` exception actions. Failed delivery is never completed. No retry-to-delivered shortcut exists.
- GPS is accepted only for the assigned active rider in normalized `in_process`, `pickup`, `in_transit`, `arrived` or `returning`. Invalid/missing coordinates, unknown jobs, suspension, failure and terminal states raise errors. No GPS event is inserted for every ping; coordinates and last-seen time are persisted and published on the job.
- Normal clients cannot create/edit/delete job or event rows directly. Events are append-only (including a database update/delete guard). New events carry action, old/new status, actor ID/role, timestamp and optional location. Internal trigger helpers cannot be called by ordinary users.

## Realtime, notifications and tracking privacy

- Both existing tables are in `supabase_realtime`. Existing authenticated party-scoped read policies remain in place; anonymous table access is revoked. Subscription delivery with real hosted sessions was **not end-to-end tested**.
- Event-triggered notifications use existing `notify_user`: owners, active operational staff of the involved businesses and the assigned rider; creation/reassignment also notify eligible local riders. The previous rider is notified on reassignment. Notes and GPS pings do not flood notifications.
- Public clients keep polling `get_public_delivery_tracking`; no public table subscription. It is SECURITY DEFINER with fixed `search_path=public`.
- Safe projection only: job ID/tracking number, raw/normalized status, pickup/drop-off addresses and coordinates, permitted rider coordinates/last-seen, creation and workflow timestamps. Rider coordinates are hidden after failure/delivery/cancellation/return. No recipient names/phones, notes, reasons, signatures, actor IDs or assignment identities are exposed. Missing ID returns NULL.

## Maps and customer-message providers

No Mapbox key is needed for these database operations. Maps/routing/geocoding would need a separately configured provider and real coordinates; no routing, geocoding or fabricated locations were added. Browser rider GPS will require HTTPS and location permission when the UI is wired.

No SMS/WhatsApp provider was configured or verified; automated customer messages are **not implemented**. Existing WhatsApp link sharing is not an automated notification service.

## Verification and limits

`src/lib/delivery-database.test.ts` runs the exact three applied migrations in a disposable local PostgreSQL database with a minimal fixture. Run with `DELIVERY_TEST_SOCKET=/tmp/<disposable-socket> bun run test src/lib/delivery-database.test.ts` (port 55432, user lovable); otherwise the suite skips. Never apply `supabase/tests/delivery-fixture.sql` to the connected database.

**9 tests passed:** parallel dispatch + unique-index enforcement, parallel acceptance, wrong-role/tenant/inactive access, unauthorized notes, skipped stages/pickup arrival, proof validation/completion GPS freeze, GPS restrictions/cancellation, failure/return sequence, historical preservation/append-only/privacy/publication/notifications.

Fixture plan and branch helpers are deliberately simplified: these tests do not prove hosted subscription/branch policy behavior. Live catalog/read checks confirmed historical digests, table grants, signatures and publication; authenticated hosted rider flow remains unverified. No operational records were created for testing in production.

The security linter still reports intentional authenticated SECURITY DEFINER entrypoints (necessary for checked transactional writes) and the intentionally limited public tracking RPC. Internal helper grants were removed. Unrelated existing findings remain, including two RLS-without-policy tables, public trigger helpers and disabled leaked-password protection; these were not broadened or silently claimed fixed.