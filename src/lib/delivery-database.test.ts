import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Explicit opt-in: connects ONLY to a disposable database on a local socket.
const socket = process.env['DELIVERY_TEST_SOCKET']
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
    return { sale, job: String(rows[0]?.['id']) }
  }
  const advance = (job: string, status: string, signature = '', name = '') =>
    asUser(11, `select public.advance_delivery_job('${job}','${status}',NULL,NULL,NULL,'${signature}','${name}')`)
  beforeAll(async () => {
    await sql.unsafe(readFileSync(resolve('supabase/tests/delivery-fixture.sql'),'utf8'))
    historicalJob = (await sql`select to_jsonb(j)-ARRAY['pickup_address','updated_at'] as row from public.delivery_jobs j where id=${id(99)}`)[0]?.['row']
    historicalEvent = (await sql`select to_jsonb(e) as row from public.delivery_job_events e where job_id=${id(99)}`)[0]?.['row']
    for (const file of readdirSync('supabase/migrations').filter(f => f.startsWith('202611171040') || f.startsWith('20261117104518'))) {
      await sql.unsafe(readFileSync(resolve('supabase/migrations', file), 'utf8'))
    }
    for (const file of readdirSync('supabase/migrations').filter(f => f.startsWith('20261117112402'))) {
      await sql.unsafe(readFileSync(resolve('supabase/migrations', file), 'utf8'))
    }
  }, 30000)
  afterAll(async () => { await sql.end() })
  it('concurrent cashier dispatch returns one in_process delivery and one creation event', async () => {
    const sale = crypto.randomUUID()
    await sql`insert into public.sales(id,pharmacy_id) values(${sale},${id(1)})`
    const dispatch = () => asUser(17, `select public.create_sale_delivery('${sale}','Destination','','','',-6.8,39.2,-6.9,39.3,'Counter') as id`)
    const results = await Promise.all([dispatch(),dispatch(),dispatch()])
    expect(new Set(results.map(r=>r[0]?.['id'])).size).toBe(1)
    const job = results[0]?.[0]?.['id']
    expect((await sql`select status,pickup_lat,pickup_address,dropoff_lng from public.delivery_jobs where id=${job}`)[0]).toMatchObject({status:'in_process',pickup_lat:null,pickup_address:'Pickup street, Test city',dropoff_lng:39.3})
    expect(Number((await sql`select count(*) from public.delivery_job_events where job_id=${job} and action='created'`)[0]?.['count'])).toBe(1)
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
    expect([id(11),id(12)]).toContain(row?.['rider_id'])
    expect(row?.['status']).toBe('in_process'); expect(row?.['accepted_at']).not.toBeNull()
  })
  it('rejects owner, manager, inactive rider, other-tenant rider, administrator preview and cashier acceptance', async () => {
    const {job}=await newJob()
    for(const uid of [10,13,14,15,16,17]) await expect(asUser(uid,`select public.accept_delivery_offer('${job}')`)).rejects.toThrow(/Only an active delivery rider/)
    await asUser(11,`select public.accept_delivery_offer('${job}')`)
    await expect(asUser(10,`select public.advance_delivery_job('${job}','pickup',NULL,NULL,NULL,NULL,NULL)`)).rejects.toThrow(/assigned active rider/)
  })
  it('rejects unauthorized notes on an unassigned delivery', async () => {
    const {job}=await newJob()
    await expect(asUser(15,`select public.add_delivery_note('${job}','Unauthorized',NULL,NULL)`)).rejects.toThrow(/cannot add delivery notes/)
  })
  it('rejects skipped stages and distinguishes pickup arrival from collection', async () => {
    const {job}=await newJob(); await asUser(11,`select public.accept_delivery_offer('${job}')`)
    await expect(advance(job,'arrived')).rejects.toThrow(/exact next stage is pickup/)
    await advance(job,'pickup')
    await expect(advance(job,'in_transit')).rejects.toThrow(/arrival at pickup/)
    await asUser(11,`select public.arrive_delivery_pickup('${job}',-6.8,39.2)`)
    const row=(await sql`select status,pickup_arrived_at,collected_at from public.delivery_jobs where id=${job}`)[0]
    expect(row?.['status']).toBe('pickup'); expect(row?.['pickup_arrived_at']).not.toBeNull(); expect(row?.['collected_at']).toBeNull()
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
    const job=(await sql`select to_jsonb(j)-ARRAY['pickup_branch_id','pickup_address','updated_at','pickup_lat','pickup_lng','assignment_state','accepted_at','pickup_started_at','pickup_arrived_at','collected_at','destination_arrived_at','cancelled_at','failed_at','returned_at','exception_reason'] as row from public.delivery_jobs j where id=${id(99)}`)[0]?.['row']
    const event=(await sql`select to_jsonb(e)-ARRAY['action','previous_status','new_status','actor_role','previous_rider_id'] as row from public.delivery_job_events e where job_id=${id(99)}`)[0]?.['row']
    expect(job).toEqual(historicalJob); expect(event).toEqual(historicalEvent)
    await expect(sql`update public.delivery_job_events set note='Changed' where job_id=${id(99)}`).rejects.toThrow(/append-only/)
    const {job:newId}=await newJob()
    const pub=(await sql`select public.get_public_delivery_tracking(${newId}) as row`)[0]?.['row']
    for(const key of ['recipient_name','recipient_phone','note','signature','signed_name','actor_id','rider_id']) expect(pub).not.toHaveProperty(key)
    expect((await sql`select has_table_privilege('anon','public.delivery_jobs','SELECT') as allowed`)[0]?.['allowed']).toBe(false)
    expect(Number((await sql`select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in ('delivery_jobs','delivery_job_events')`)[0]?.['count'])).toBe(2)
    expect(Number((await sql`select count(*) from public.notifications where title like 'Delivery %'`)[0]?.['count'])).toBeGreaterThan(0)
  })
  it('POS saves the actual sale branch and ignores stale caller pickup snapshots', async () => {
    await sql`insert into public.branches(id,pharmacy_id,address,is_main) values(${id(201)},${id(1)},'Main counter',true),(${id(202)},${id(1)},'Sale counter',false)`
    const sale=crypto.randomUUID()
    await sql`insert into public.sales(id,pharmacy_id,branch_id) values(${sale},${id(1)},${id(202)})`
    const job=(await asUser(17,`select public.create_sale_delivery('${sale}','Destination','Receiver','255700000000','Note',-6,39,-7,40,'Stale') as id`))[0]?.['id']
    expect((await sql`select pickup_branch_id,pickup_address,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng from public.delivery_jobs where id=${job}`)[0]).toMatchObject({pickup_branch_id:id(202),pickup_address:'Sale counter',pickup_lat:null,pickup_lng:null,dropoff_lat:-7,dropoff_lng:40})
  })
  it('manual jobs use the current main branch and the pharmacy fallback without a main branch', async () => {
    const create=()=>asUser(10,`select public.create_delivery_job('${id(1)}',NULL,'Destination','Receiver','Phone',-7,40,'Note') as id`)
    const first=(await create())[0]?.['id']
    expect((await sql`select pickup_branch_id,pickup_address from public.delivery_jobs where id=${first}`)[0]).toMatchObject({pickup_branch_id:id(201),pickup_address:'Main counter'})
    await sql`update public.branches set is_main=false where id=${id(201)}`
    await sql`update public.branches set is_main=true where id=${id(202)}`
    const second=(await create())[0]?.['id']
    expect((await sql`select pickup_branch_id,pickup_address from public.delivery_jobs where id=${second}`)[0]).toMatchObject({pickup_branch_id:id(202),pickup_address:'Sale counter'})
    await sql`update public.branches set is_main=false where id=${id(202)}`
    const third=(await create())[0]?.['id']
    expect((await sql`select pickup_branch_id,pickup_address from public.delivery_jobs where id=${third}`)[0]).toMatchObject({pickup_branch_id:null,pickup_address:'Pickup street, Test city'})
    await sql`update public.branches set is_main=true where id=${id(201)}`
  })
  it('backfills open jobs by sale/main branch, including failed/returning, while preserving terminal and customer data', async () => {
    const jobs:string[]=[]
    for(const status of ['pending','failed','returning','delivered','cancelled','returned']) {
      const sale=crypto.randomUUID()
      await sql`insert into public.sales(id,pharmacy_id,branch_id) values(${sale},${id(1)},${id(202)})`
      const job=(await asUser(17,`select public.create_sale_delivery('${sale}','Private destination','Receiver','Phone','Private note') as id`))[0]?.['id']
      await sql`update public.delivery_jobs set status=${status},pickup_address='Old snapshot',pickup_lat=-6,pickup_lng=39 where id=${job}`
      jobs.push(String(job))
    }
    const before=await sql`select id,to_jsonb(j) as row from public.delivery_jobs j where id=any(${jobs}::uuid[]) order by id`
    await sql.unsafe(readFileSync(resolve('supabase/tests/pickup-backfill.sql'),'utf8'))
    for(const previous of before) {
      const row=(await sql`select * from public.delivery_jobs where id=${previous['id']}`)[0]
      const original=previous['row']
      if(['delivered','cancelled','returned'].includes(original.status)) {
        const unchanged=(await sql`select to_jsonb(j) as row from public.delivery_jobs j where id=${previous['id']}`)[0]?.['row']
        expect(unchanged).toEqual(original)
      }
      else {
        expect(row).toMatchObject({pickup_branch_id:id(202),pickup_address:'Sale counter',pickup_lat:null,pickup_lng:null})
        for(const key of ['dropoff_address','recipient_name','recipient_phone','note','status','tracking_number']) expect(row?.[key]).toEqual(original[key])
      }
    }
    expect((await sql`select pickup_branch_id,pickup_address from public.delivery_jobs where id=${id(99)}`)[0]).toMatchObject({pickup_branch_id:id(201),pickup_address:'Main counter'})
  })
  it('branch changes refresh failed/returning jobs and public tracking, not terminal jobs', async () => {
    await sql`update public.branches set address='Current sale counter' where id=${id(202)}`
    const rows=await sql`select status,pickup_address,pickup_lat from public.delivery_jobs where pickup_branch_id=${id(202)}`
    for(const row of rows) expect(row['pickup_address']).toBe(['delivered','cancelled','returned'].includes(row['status'])?'Old snapshot':'Current sale counter')
    expect(rows.some(r=>r['status']==='failed')).toBe(true)
    expect(rows.some(r=>r['status']==='returning')).toBe(true)
    const job=(await sql`select id from public.delivery_jobs where status='failed' and pickup_branch_id=${id(202)}`)[0]?.['id']
    const pub=await sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE anon');return tx`select public.get_public_delivery_tracking(${job}) as row`})
    expect(pub[0]?.['row']).toMatchObject({pickup_address:'Current sale counter',pickup_lat:null,pickup_lng:null})
  })
  it('pharmacy changes refresh null/blank branch fallbacks but do not replace nonblank branch addresses', async () => {
    await sql`update public.branches set address=' ' where id=${id(201)}`
    await sql`update public.pharmacies set address='New pharmacy street',city='New city' where id=${id(1)}`
    const fallbacks=await sql`select pickup_address,pickup_lat,pickup_lng from public.delivery_jobs where pharmacy_id=${id(1)} and status not in ('delivered','cancelled','returned') and (pickup_branch_id is null or pickup_branch_id=${id(201)})`
    expect(fallbacks.length).toBeGreaterThan(0)
    for(const row of fallbacks) expect(row).toMatchObject({pickup_address:'New pharmacy street, New city',pickup_lat:null,pickup_lng:null})
    expect((await sql`select pickup_address from public.delivery_jobs where pickup_branch_id=${id(202)} and status='failed'`)[0]?.['pickup_address']).toBe('Current sale counter')
  })
  it('branch deletion clears only the reference and pickup triggers are private with fixed search paths', async () => {
    await sql`delete from public.branches where id=${id(201)}`
    expect((await sql`select pickup_branch_id,pickup_address from public.delivery_jobs where id=${id(99)}`)[0]).toMatchObject({pickup_branch_id:null,pickup_address:'New pharmacy street, New city'})
    const helper=(await sql`select prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated from pg_proc where proname='refresh_delivery_pickup_location'`)[0]
    expect(helper).toMatchObject({prosecdef:true,proconfig:['search_path=public'],anon:false,authenticated:false})
  })
})