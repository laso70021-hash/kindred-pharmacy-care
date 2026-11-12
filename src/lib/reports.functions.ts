import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { reportPreferenceInput } from './management';
export const getReportSettings=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({pharmacyId:z.string().uuid()}).parse(v)).handler(async({data,context})=>{
 const {data:admin}=await context.supabase.rpc('is_platform_admin');const {data:owner}=await context.supabase.rpc('is_pharmacy_owner',{_pharmacy_id:data.pharmacyId});if(!admin&&!owner)throw new Error('Only owners and administrators can configure reports.');
 const [{data:prefs,error},{data:staff},{data:business}]=await Promise.all([context.supabase.from('ai_report_preferences').select('*').eq('pharmacy_id',data.pharmacyId),context.supabase.from('pharmacy_memberships').select('user_id,role,branch_id,branch_ids,is_active').eq('pharmacy_id',data.pharmacyId),context.supabase.from('pharmacies').select('owner_id').eq('id',data.pharmacyId).single()]);if(error)throw error;
 const ids=[...new Set([business?.owner_id,...(staff??[]).filter(s=>s.is_active&&['manager','accountant'].includes(s.role)&&!s.branch_id&&!s.branch_ids?.length).map(s=>s.user_id)].filter((s):s is string=>!!s))];
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const recipients=[] as {id:string;name:string;email:string}[];
 for(const id of ids){const {data:u}=await supabaseAdmin.auth.admin.getUserById(id);if(u.user?.email_confirmed_at&&u.user.email){const {data:profile}=await context.supabase.from('profiles').select('full_name').eq('id',id).maybeSingle();recipients.push({id,name:profile?.full_name||u.user.email,email:u.user.email});}}
 const prefIds=(prefs??[]).map(p=>p.id);const history=prefIds.length?await context.supabase.from('ai_report_runs').select('id,status,error,period_key,created_at').in('preference_id',prefIds).order('created_at',{ascending:false}).limit(30):{data:[]};
 return {preferences:prefs??[],recipients,history:history.data??[]};
});
export const saveReportSettings=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>reportPreferenceInput.parse(v)).handler(async({data,context})=>{
 const {data:admin}=await context.supabase.rpc('is_platform_admin');const {data:owner}=await context.supabase.rpc('is_pharmacy_owner',{_pharmacy_id:data.pharmacyId});if(!admin&&!owner)throw new Error('Owner access required.');
 const {pharmacyId,...values}=data;
 const {error}=await context.supabase.from('ai_report_preferences').upsert({pharmacy_id:pharmacyId,...values,pause_reason:null},{onConflict:'pharmacy_id,frequency'});if(error)throw error;return {ok:true};
});