import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

const client = createClient(url, key);
async function run() {
  const t0 = Date.now();
  const res = await client.from("lms_kv").select("key").limit(1);
  console.log("Response:", res, "in", Date.now() - t0, "ms");
}
run();
