import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Profile, Role } from "./types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(s: Session | null) {
    if (!s) { setProfile(null); return; }
    const { data } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session); await loadProfile(data.session); setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      // defer the query so it doesn't run inside the auth callback
      setTimeout(() => loadProfile(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{
      session, profile, loading,
      refresh: () => loadProfile(session),
      signOut: async () => { await supabase.auth.signOut(); setProfile(null); },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

/** Permission helpers. Server-side RLS enforces the same rules; these only shape the UI. */
export function can(role: Role | undefined) {
  return {
    seeAllLeads: role === "owner" || role === "office_manager",
    assignLeads: role === "owner" || role === "office_manager",
    deleteRecords: role === "owner",
    manageUsers: role === "owner",
    manageSettings: role === "owner",
    managePartners: role === "owner" || role === "office_manager",
    importLeads: role === "owner" || role === "office_manager",
    seeMoneyTotals: role === "owner", // revenue, profit, margins: owner only
    isPartner: role === "partner",
  };
}
