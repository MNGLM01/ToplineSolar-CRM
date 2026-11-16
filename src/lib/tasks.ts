import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { today } from "./money";

export interface Task {
  id: string; title: string; note: string | null; due_on: string | null; priority: "normal" | "high";
  assigned_to: string; lead_id: string | null; project_id: string | null; status: "open" | "done";
  done_at: string | null; done_by: string | null; created_by: string | null; created_at: string; deleted_at: string | null;
}
export type TaskRow = Task & {
  lead: { id: string; name: string; lead_no: string } | null;
  project: { id: string; project_no: string; customer: { name: string } | null } | null;
};
const SELECT = "*, lead:leads(id, name, lead_no), project:projects(id, project_no, customer:customers(name))";

/** scope: "mine" = assigned to me; "all" = everyone (owner / office manager); "done" = finished, newest first */
export function useTasks(scope: "mine" | "all" | "done", userId?: string, who?: string) {
  return useQuery({
    queryKey: ["tasks", scope, userId, who ?? ""],
    enabled: !!userId,
    queryFn: async () => {
      let q = supabase.from("tasks").select(SELECT).is("deleted_at", null);
      if (scope === "mine") q = q.eq("assigned_to", userId!);
      if (scope === "all" && who) q = q.eq("assigned_to", who);
      if (scope === "done") q = q.eq("status", "done").order("done_at", { ascending: false }).limit(100);
      else q = q.eq("status", "open").order("due_on", { ascending: true, nullsFirst: false }).order("created_at").limit(300);
      const { data, error } = await q; if (error) throw error;
      return data as unknown as TaskRow[];
    },
  });
}

export function useTasksFor(link: { leadId?: string; projectId?: string }) {
  const id = link.leadId ?? link.projectId;
  return useQuery({
    queryKey: ["tasks", "for", id],
    enabled: !!id,
    queryFn: async () => {
      let q = supabase.from("tasks").select(SELECT).is("deleted_at", null);
      q = link.leadId ? q.eq("lead_id", link.leadId) : q.eq("project_id", link.projectId!);
      const { data, error } = await q.order("status", { ascending: false }).order("due_on", { ascending: true, nullsFirst: false }).limit(50);
      if (error) throw error;
      return data as unknown as TaskRow[];
    },
  });
}

export type DueBucket = "overdue" | "today" | "upcoming" | "someday";
export function dueBucket(t: Pick<Task, "due_on">): DueBucket {
  if (!t.due_on) return "someday";
  const d = today();
  return t.due_on < d ? "overdue" : t.due_on === d ? "today" : "upcoming";
}
export const BUCKET_LABEL: Record<DueBucket, string> = { overdue: "Overdue", today: "Today", upcoming: "Coming up", someday: "No date" };

export function addDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
