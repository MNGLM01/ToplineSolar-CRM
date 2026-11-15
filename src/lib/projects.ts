import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export interface ProjectStatus { id: number; name: string; sort: number; color: string; is_completed: boolean; is_cancelled: boolean; active: boolean }
export interface Customer {
  id: string; customer_no: string; lead_id: string | null; name: string; father_name: string | null; phone: string; whatsapp: string | null;
  alt_phone: string | null; email: string | null; address: string | null; village: string | null; district: string | null; pincode: string | null;
  state: string; consumer_no: string | null; discom: string | null; sanctioned_load_kw: number | null; connection_phase: string | null;
  co_applicant_name: string | null; co_applicant_relation: string | null; partner_id: string | null; assigned_to: string | null; notes: string | null;
  created_at: string;
}
export interface Project {
  id: string; project_no: string; customer_id: string; lead_id: string | null; capacity_kw: number | null; system_type: string; customer_type: string;
  total_cost: number | null; finance_type: "Cash" | "Bank loan"; status_id: number; status_changed_at: string; assigned_to: string | null;
  installer_names: string | null; start_date: string | null; installed_on: string | null; completed_on: string | null;
  panel_brand: string | null; panel_wattage: number | null; panel_count: number | null; inverter_brand: string | null;
  inverter_capacity_kw: number | null; inverter_serial: string | null; panel_serials: string | null; structure_type: string | null;
  battery_details: string | null; locked: boolean; notes: string | null; created_at: string; updated_at: string; deleted_at: string | null;
}
export type ProjectRow = Project & { customer: Pick<Customer, "name" | "phone" | "village" | "district" | "customer_no">; milestones: { status: string }[] };
export interface Milestone { id: number; project_id: string; step: number; status: "pending" | "in_progress" | "done" | "not_needed"; done_on: string | null; note: string | null; updated_by: string | null; updated_at: string }
export interface ChecklistStage { id: number; name: string; sort: number; active: boolean }
export interface ChecklistItem { id: number; stage_id: number; text: string; required: boolean; sort: number; active: boolean }
export interface ChecklistTick { project_id: string; item_id: number; done: boolean; done_by: string | null; done_at: string | null; note: string | null }
export interface DocType { id: number; name: string; category: string; required: boolean; loan_only: boolean; sort: number; active: boolean }
export interface Doc {
  id: string; project_id: string | null; lead_id: string | null; doc_type_id: number; file_path: string; file_name: string; mime_type: string | null;
  size_bytes: number | null; version: number; status: "pending" | "verified" | "rejected"; reject_reason: string | null;
  uploaded_by: string | null; verified_by: string | null; verified_at: string | null; created_at: string; deleted_at: string | null;
}
export interface Subsidy { project_id: string; stage: string; application_no: string | null; expected_amount: number | null; applied_on: string | null; approved_on: string | null; received_amount: number | null; received_on: string | null; notes: string | null }
export interface BankLoan { project_id: string; bank_name: string | null; status: string; amount_requested: number | null; amount_approved: number | null; interest_rate: number | null; tenure_months: number | null; emi: number | null; loan_account_no: string | null; applied_on: string | null; approved_on: string | null; disbursed_on: string | null; notes: string | null }
export interface SiteSurvey {
  id: string; lead_id: string; surveyed_at: string | null; surveyor_id: string | null; latitude: number | null; longitude: number | null;
  roof_type: string | null; roof_condition: string | null; roof_floor: number | null; roof_length_ft: number | null; roof_width_ft: number | null;
  usable_area_sqft: number | null; roof_direction: string | null; shadow_notes: string | null; sanctioned_load_kw: number | null;
  connection_phase: string | null; discom: string | null; consumer_no: string | null; meter_location: string | null; inverter_location: string | null;
  earthing_location: string | null; roof_to_meter_m: number | null; structure_type: string | null; recommended_kw: number | null; remarks: string | null;
  created_at: string; updated_at: string;
}

/** PM Surya Ghar national portal steps, in order. */
export const MILESTONES = [
  { step: 1, name: "Registration", hint: "Consumer registered on pmsuryaghar.gov.in" },
  { step: 2, name: "Application", hint: "Rooftop solar application submitted" },
  { step: 3, name: "Feasibility", hint: "Technical feasibility approved by DISCOM" },
  { step: 4, name: "Vendor selection", hint: "Topline Solar selected as vendor on the portal" },
  { step: 5, name: "Agreement", hint: "Vendor agreement signed with the customer" },
  { step: 6, name: "Installation", hint: "System installed and details uploaded" },
  { step: 7, name: "Inspection", hint: "DISCOM inspection done, net meter installed" },
  { step: 8, name: "Commissioning", hint: "Commissioning certificate issued" },
  { step: 9, name: "Subsidy request", hint: "Bank details submitted, subsidy requested" },
  { step: 10, name: "Subsidy received", hint: "Subsidy credited to the customer's account" },
] as const;

export const SUBSIDY_STAGES = ["Not applied", "Applied", "Under review", "Approved", "Disbursed", "Rejected"];
export const LOAN_STATUSES = ["Not applied", "Applied", "Approved", "Disbursed", "Rejected"];
export const SYSTEM_TYPES = ["On-grid", "Hybrid", "Off-grid"];

const STALE = 5 * 60_000;
export const useProjectStatuses = () => useQuery({
  queryKey: ["project_statuses"], staleTime: STALE,
  queryFn: async () => { const { data, error } = await supabase.from("project_statuses").select("*").order("sort"); if (error) throw error; return data as ProjectStatus[]; },
});
export const useDocTypes = () => useQuery({
  queryKey: ["document_types"], staleTime: STALE,
  queryFn: async () => { const { data, error } = await supabase.from("document_types").select("*").order("sort"); if (error) throw error; return data as DocType[]; },
});
export const useChecklistTemplate = () => useQuery({
  queryKey: ["checklist_template"], staleTime: STALE,
  queryFn: async () => {
    const [s, i] = await Promise.all([
      supabase.from("checklist_stages").select("*").order("sort"),
      supabase.from("checklist_items").select("*").order("sort"),
    ]);
    if (s.error) throw s.error; if (i.error) throw i.error;
    return { stages: s.data as ChecklistStage[], items: i.data as ChecklistItem[] };
  },
});

export type ProjectView = "current" | "finished" | "paused";
export interface ProjectFilters { view: ProjectView; q?: string; status?: string; district?: string; assigned?: string; stuckDays?: string }

export function useProjects(f: ProjectFilters, statuses: ProjectStatus[] | undefined) {
  return useQuery({
    queryKey: ["projects", f], enabled: !!statuses, placeholderData: (p) => p,
    queryFn: async () => {
      const ids = (pred: (s: ProjectStatus) => boolean) => statuses!.filter(pred).map((s) => s.id);
      const inner = f.district || f.q ? "!inner" : "";
      let q = supabase.from("projects")
        .select(`*, customer:customers${inner}(name, phone, village, district, customer_no), milestones:project_milestones(status)`)
        .is("deleted_at", null);
      if (f.status) q = q.eq("status_id", Number(f.status));
      else if (f.view === "finished") q = q.in("status_id", ids((s) => s.is_completed));
      else if (f.view === "paused") q = q.in("status_id", ids((s) => s.is_cancelled || s.name === "On Hold"));
      else q = q.in("status_id", ids((s) => !s.is_completed && !s.is_cancelled && s.name !== "On Hold"));
      if (f.district) q = q.eq("customer.district", f.district);
      if (f.assigned) q = q.eq("assigned_to", f.assigned);
      if (f.stuckDays) q = q.lt("status_changed_at", new Date(Date.now() - Number(f.stuckDays) * 86_400_000).toISOString());
      const s = f.q?.trim().replace(/[,()]/g, " ");
      if (s) {
        const digits = s.replace(/\D/g, "");
        q = digits.length >= 4
          ? q.or(`phone.ilike.%${digits}%,customer_no.ilike.%${digits}%`, { referencedTable: "customer" })
          : q.or(`name.ilike.%${s}%,village.ilike.%${s}%`, { referencedTable: "customer" });
      }
      const order = f.view === "finished" ? "completed_on" : "status_changed_at";
      const { data, error } = await q.order(order, { ascending: f.view !== "finished", nullsFirst: false }).limit(500);
      if (error) throw error;
      return data as ProjectRow[];
    },
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ["project", id], enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*, customer:customers(*)").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as (Project & { customer: Customer }) | null;
    },
  });
}

export const daysSince = (s: string) => Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000));
export const milestoneProgress = (ms: { status: string }[]) => {
  const counted = ms.filter((m) => m.status !== "not_needed");
  return { done: counted.filter((m) => m.status === "done").length, total: counted.length || 10 };
};
