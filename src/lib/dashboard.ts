import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { periodRange } from "./money";

/** Dashboard periods asked for by the owner. */
export const DASH_PERIODS = [
  { value: "month", label: "This month" },
  { value: "3m", label: "Last 3 months" },
  { value: "fy", label: "This year (FY)" },
] as const;
export type DashPeriod = (typeof DASH_PERIODS)[number]["value"];

export const INSTALL_TARGET = 15; // installations a month

export interface DashLeads {
  new_leads: number; won: number; won_from_period: number; lost_from_period: number; open_now: number;
  by_stage: { id: number; name: string; color: string; is_won: boolean; is_lost: boolean; count: number }[];
  by_source: { name: string; count: number; won: number }[];
  by_district: { name: string; count: number }[];
  team: { id: string; name: string; role: string; leads: number; open: number; followups_done: number; overdue: number; won: number }[];
  unassigned: number; overdue_followups: number;
}
export interface DashProjects {
  current: number; current_kw: number; on_hold: number; booked: number; installed: number; installed_kw: number; completed: number;
  installed_this_month: number;
  by_status: { id: number; name: string; color: string; count: number }[];
  stuck: { id: string; project_no: string; customer_name: string; status: string; color: string; days: number }[];
  stuck_count: number; docs_pending: number;
  subsidy: { pending: number; not_applied: number; received: number };
  installs_by_month: { month: string; count: number }[];
}
export interface DashMoney {
  sales_booked: number; sales_booked_kw: number; collections: number; project_spend: number; office_expenses: number;
  commissions_paid: number; other_out: number; money_out: number; installed_value: number; installed_spend: number;
  pending_dues: number; subsidy_pending_amount: number; commissions_due: number;
  by_month: { month: string; in: number; out: number; booked: number }[];
}

const args = (period: DashPeriod, district: string) => {
  const [d_from, d_to] = periodRange(period);
  return { d_from, d_to, p_district: district || null };
};

// keepPreviousData: when a filter changes, the old figures stay on screen (dimmed) instead of flashing
export const useDashLeads = (period: DashPeriod, district: string) => useQuery({
  queryKey: ["dashboard", "leads", period, district], placeholderData: keepPreviousData,
  queryFn: async () => { const { data, error } = await supabase.rpc("dashboard_leads", args(period, district)); if (error) throw error; return data as DashLeads; },
});
export const useDashProjects = (period: DashPeriod, district: string) => useQuery({
  queryKey: ["dashboard", "projects", period, district], placeholderData: keepPreviousData,
  queryFn: async () => { const { data, error } = await supabase.rpc("dashboard_projects", args(period, district)); if (error) throw error; return data as DashProjects; },
});
export const useDashMoney = (period: DashPeriod, district: string, enabled: boolean) => useQuery({
  queryKey: ["dashboard", "money", period, district], placeholderData: keepPreviousData, enabled,
  queryFn: async () => { const { data, error } = await supabase.rpc("dashboard_money", args(period, district)); if (error) throw error; return data as DashMoney; },
});
export const useStorageUsed = (enabled: boolean) => useQuery({
  queryKey: ["dashboard", "storage"], enabled, staleTime: 10 * 60_000,
  queryFn: async () => {
    const { data, error } = await supabase.rpc("storage_used"); if (error) throw error;
    const r = (data as { files: number; bytes: number }[])[0];
    return { files: Number(r?.files ?? 0), bytes: Number(r?.bytes ?? 0) };
  },
});

export const FREE_STORAGE_BYTES = 1024 ** 3; // Supabase free plan: 1 GB of files

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part * 100) / whole) : 0);
export const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" });
export const fmtBytes = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
