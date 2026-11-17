import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Explicit opt-in: connects ONLY to a disposable database on a local socket.
const socket = process.env.DELIVERY_TEST_SOCKET
const suite = socket?.startsWith('/tmp/') ? describe : describe.skip
suite('delivery PostgreSQL workflow (isolated database)', () => {
  const sql = postgres({ host: socket, port: 55432, username: 'lovable', database: 'postgres', max: 8 })
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  let historicalJob: unknown
  let historicalEvent: unknown
  const asUser = async (uid: number, query: string) => sql.begin(async tx => {
    await tx`select set_config('request.jwt.claim.sub',${id(uid)},true)`
    await tx.unsafe('SET LOCAL ROLE authenticated')
    return tx.unsafe(query)
  })
  const newJob = async () => {
    const sale = crypto.randomUUID()
    await sql`insert into public.sales(id,pharmacy_id) values(${sale},${id(1)})`
    const rows = await asUser(17, `select public.create_sale_delivery('${sale}','Destination','Receiver','255700000000','') as id`)
    return { sale, job: String(rows[0].id) }
  }
  const advance = (job: string, status: string, signature = '', name = '') =>
    asUser(11, `select public.advance_delivery_job('${job}','${status}',NULL,NULL,NULL,'${signature}','${name}')`)
  beforeAll(async () => {
    await sql.unsafe(readFileSync(resolve('supabase/tests/delivery-fixture.sql'),'utf8'))
    historicalJob = (await sql`select to_jsonb(j) as row from public.delivery_jobs j where id=${id(99)}`)[0].row
    historicalEvent = (await sql`select to_jsonb(e) as row from public.delivery_job_events e where job_id=${id(99)}`)[0].row
    for (const file of readdirSync('supabase/migrations').filter(f => f.startsWith('202611171040'))) {
      await sql.unsafe(readFileSync(resolve('supabase/migrations', file), 'utf8'))
    }
  }, 30000)
  afterAll(async () => { await sql.end() })
  it('concurrent cashier dispatch returns one in_process delivery and one creation event', async () => {
    const sale = crypto.randomUUID()
    await sql`insert into public.sales(id,pharmacy_id) values(${sale},${id(1)})`
    const dispatch = () => asUser(17, `select public.create_sale_delivery('${sale}','Destination','','','',-6.8,39.2,-6.9,39.3,'Counter') as id`)
    const results = await Promise.all([dispatch(),dispatch(),dispatch()])
    expect(new Set(results.map(r=>r[0].id)).size).toBe(1)
    const job = results[0][0].id
    expect((await sql`select status,pickup_lat,dropoff_lng from public.delivery_jobs where id=${job}`)[0]).toMatchObject({status:'in_process',pickup_lat:-6.8,dropoff_lng:39.3})
    expect(Number((await sql`select count(*) from public.delivery_job_events where job_id=${job} and action='created'`)[0].count)).toBe(1)
    await expect(sql.begin(async tx => {
      await tx`select set_config('request.jwt.claim.sub',${id(17)},true)`
      await tx`insert into public.delivery_jobs(tracking_number,pharmacy_id,sale_id,status,dropoff_address) values('DUPLICATE',${id(1)},${sale},'in_process','Destination')`
    })).rejects.toThrow(/unique/)
  })
  it('concurrent acceptance assigns exactly one rider without advancing shipment', async () => {
    const {job} = await newJob()
    const results=await Promise.allSettled([asUser(11,`select public.accept_delivery_offer('${job}')`),asUser(12,`select public.accept_delivery_offer('${job}')`)])
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    const rejected=results.find(r=>r.status==='rejected')
    expect(rejected?.status==='rejected' ? String(rejected.reason) : '').toMatch(/already accepted/)
    const row=(await sql`select * from public.delivery_jobs where id=${job}`)[0]
    expect([id(11),id(12)]).toContain(row.rider_id)
    expect(row.status).toBe('in_process'); expect(row.accepted_at).not.toBeNull()
  })
  it('rejects owner, manager, inactive rider, other-tenant rider, administrator preview and cashier acceptance', async () => {
    const {job}=await newJob()
    for(const uid of [10,13,14,15,16,17]) await expect(asUser(uid,`select public.accept_delivery_offer('${job}')`)).rejects.toThrow(/Only an active delivery rider/)
    await asUser(11,`select public.accept_delivery_offer('${job}')`)
    await expect(asUser(10,`select public.advance_delivery_job('${job}','pickup',NULL,NULL,NULL,NULL,NULL)`)).rejects.toThrow(/assigned active rider/)
  })
  it('rejects skipped stages and distinguishes pickup arrival from collection', async () => {
    const {job}=await newJob(); await asUser(11,`select public.accept_delivery_offer('${job}')`)
    await expect(advance(job,'arrived')).rejects.toThrow(/exact next stage is pickup/)
    await advance(job,'pickup')
    await expect(advance(job,'in_transit')).rejects.toThrow(/arrival at pickup/)
    await asUser(11,`select public.arrive_delivery_pickup('${job}',-6.8,39.2)`)
    const row=(await sql`select status,pickup_arrived_at,collected_at from public.delivery_jobs where id=${job}`)[0]
    expect(row.status).toBe('pickup'); expect(row.pickup_arrived_at).not.toBeNull(); expect(row.collected_at).toBeNull()
    await advance(job,'in_transit'); await advance(job,'arrived')
  })
  it('requires recipient name and PNG proof; freezes GPS after completion', async () => {
    const {job}=await newJob(); await asUser(11,`select public.accept_delivery_offer('${job}')`)
    await advance(job,'pickup'); await asUser(11,`select public.arrive_delivery_pickup('${job}')`); await advance(job,'in_transit'); await advance(job,'arrived')
    await expect(advance(job,'delivered','','Receiver')).rejects.toThrow(/PNG signature/)
    await expect(advance(job,'delivered','data:image/png;base64,aGVsbG8=','Receiver')).rejects.toThrow(/PNG signature/)
    const proof='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII='
    await expect(advance(job,'delivered',proof,'')).rejects.toThrow(/give a name/)
    await advance(job,'delivered',proof,'Receiver')
    expect((await sql`select status,signed_name from public.delivery_jobs where id=${job}`)[0]).toMatchObject({status:'delivered',signed_name:'Receiver'})
    await expect(asUser(11,`select public.ping_delivery_location('${job}',-6,39)`)).rejects.toThrow(/GPS rejected/)
  })
  it('GPS rejects wrong rider, missing job, invalid coordinates, inactive membership and cancellation', async () => {
    const {job}=await newJob(); await asUser(11,`select public.accept_delivery_offer('${job}')`)
    await expect(asUser(12,`select public.ping_delivery_location('${job}',-6,39)`)).rejects.toThrow(/GPS rejected/)
    await expect(asUser(11,`select public.ping_delivery_location('${id(98)}',-6,39)`)).rejects.toThrow(/GPS rejected/)
    await expect(asUser(11,`select public.ping_delivery_location('${job}',91,39)`)).rejects.toThrow(/valid latitude/)
    await asUser(11,`select public.ping_delivery_location('${job}',-6,39)`)
    expect((await sql`select rider_lat,rider_lng from public.delivery_jobs where id=${job}`)[0]).toMatchObject({rider_lat:-6,rider_lng:39})
    await sql`update public.pharmacy_memberships set is_active=false where user_id=${id(11)}`
    await expect(asUser(11,`select public.ping_delivery_location('${job}',-6,39)`)).rejects.toThrow(/GPS rejected/)
    await sql`update public.pharmacy_memberships set is_active=true where user_id=${id(11)}`
    await asUser(10,`select public.delivery_exception('${job}','cancel','Customer cancelled')`)
    await expect(asUser(11,`select public.ping_delivery_location('${job}',-6,39)`)).rejects.toThrow(/GPS rejected/)
  })
  it('failed attempt never becomes delivered; return is a separate audited sequence', async () => {
    const {job}=await newJob(); await asUser(11,`select public.accept_delivery_offer('${job}')`)
    await asUser(11,`select public.delivery_exception('${job}','failed','Customer unavailable')`)
    await expect(advance(job,'delivered')).rejects.toThrow(/exact next stage is none/)
    await asUser(11,`select public.delivery_exception('${job}','start_return','Returning parcel')`)
    await asUser(11,`select public.delivery_exception('${job}','returned','Returned to counter')`)
    expect((await sql`select status,delivered_at,returned_at from public.delivery_jobs where id=${job}`)[0]).toMatchObject({status:'returned',delivered_at:null})
  })
  it('preserves legacy columns and history; new history is append-only and public tracking excludes private fields', async () => {
    const job=(await sql`select to_jsonb(j)-ARRAY['pickup_lat','pickup_lng','assignment_state','accepted_at','pickup_started_at','pickup_arrived_at','collected_at','destination_arrived_at','cancelled_at','failed_at','returned_at','exception_reason'] as row from public.delivery_jobs j where id=${id(99)}`)[0].row
    const event=(await sql`select to_jsonb(e)-ARRAY['action','previous_status','new_status','actor_role','previous_rider_id'] as row from public.delivery_job_events e where job_id=${id(99)}`)[0].row
    expect(job).toEqual(historicalJob); expect(event).toEqual(historicalEvent)
    await expect(sql`update public.delivery_job_events set note='Changed' where job_id=${id(99)}`).rejects.toThrow(/append-only/)
    const {job:newId}=await newJob()
    const pub=(await sql`select public.get_public_delivery_tracking(${newId}) as row`)[0].row
    for(const key of ['recipient_name','recipient_phone','note','signature','signed_name','actor_id','rider_id']) expect(pub).not.toHaveProperty(key)
    expect((await sql`select has_table_privilege('anon','public.delivery_jobs','SELECT') as allowed`)[0].allowed).toBe(false)
    expect(Number((await sql`select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in ('delivery_jobs','delivery_job_events')`)[0].count)).toBe(2)
    expect(Number((await sql`select count(*) from public.notifications where title like 'Delivery %'`)[0].count)).toBeGreaterThan(0)
  })
})