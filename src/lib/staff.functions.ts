import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const input = z.object({
  pharmacyId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(72),
  phone: z.string().trim().max(30).optional().default(''),
  jobTitle: z.string().trim().max(80).optional().default(''),
  role: z.enum(['manager', 'pharmacist', 'cashier', 'accountant', 'inventory_manager', 'delivery_rider']),
  branchIds: z.array(z.string().uuid()).max(50).default([]),
});

export const createStaffAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => input.parse(v))
  .handler(async ({ data, context }) => {
    // Caller must be allowed to add employees before any account is created.
    const [{ data: owner }, { data: admin }, { data: mgr }] = await Promise.all([
      context.supabase.rpc('is_pharmacy_owner', { _pharmacy_id: data.pharmacyId }),
      context.supabase.rpc('is_platform_admin'),
      context.supabase.rpc('has_pharmacy_role', { _pharmacy_id: data.pharmacyId, _roles: ['manager'] }),
    ]);
    if (!owner && !admin && !mgr) throw new Error('Only the owner or a manager can add employees.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true, user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) {
      if (/already|registered|exists/i.test(error?.message ?? '')) throw new Error('This email already has an account. Use Invite staff for existing accounts.');
      throw new Error(error?.message ?? 'Account could not be created.');
    }
    const uid = created.user.id;
    await supabaseAdmin.from('profiles').upsert({ id: uid, email: data.email, full_name: data.fullName, phone: data.phone || null });
    const { error: mErr } = await context.supabase.rpc('add_employee_membership', {
      _pharmacy: data.pharmacyId, _user: uid, _role: data.role, _branch_ids: data.branchIds,
      _phone: data.phone, _job_title: data.jobTitle, _employment_status: 'active',
    });
    if (mErr) { await supabaseAdmin.auth.admin.deleteUser(uid); throw new Error(mErr.message); }
    return { ok: true, email: data.email };
  });
