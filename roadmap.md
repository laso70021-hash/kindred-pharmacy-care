# Swahivo roadmap (unified master plan)

- [x] 1. Registration with plan selection (owner / supplier), 30-day Starter trial, yearly payment proof, admin approval
- [x] 2. Working date-range filter on dashboards
- [x] 3. Pharmacy Owner dashboard (branches, staff invites & roles, inventory/profit) — also block data access for expired accounts
- [x] 4. Supplier marketplace & restock orders with payment proof → auto-stock to branch
- [x] 5. Cashier POS with product photo grid, cart, payments, cash drawer
- [x] 6. Dispenser portal (prescription queue)
- [~] 7. Notifications (done), reports CSV (done), pharmacy logo (done), favicon (already set) — emails blocked: needs an email domain the user owns
- [ ] 8. Role-based landing + view switcher for all portals
- [x] 9. Complete real-world manual entry for business settings, branches, categories, suppliers, products, batches and staff
- [x] 10. CSV/Excel templates, mapping, editable preview, validation, transaction-safe imports and import history
- [x] 11. Create one demo pharmacy through normal workflows: main + two branches, two suppliers, products, batches and staff invitations
- [~] 12. Database alignment complete (35 tables with RLS); admin entry/import/report browser checks, atomic rollback and 40 tests passed. Confirmed-staff branch access checks await controlled confirmed staff accounts; synthetic invitations remain unaccepted.
- [x] 13. Prepare external database migration package: 21 ordered SQL files, environment template, account/storage transfer and deployment checklist; SQL syntax and grants inspected.
- [~] 14. External Supabase connected and environment refreshed; 35 tables have RLS. Existing pharmacy records and uploaded files have not been transferred; their exports are still needed.
- [~] 15. Environment, requested admin role/profile, private buckets, five approved plans and table grants verified; 44 tests pass. Public sign-in and signed-out admin guard checked. Authenticated pharmacy flows require a signed-in external account and pharmacy data; recoverable browser hydration warnings remain unverified.
