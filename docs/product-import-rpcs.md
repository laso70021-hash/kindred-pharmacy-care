# Transactional product images and opening stock

Applied forward migration: `20261119084233_085b5191-3036-44d6-8163-d4d177cea8b1.sql`. Historical migrations are unchanged.

The existing `save_business_entry` and `import_business_rows` signatures, authorization, audit logging and RPC grants are retained. No separate import endpoint, table privileges or RLS changes were added.

- Clients normalize CSV headings before calling these RPCs and upload photos to private `product-images` storage.
- New products require `image_url` as an object path beginning `<pharmacy UUID>/`. URLs, traversal, encoded paths, empty file names and other tenant folders are rejected. Paths use letters, numbers, underscores, hyphens, dots and folder separators. This validates ownership of the path, not that the upload exists.
- Edits with no replacement image keep the stored path, including legacy null images. The column remains nullable.
- Positive whole-number `quantity` on new products requires an unambiguous active tenant `branch_code`, branch access, `batch_number` and `expiry_date`. `received_date` defaults to today; expiry cannot precede receipt. `cost_per_unit` defaults to `cost_price`, then zero, and must be finite and nonnegative. Existing batch triggers still validate manufacturing dates and tenant/branch scope.
- The product, inventory batch, stock-in movement and creation audit are written in one transaction. No product quantity is stored. Zero, blank or null quantity creates no batch or movement. Adding stock on an edit uses the existing batch-receipt path instead.
- A failing import row rolls back every imported product, batch, movement and audit row inside the existing exception block. The failed import-history entry and existing failed result are retained. Fingerprint protection includes failed attempts.

## Verification

`PRODUCT_IMPORT_TEST_SOCKET=/tmp/<disposable-socket> bun run test src/lib/product-import-database.test.ts` runs isolated PostgreSQL tests on port 55433 as `lovable`; otherwise tests skip. Never apply `supabase/tests/product-import-fixture.sql` to the hosted database. Tests cover creation with stock, images, branch/batch errors, zero quantity, edits, rollback, permissions and fingerprints.

Hosted definitions, unchanged RPC grants, nullable images and the private bucket were read back. Authenticated browser imports were not verified on external Supabase. The migration reported 67 pre-existing security findings and introduced none.