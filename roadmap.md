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
- [ ] 16. Plan feature gating (branches/staff/AI/prescription/delivery flags from subscription_plans) + upgrade prompts
- [ ] 17. Landing-page audit: implement features promised but missing
- [ ] 18. Optional AI providers: OpenAI and OpenRouter keys with per-task model recommendations — blocked: needs user's API keys
- [ ] 19. Demo test accounts with emails/passwords for Paman and Novea — blocked: user to confirm test email addresses
- [ ] 20. Invite link shareable via WhatsApp in addition to email
