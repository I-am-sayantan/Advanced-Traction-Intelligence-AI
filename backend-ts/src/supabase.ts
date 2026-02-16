import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

export const sb: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseKey,
);
