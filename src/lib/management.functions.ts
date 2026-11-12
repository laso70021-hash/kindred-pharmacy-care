import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { recordInput, safeRecordValues,guardAdminDeletion } from './management';

export const manageRecord=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>recordInput.parse(v)).handler(async({data,context})=>{
 const {data:admin}=await context.supabase.rpc('is_platform_admin');
 if((data.kind==='profiles'||data.kind==='pharmacies')&&!admin)throw new Error('Administrator access required.');
 if(data.kind==='profiles'&&data.action==='delete'){
  const {data:roles,error}=await context.supabase.from('user_roles').select('user_id').eq('role','super_admin');if(error)throw error;
  guardAdminDeletion(context.userId,data.id,(roles??[]).some(r=>r.user_id===data.id),new Set((roles??[]).map(r=>r.user_id)).size);
  // Only accounts without operational history can be permanently removed.
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  for(const [table,col] of [['pharmacies','owner_id'],['pharmacy_memberships','user_id'],['sales','cashier_id'],['audit_logs','user_id']] as const){
   const {count,error:e}=await supabaseAdmin.from(table).select('id',{count:'exact',head:true}).eq(col,data.id);if(e)throw e;if(count)throw new Error('This account has business or audit history. Remove workspace access instead of deleting it.');
  }
  const {error:e}=await supabaseAdmin.auth.admin.deleteUser(data.id);if(e)throw new Error('Account could not be deleted. It may have linked records.');
 }else{
  const query=context.supabase.from(data.kind);
  const result=data.action==='delete'?await query.delete().eq('id',data.id).select('id'):await query.update(data.action==='deactivate'?data.kind==='suppliers'?{is_active:false}:{}:safeRecordValues(data.kind,data.values)).eq('id',data.id).select('id');
  if(result.error){if(result.error.code==='23503')throw new Error('Linked records prevent deletion. Keep the history and deactivate this record instead.');throw new Error(result.error.message);}
  if(!result.data?.length)throw new Error('Record not found or permission denied.');
 }
 if(admin){await context.supabase.from('audit_logs').insert({user_id:context.userId,action:`record_${data.action}`,entity:data.kind,entity_id:data.id});}
 return {ok:true};
});

export const sendRecordEmail=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({kind:z.enum(['customers','suppliers','pharmacies','pharmacy_invites']),id:z.string().uuid(),invite:z.boolean().default(false)}).parse(v)).handler(async({data,context})=>{
 const {data:record,error}=await context.supabase.from(data.kind).select('*').eq('id',data.id).single();if(error||!record)throw new Error('Record not found or permission denied.');
 const {data:admin}=await context.supabase.rpc('is_platform_admin');
 const pid='pharmacy_id' in record?record.pharmacy_id:data.kind==='pharmacies'?record.id:null;
 if(!admin){if(!pid)throw new Error('Permission denied.');const {data:allowed}=await context.supabase.rpc('can_write_pharmacy',{_pharmacy_id:pid,_roles:data.kind==='customers'?['manager','cashier','pharmacist']:['manager','inventory_manager']});if(!allowed)throw new Error('Permission denied.');if(data.kind==='pharmacy_invites'){const {data:owner}=await context.supabase.rpc('is_pharmacy_owner',{_pharmacy_id:pid});if(!owner)throw new Error('Only the business owner can send team invitations.');}}
 const email=z.string().email().parse(record.email);
 const {sendAppEmail}=await import('./resend.server');
 const origin=process.env['APP_ORIGIN']||'https://swahivo.com';
 if(!data.invite&&data.kind!=='pharmacy_invites')return sendAppEmail(email,'Your details were added — Swahivo','Your contact details have been added to Swahivo. If you did not expect this, contact info@swahivo.com.',`record-confirm:${data.kind}:${data.id}`);
 if(data.kind==='pharmacy_invites'&&'status' in record&&record.status!=='pending')throw new Error('This invitation is no longer pending.');
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 // generateLink creates a confirmed-link invitation without relying on external SMTP.
 const generated=await supabaseAdmin.auth.admin.generateLink({type:'invite',email,options:{redirectTo:`${origin}/set-password`}});
 if(generated.error){
  if(!['email_exists','user_already_exists'].includes(generated.error.code??''))throw new Error('Could not generate the account invitation.');
  return sendAppEmail(email,'You are invited — Swahivo',`Sign in to Swahivo at ${origin}/auth to view your invitations. Your existing password has not changed.`,`existing-invite:${data.kind}:${data.id}`);
 }
 const invited=generated.data.user;if(!invited||!generated.data.properties.action_link)throw new Error('Could not generate the account invitation.');
 const {error:onboardError}=await supabaseAdmin.from('account_onboarding').upsert({user_id:invited.id,password_required:true});if(onboardError)throw onboardError;
 return sendAppEmail(email,'Confirm your invitation and set your password — Swahivo',`You have been invited to Swahivo. Verify your email and set your password: ${generated.data.properties.action_link}. This invitation does not grant workspace access until the team association is accepted.`,`new-invite:${data.kind}:${data.id}`);
});

export const completePasswordSetup=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({password:z.string().min(8).max(128)}).parse(v)).handler(async({data,context})=>{
 const {data:pending}=await context.supabase.from('account_onboarding').select('password_required').eq('user_id',context.userId).single();if(!pending?.password_required)throw new Error('No password setup is pending.');
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {error}=await supabaseAdmin.auth.admin.updateUserById(context.userId,{password:data.password});if(error)throw new Error('Password could not be updated.');
 const {error:e}=await supabaseAdmin.from('account_onboarding').update({password_required:false}).eq('user_id',context.userId);if(e)throw e;return {ok:true};
});