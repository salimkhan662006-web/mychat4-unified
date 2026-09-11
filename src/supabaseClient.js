import { createClient } from "@supabase/supabase-js";

// These are safe to expose in frontend code — the publishable key is
// designed for client-side use and only allows what your Row Level
// Security policies permit. Never put the secret/service_role key here.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);