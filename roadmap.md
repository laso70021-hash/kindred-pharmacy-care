# Roadmap — Role dashboards + Supplier Marketplace

Reference: 19 uploaded designs + "COMPLETE SUPPLIER MARKETPLACE" brief. Keep the existing SWAHIVO look; add features, never rebuild.

- [x] 1. Role-based home dashboards (owner, manager, pharmacist/dispenser, cashier, inventory manager, accountant, delivery rider, supplier) — invited staff already get automatic invitation emails
- [x] 2. Supplier Portal sidebar — 11 pages live; Quotations + Dispatch & Delivery come with step 5 (need order-lifecycle data): Dashboard, Purchase Orders, Quotations, Product Catalogue, Bulk Import, Inventory Availability, Dispatch & Delivery, Invoices, Payments, Notifications, Reports, Messages, Settings
- [x] 3. Stock Alerts "Order from Suppliers" → prefilled restock, supplier matching across catalogs
- [x] 4. Purchase-list import (CSV/XLSX) with automatic supplier matching, multi-supplier orders
- [x] 5. Full order lifecycle: request → quotation → confirmed → preparing → dispatched → in transit → delivered → stock received (stock added only on receipt)
- [x] 6. Order-linked chat, documents, notifications; invoices & verified payments
- [x] 7. Tests: lifecycle, matching, tenant isolation, regression
- [x] 8. Quotation requests (request → supplier prices → accept & pay / decline)

# Roadmap — Covlo AI, roles & plan features (Nov 14)
- [x] 9. Owner/admin "View as role" switcher at top of workspace (pharmacy + supplier)
- [x] 10. Admin opens any business (Paman, Novea…) with "Return to admin dashboard" bar; admin-opened businesses never appear in other users' switcher, and admin switcher shows only the opened business
- [x] 11. Staff: change role, add/remove extra roles, suspend/reactivate users
- [x] 12. Logo upload for main business and each branch (existing + new accounts), used on receipts
- [x] 13. Covlo ("Kovlo") AI assistant — chat, quick save, reports, order/service tracking; per-role advice (owner, pharmacist, cashier, manager, accountant, supplier, rider)
- [x] 14. Covlo for suppliers: platform-wide demand forecast, trending products, next-batch suggestions
- [x] 15. AI Prescription Assistant: scan/type/browser speech → catalogue matches, written dosage, unexpired branch stock; explicit review into existing queue (authenticated live verification unavailable on external Supabase)
- [x] 16. Plan feature gating: assigned Supabase flags checked for Covlo, prescription AI, AI imports, scheduled reports, demand forecasts and delivery updates; upgrade prompts; existing branch/staff limits retained. Tests passed; authenticated end-to-end check unavailable on external Supabase.
- [ ] 17. Landing-page audit: implement features promised but missing
- [x] 18. AI runs on OpenRouter (openai/gpt-5.6-terra)
- [ ] 19. Demo test accounts with emails/passwords for Paman and Novea — blocked: user to confirm test email addresses
- [x] 20. Invite link shareable via WhatsApp in addition to email

# Delivery backend workflow (Nov 17)
- [x] Global branding: forward migration applied; Afyadawa support email/website verified with unrelated-setting digests unchanged.
- [x] Product RPCs: forward migration applied; private tenant images, transactional opening stock and 26 SQL tests verified. Hosted authenticated browser import remains unverified on external Supabase.
- [x] Central pickup sources: branch links, 10 active jobs refreshed, address-change triggers, POS/manual RPCs; 15 SQL tests passed and live public tracking verified. Hosted authenticated checkout/Realtime receipt remains unverified on external Supabase.
- [x] Inspect live schema; apply additive dispatch, assignment, rider transitions, exceptions, GPS, audit and notification migration.
- [x] Run 9 isolated SQL tests; verify live historical digests, grants and Realtime publication. Hosted rider/subscription end-to-end verification unavailable on external Supabase.
- [x] Document exact RPC calls, legacy mapping, provider requirements and verification limits in docs/delivery-backend.md; React UI unchanged.
