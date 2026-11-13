# Swahivo roadmap (unified master plan)

- [~] 18. Edit/delete controls, add-confirmation emails, team/import email invitations, secure first-password setup and owner-selected daily/weekly/monthly report settings implemented; 68 tests passed, public password page and scheduler denial verified; Resend swahivo.com sender verified. Activation waits on Vercel deployment with CRON_SECRET/RESEND_API_KEY/LOVABLE_API_KEY and Supabase allowing https://swahivo.com/set-password. External-account end-to-end and inbox delivery are unverified; external SMTP settings cannot be read here. Contact invitations create accounts without granting team/provider access. Reports run hourly at minute 17 (24 invocations/day); delivery can be deferred by the three-recipient batch cap and requires a Vercel plan supporting hourly cron.

- [x] 17. Collapsible phone/tablet navigation; uncropped hero photo, centered AI banner and single-row action buttons. Public flow verified at 320, 394, 768, 1024 and 1280px; authenticated dashboard checks unavailable on external Supabase.

- [x] 16. AI category suggestions for unmatched import rows, with tenant-scoped categories and explicit user approval; live authenticated checks unavailable on external Supabase.

- [x] 1. Registration with plan selection (owner / supplier), 30-day Starter trial, yearly payment proof, admin approval
- [x] 2. Working date-range filter on dashboards
- [x] 3. Pharmacy Owner dashboard (branches, staff invites & roles, inventory/profit) — also block data access for expired accounts
- [x] 4. Supplier marketplace & restock orders with payment proof → auto-stock to branch
- [x] 5. Cashier POS with product photo grid, cart, payments, cash drawer
- [x] 6. Dispenser portal (prescription queue)
- [~] 7. Notifications (done), reports CSV (done), pharmacy logo (done), favicon (already set) — emails blocked: needs an email domain the user owns
- [x] 8. Role-based account navigation; view switcher removed at the user's request.
- [x] 9. Complete real-world manual entry for business settings, branches, categories, suppliers, products, batches and staff
- [x] 10. CSV/Excel templates, mapping, editable preview, validation, transaction-safe imports and import history
- [x] 11. Create one demo pharmacy through normal workflows: main + two branches, two suppliers, products, batches and staff invitations
- [~] 12. Database alignment complete (35 tables with RLS); admin entry/import/report browser checks, atomic rollback and 40 tests passed. Confirmed-staff branch access checks await controlled confirmed staff accounts; synthetic invitations remain unaccepted.
- [x] 13. Prepare external database migration package: 21 ordered SQL files, environment template, account/storage transfer and deployment checklist; SQL syntax and grants inspected.
- [~] 14. External Supabase connected and environment refreshed; 35 tables have RLS. Existing pharmacy records and uploaded files have not been transferred; their exports are still needed.
- [~] 15. Environment, requested admin role/profile, private buckets, five approved plans and table grants verified; 44 tests pass. Public sign-in and signed-out admin guard checked. Authenticated pharmacy flows require a signed-in external account and pharmacy data; recoverable browser hydration warnings remain unverified.
- [x] Ops 1: Pharmacy Products canvas
- [x] Ops 2–3: Employee shifts + individual shift reports
- [x] Ops 4: Document generation (invoice, proforma, delivery note, labels)
- [x] Ops 5: Overview analytics charts
