import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig { url:string; anonKey:string; }
let clientInstance: SupabaseClient | null = null;
export function getStoredSupabaseConfig(): SupabaseConfig {
  return { url:String(import.meta.env.VITE_SUPABASE_URL||'').trim(), anonKey:String(import.meta.env.VITE_SUPABASE_ANON_KEY||'').trim() };
}
export function saveStoredSupabaseConfig(_config: SupabaseConfig): void { clientInstance=null; }
export function getSupabaseClient(): SupabaseClient | null {
  if(clientInstance) return clientInstance;
  const cfg=getStoredSupabaseConfig();
  if(!cfg.url||!cfg.anonKey||!cfg.url.startsWith('http')) return null;
  clientInstance=createClient(cfg.url,cfg.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  return clientInstance;
}
export function isSupabaseConfigured(){ const c=getStoredSupabaseConfig(); return Boolean(c.url&&c.anonKey&&c.url.startsWith('http')); }
export async function checkSupabaseConnection(){
  try {
    const r=await fetch('/api/admin/cloud-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'status'})});
    const d=await r.json();
    return {connected:Boolean(r.ok&&d.configured&&d.online),configured:Boolean(d?.configured),message:d.message||'',source:'server' as const};
  }
  catch(e:any){
    return {connected:false,configured:false,message:e?.message||'Không thể kết nối Supabase',source:'none' as const};
  }
}
export async function pushDataToSupabaseCloud(_payload:Record<string,any>){ return {success:false,message:'Không còn cơ chế snapshot/local sync; mọi mutation ghi trực tiếp vào Supabase.'}; }
