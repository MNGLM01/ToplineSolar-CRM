import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Followup } from "./types";

export type FollowupRow = Followup & { leads: { id: string; name: string; phone: string; whatsapp: string | null; village: string | null; stage_id: number } | null };

export function useFollowups(tab: "overdue" | "today" | "upcoming" | "done", ownerId?: string) {
  return useQuery({
    queryKey: ["followups", tab, ownerId ?? "all"],
    queryFn: async () => {
      const now = new Date(); const eod = new Date(); eod.setHours(23, 59, 59, 999);
      let q = supabase.from("followups").select("*, leads!inner(id, name, phone, whatsapp, village, stage_id, deleted_at)").is("leads.deleted_at", null);
      if (ownerId) q = q.eq("owner_id", ownerId);
      if (tab === "done") q = q.eq("status", "done").order("completed_at", { ascending: false }).limit(100);
      else {
        q = q.eq("status", "pending");
        if (tab === "overdue") q = q.lt("due_at", now.toISOString());
        if (tab === "today") q = q.gte("due_at", now.toISOString()).lte("due_at", eod.toISOString());
        if (tab === "upcoming") q = q.gt("due_at", eod.toISOString());
        q = q.order("due_at").limit(200);
      }
      const { data, error } = await q; if (error) throw error;
      return data as unknown as FollowupRow[];
    },
  });
}

export function useFollowupCounts(ownerId?: string) {
  return useQuery({
    queryKey: ["followups", "counts", ownerId ?? "all"],
    queryFn: async () => {
      const now = new Date().toISOString(); const eod = new Date(); eod.setHours(23, 59, 59, 999);
      const base = () => { let q = supabase.from("followups").select("id, leads!inner(deleted_at)", { count: "exact", head: true }).eq("status", "pending").is("leads.deleted_at", null); if (ownerId) q = q.eq("owner_id", ownerId); return q; };
      const [o, t, u] = await Promise.all([base().lt("due_at", now), base().gte("due_at", now).lte("due_at", eod.toISOString()), base().gt("due_at", eod.toISOString())]);
      return { overdue: o.count ?? 0, today: t.count ?? 0, upcoming: u.count ?? 0 };
    },
  });
}
