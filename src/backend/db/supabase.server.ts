import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type SupabaseServerClient = SupabaseClient<Database>;

export function createSupabaseServerClient(): SupabaseServerClient {
  throw new Error("Supabase server client is not implemented yet.");
}
