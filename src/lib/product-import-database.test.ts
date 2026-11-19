import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { readFileSync, readdirSync } from 'node:fs'

const socket = process.env['PRODUCT_IMPORT_TEST_SOCKET']
const suite = socket?.startsWith('/tmp/') ? describe : describe.skip
suite('transactional product RPCs (disposable PostgreSQL)', () => {
  const sql = postgres({ host: socket, port: 55433, username: 'lovable', database: 'postgres' })
  const pharmacy = '00000000-0000-0000-0000-000000000001'
  const owner = '00000000-0000-0000-0000-000000000010'
  const row = (extra: Record<string, unknown> = {}) => ({ name: 'Paracetamol', sku: crypto.randomUUID(), selling_price: 1500, cost_price: 700, image_url: `${pharmacy}/products/photo.jpg`, quantity: 12, branch_code: 'MAIN', batch_number: 'B001', expiry_date: '2028-12-31', received_date: '2026-11-19', cost_per_unit: 650, ...extra })
  const asUser = (uid: string, work: (tx: postgres.TransactionSql) => Promise<unknown>) => sql.begin(async tx => {
    await tx`select set_config('request.jwt.claim.sub',${uid},true)`
    await tx.unsafe('SET LOCAL ROLE authenticated')
    return work(tx)
  })
  const save = (r: Record<string, unknown>, id: string | null = null) => asUser(owner, tx => tx`select public.save_business_entry(${pharmacy},'products',${JSON.stringify(r)}::jsonb,${id}::uuid) as id`) as Promise<{id: string}[]>
  const runImport = async (rows: Record<string, unknown>[], fingerprint = crypto.randomUUID()) => {
    const results = await asUser(owner, tx => tx`select public.import_business_rows(${pharmacy},'products',${JSON.stringify(rows)}::jsonb,${fingerprint},'products.csv') as result`) as {result: {status: string; successful_count: number; failed_count: number; error?: string}}[]
    return results[0]?.result
  }
  beforeAll(async () => {
    await sql.unsafe(readFileSync('supabase/tests/product-import-fixture.sql','utf8'))
    const original = readFileSync('drizzle/migrations/0013_real_world_entry_imports.sql','utf8')
    const saveStart = original.indexOf('CREATE OR REPLACE FUNCTION public.save_business_entry')
    const saveEnd = original.indexOf('CREATE OR REPLACE FUNCTION public.import_business_rows')
    await sql.unsafe(original.slice(saveStart,saveEnd))
    await sql.unsafe('GRANT EXECUTE ON FUNCTION public.save_business_entry(uuid,text,jsonb,uuid) TO service_role')
    await sql.unsafe(original.slice(saveEnd,original.indexOf('CREATE OR REPLACE FUNCTION public.correct_batch_stock')))
    await sql.unsafe('GRANT EXECUTE ON FUNCTION public.import_business_rows(uuid,text,jsonb,text,text) TO service_role')
    const validationStart = original.indexOf('CREATE OR REPLACE FUNCTION public.validate_business_entry')
    const validationEnd = original.indexOf('CREATE TRIGGER branches_validate_entry')
    await sql.unsafe(original.slice(validationStart,validationEnd))
    const migration = readdirSync('supabase/migrations').find(f => f.includes('085b5191-3036-44d6-8163-d4d177cea8b1'))
    if (!migration) throw new Error('Product RPC migration missing')
    await sql.unsafe(readFileSync(`supabase/migrations/${migration}`,'utf8'))
  })
  afterAll(async () => { await sql.end() })
  it('imports product, private image path, batch and stock movement together', async () => {
    const r = row()
    expect(await runImport([r])).toMatchObject({status:'completed',successful_count:1,failed_count:0})
    const records = await sql`select p.image_url,b.quantity,b.cost_per_unit,b.branch_id,m.quantity as movement_quantity,m.movement_type from products p join inventory_batches b on b.product_id=p.id join stock_movements m on m.batch_id=b.id where p.sku=${r.sku}`
    expect(records[0]).toMatchObject({image_url:r.image_url,quantity:12,cost_per_unit:'650',branch_id:'00000000-0000-0000-0000-000000000101',movement_quantity:12,movement_type:'stock_in'})
  })
  it.each([null,'','   '])('requires image for new products: %s', async image_url => {
    await expect(save(row({image_url}))).rejects.toThrow(/image_url is required/)
  })
  it.each(['00000000-0000-0000-0000-000000000002/photo.jpg','https://example.com/photo.jpg',`${pharmacy}/../photo.jpg`,`${pharmacy}/%2e%2e/photo.jpg`,`${pharmacy}/`])('rejects invalid or cross-tenant image: %s', async image_url => {
    expect(await runImport([row({image_url})])).toMatchObject({status:'failed',successful_count:0,failed_count:1})
  })
  it.each([{branch_code:'OTHER'},{branch_code:'CLOSED'},{branch_code:''},{batch_number:''},{expiry_date:''},{expiry_date:'invalid'},{expiry_date:'2020-01-01'},{cost_per_unit:-1},{quantity:-1},{quantity:'1.5'}])('rejects invalid opening stock %j', async extra => {
    const r = row(extra)
    expect(await runImport([r])).toMatchObject({status:'failed',successful_count:0})
    expect((await sql`select count(*)::int as n from products where sku=${r.sku}`)[0]?.n).toBe(0)
  })
  it.each([0,'',null])('creates no batch for zero/blank quantity %s', async quantity => {
    const r = row({quantity,branch_code:'',batch_number:'',expiry_date:''})
    const result = await save(r)
    expect((await sql`select count(*)::int as n from inventory_batches where product_id=${result[0]?.id}`)[0]?.n).toBe(0)
    expect((await sql`select count(*)::int as n from stock_movements where product_id=${result[0]?.id}`)[0]?.n).toBe(0)
  })
  it('preserves images on edits and allows legacy image-less products', async () => {
    const r = row({quantity:0})
    const saved = await save(r)
    await save({...r,image_url:'',name:'Edited'},saved[0]?.id)
    expect((await sql`select image_url from products where id=${saved[0]?.id}`)[0]?.image_url).toBe(r.image_url)
    const legacy = await sql`insert into products(pharmacy_id,name,sku,selling_price) values(${pharmacy},'Legacy','LEGACY',100) returning id`
    await save(row({quantity:0,image_url:null,sku:'LEGACY'}),legacy[0]?.id)
    expect((await sql`select image_url from products where id=${legacy[0]?.id}`)[0]?.image_url).toBeNull()
  })
  it('rolls back earlier products, batches, movements and audit rows on a later row failure', async () => {
    const r = row()
    const before = (await sql`select count(*)::int as n from audit_logs`)[0]?.n
    const result = await runImport([r,row({image_url:null})])
    expect(result).toMatchObject({status:'failed',successful_count:0,failed_count:2})
    expect(result?.error).toContain('Row 2:')
    expect((await sql`select count(*)::int as n from products where sku=${r.sku}`)[0]?.n).toBe(0)
    expect((await sql`select count(*)::int as n from audit_logs`)[0]?.n).toBe(before)
    expect((await sql`select count(*)::int as n from inventory_batches b left join products p on p.id=b.product_id where p.id is null`)[0]?.n).toBe(0)
  })
  it('keeps fingerprint protection including failed attempts', async () => {
    const fingerprint = crypto.randomUUID()
    await runImport([row({image_url:null})],fingerprint)
    await expect(runImport([row()],fingerprint)).rejects.toThrow(/already processed/)
  })
  it('keeps unauthorized users and tenants out and does not grant direct writes', async () => {
    await expect(asUser('00000000-0000-0000-0000-000000000099',tx => tx`select public.save_business_entry(${pharmacy},'products',${JSON.stringify(row())}::jsonb,NULL)`)).rejects.toThrow(/not permitted/)
    await expect(asUser(owner,tx => tx`select public.save_business_entry('00000000-0000-0000-0000-000000000002','products',${JSON.stringify(row())}::jsonb,NULL)`)).rejects.toThrow(/not permitted/)
    expect((await sql`select has_function_privilege('anon','public.save_business_entry(uuid,text,jsonb,uuid)','EXECUTE') as allowed,has_table_privilege('authenticated','products','INSERT') as writes`)[0]).toMatchObject({allowed:false,writes:false})
  })
})