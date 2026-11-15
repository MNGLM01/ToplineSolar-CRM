import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Lead } from "./types";

export interface LeadFilters {
  q?: string; stage?: string; assigned?: string; source?: string; district?: string; temp?: string;
  due?: "" | "overdue" | "today" | "none"; open?: boolean;
}
export const PAGE = 50;

export function useLeads(f: LeadFilters, page = 0, stageIdsOpen?: number[], pageSize = PAGE) {
  return useQuery({
    queryKey: ["leads", f, page, pageSize],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from("leads").select("*", { count: "exact" }).is("deleted_at", null);
      const s = f.q?.trim().replace(/[,()]/g, " ");
      if (s) {
        const digits = s.replace(/\D/g, "");
        q = digits.length >= 4
          ? q.or(`phone.ilike.%${digits}%,whatsapp.ilike.%${digits}%,alt_phone.ilike.%${digits}%,lead_no.ilike.%${digits}%`)
          : q.or(`name.ilike.%${s}%,village.ilike.%${s}%,lead_no.ilike.%${s}%`);
      }
      if (f.stage) q = q.eq("stage_id", Number(f.stage));
      else if (f.open && stageIdsOpen) q = q.in("stage_id", stageIdsOpen);
      if (f.assigned === "none") q = q.is("assigned_to", null); else if (f.assigned) q = q.eq("assigned_to", f.assigned);
      if (f.source) q = q.eq("source_id", Number(f.source));
      if (f.district) q = q.eq("district", f.district);
      if (f.temp) q = q.eq("temperature", f.temp);
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
      const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
      if (f.due === "overdue") q = q.lt("next_followup_at", new Date().toISOString());
      if (f.due === "today") q = q.gte("next_followup_at", startToday.toISOString()).lte("next_followup_at", endToday.toISOString());
      if (f.due === "none") q = q.is("next_followup_at", null);
      const { data, error, count } = await q.order("created_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      return { rows: data as Lead[], count: count ?? 0 };
    },
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ["lead", id], enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id!).maybeSingle();
      if (error) throw error; return data as Lead | null;
    },
  });
}
