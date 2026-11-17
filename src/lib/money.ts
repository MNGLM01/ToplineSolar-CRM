import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export type TxnKind = "customer_payment" | "loan_disbursal" | "other_in" | "labour" | "vendor" | "commission" | "office_expense" | "other_out";
export const PAY_MODES = ["Cash", "UPI", "Bank transfer", "Cheque"] as const;

/** Plain-word labels for each kind of money entry. */
export const KINDS: { kind: TxnKind; label: string; short: string; dir: "in" | "out"; needsProject?: boolean; projectHint?: boolean; needsPartner?: boolean; needsCategory?: boolean; paidTo?: string }[] = [
  { kind: "customer_payment", label: "Customer paid us", short: "Customer payment", dir: "in", needsProject: true },
  { kind: "loan_disbursal", label: "Loan money received", short: "Loan received", dir: "in", needsProject: true },
  { kind: "labour", label: "Paid technician / labour", short: "Labour", dir: "out", projectHint: true, paidTo: "Technician / labour name" },
  { kind: "vendor", label: "Paid vendor", short: "Vendor", dir: "out", projectHint: true, paidTo: "Vendor / shop name" },
  { kind: "commission", label: "Referral commission paid", short: "Commission", dir: "out", needsPartner: true, projectHint: true },
  { kind: "office_expense", label: "Office expense", short: "Office expense", dir: "out", needsCategory: true, paidTo: "Paid to (optional)" },
  { kind: "other_in", label: "Other money in", short: "Other in", dir: "in", projectHint: true, paidTo: "Received from" },
  { kind: "other_out", label: "Other money out", short: "Other out", dir: "out", projectHint: true, paidTo: "Paid to" },
];
export const kindInfo = (k: TxnKind) => KINDS.find((x) => x.kind === k)!;

export interface Txn {
  id: string; txn_no: string; kind: TxnKind; direction: "in" | "out"; amount: number; txn_date: string; mode: string;
  project_id: string | null; partner_id: string | null; category_id: number | null; paid_to: string | null; reference: string | null;
  note: string | null; receipt_path: string | null; created_by: string | null; created_at: string; deleted_at: string | null;
}
export type TxnRow = Txn & { project: { project_no: string; customer: { name: string } | null } | null; partner: { name: string } | null; category: { name: string } | null };
export interface ExpenseCategory { id: number; name: string; sort: number; active: boolean }
export interface ProjectMoney { total_cost: number | null; received: number; pending: number; spent: number | null; profit: number | null; last_payment: string | null }
export interface Due { project_id: string; project_no: string; customer_name: string; phone: string; village: string | null; status: string; total_cost: number; received: number; pending: number; last_payment: string | null; start_date: string | null; locked: boolean }
export interface MoneySummary { money_in: number; money_out: number; customer_payments: number; project_spend: number; office_expenses: number; commissions_paid: number; net: number; pending_dues: number; commissions_unpaid: number }
export interface CommissionRow { id: string; partner_id: string; partner_name: string; project_id: string; project_no: string; customer_name: string; capacity_kw: number | null; amount: number; basis: string; earned_at: string; paid: number; pending: number }

const STALE = 5 * 60_000;
export const TXN_SELECT = "*, project:projects(project_no, customer:customers(name)), partner:partners(name), category:expense_categories(name)";

export const useExpenseCategories = () => useQuery({
  queryKey: ["expense_categories"], staleTime: STALE,
  queryFn: async () => { const { data, error } = await supabase.from("expense_categories").select("*").order("sort"); if (error) throw error; return data as ExpenseCategory[]; },
});
export const useProjectMoney = (projectId: string | undefined) => useQuery({
  queryKey: ["money", "project", projectId], enabled: !!projectId,
  queryFn: async () => { const { data, error } = await supabase.rpc("project_money", { p: projectId }); if (error) throw error; return (data as ProjectMoney[])[0]; },
});
export const useProjectTxns = (projectId: string | undefined) => useQuery({
  queryKey: ["money", "txns", "project", projectId], enabled: !!projectId,
  queryFn: async () => {
    const { data, error } = await supabase.from("transactions").select(TXN_SELECT).eq("project_id", projectId!).is("deleted_at", null)
      .order("txn_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error; return data as TxnRow[];
  },
});
export const useDues = () => useQuery({
  queryKey: ["money", "dues"],
  queryFn: async () => { const { data, error } = await supabase.rpc("dues_list"); if (error) throw error; return data as Due[]; },
});
export const useCommissions = (enabled = true) => useQuery({
  queryKey: ["money", "commissions"], enabled,
  queryFn: async () => { const { data, error } = await supabase.rpc("commission_list"); if (error) throw error; return data as CommissionRow[]; },
});

export const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export function periodRange(p: string): [string, string] {
  const d = new Date(); const y = d.getFullYear(), m = d.getMonth();
  const iso = (x: Date) => { x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  if (p === "last_month") return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (p === "3m") return [iso(new Date(y, m - 2, 1)), iso(new Date(y, m + 1, 0))]; // this month and the two before
  if (p === "fy") { const fy = m >= 3 ? y : y - 1; return [`${fy}-04-01`, `${fy + 1}-03-31`]; } // Indian financial year, April to March
  if (p === "all") return ["2000-01-01", "2100-12-31"];
  return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
}
export const PERIODS = [{ value: "month", label: "This month" }, { value: "last_month", label: "Last month" }, { value: "fy", label: "This year (FY)" }, { value: "all", label: "All time" }];
