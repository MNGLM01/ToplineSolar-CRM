import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Staff log in with their mobile number; it maps to this internal email. */
export const mobileToEmail = (mobile: string) => `${mobile}@users.toplinesolar.app`;

export async function callManageUsers<T = { ok: boolean }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("manage-users", { body });
  if (error) {
    // try to read the JSON error message returned by the function
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try { const j = await ctx.json(); if (j?.error) throw new Error(j.error); } catch (e) { if (e instanceof Error && e.message) throw e; }
    }
    throw new Error(error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
