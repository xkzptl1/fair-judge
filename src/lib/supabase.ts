import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Server-side: SUPABASE_SERVICE_ROLE_KEY bypasses RLS — used for all
// trusted writes from the pipeline, evaluator, and API routes.
//
// Client-side (browser bundle): SUPABASE_SERVICE_ROLE_KEY is undefined
// because it has no NEXT_PUBLIC_ prefix, so it falls back to the anon
// key — correct, RLS policies apply to all client requests.
//
// Required env vars:
//   NEXT_PUBLIC_SUPABASE_URL       — always required
//   NEXT_PUBLIC_SUPABASE_ANON_KEY  — required (client + dev fallback)
//   SUPABASE_SERVICE_ROLE_KEY      — required in production
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);
