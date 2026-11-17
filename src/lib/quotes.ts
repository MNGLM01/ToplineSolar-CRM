import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { EstimateSettings } from "./types";
import { subsidyFor } from "./estimate";

export const PRICE_CATEGORIES = ["Panel", "Inverter", "Structure", "Cables & BOS", "Battery", "Installation", "Net metering", "Other"] as const;
export const GST_RATES = [0, 5, 12, 18, 28];

export interface PriceItem {
  id: number; category: string; name: string; description: string | null; unit: string; rate: number; gst_rate: number;
  watt: number | null; capacity_kw: number | null; per_kw: boolean; sort: number; active: boolean;
}
export interface QuoteItem {
  item_id: number | null; category: string; name: string; description: string | null; unit: string;
  qty: number; rate: number; discount_pct: number; gst_rate: number;
}
export type QuoteStatus = "Draft" | "Sent" | "Accepted" | "Rejected";
export interface Quotation {
  id: string; quote_no: string; version: number; lead_id: string; project_id: string | null; status: QuoteStatus;
  customer_name: string; customer_phone: string | null; customer_address: string | null;
  capacity_kw: number; system_type: string; customer_type: string; items: QuoteItem[]; extra_discount: number;
  subtotal: number; gst_amount: number; total: number; subsidy: number; monthly_bill: number | null;
  include_loan: boolean; loan_amount: number | null; loan_rate: number | null; loan_months: number | null;
  valid_until: string | null; payment_terms: string | null; notes: string | null; pdf_path: string | null;
  sent_at: string | null; decided_at: string | null; created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null;
}
export interface Company {
  name: string; tagline: string; address: string; phones: string; email: string; gstin: string; website: string;
  bank_name: string; bank_account_name: string; bank_account_no: string; bank_ifsc: string; upi_id: string;
  quote_valid_days: number; payment_terms: string; quote_terms: string; is_sample?: boolean;
}
export const DEFAULT_COMPANY: Company = {
  name: "Topline Solar", tagline: "Trusted Solar Partner in North Bihar", address: "Purnea, Bihar", phones: "+91 74628 55050, +91 82101 55294",
  email: "", gstin: "", website: "", bank_name: "", bank_account_name: "Topline Solar", bank_account_no: "", bank_ifsc: "", upi_id: "",
  quote_valid_days: 15, payment_terms: "", quote_terms: "",
};

export const STATUS_STYLE: Record<QuoteStatus, string> = {
  Draft: "bg-cloud text-muted", Sent: "bg-blue-tint text-blue", Accepted: "bg-success-tint text-success", Rejected: "bg-danger-tint text-danger",
};

const STALE = 5 * 60_000;
export const usePriceItems = () => useQuery({
  queryKey: ["price_items"], staleTime: STALE,
  queryFn: async () => { const { data, error } = await supabase.from("price_items").select("*").order("sort").order("id"); if (error) throw error; return data as PriceItem[]; },
});
export const useCompany = () => useQuery({
  queryKey: ["settings", "company"], staleTime: STALE,
  queryFn: async () => {
    const { data } = await supabase.from("app_settings").select("value").eq("key", "company").maybeSingle();
    return { ...DEFAULT_COMPANY, ...((data?.value as Partial<Company>) ?? {}) } as Company;
  },
});
export const useQuotesForLead = (leadId: string | null | undefined) => useQuery({
  queryKey: ["quotes", "lead", leadId], enabled: !!leadId,
  queryFn: async () => {
    const { data, error } = await supabase.from("quotations").select("*").eq("lead_id", leadId!).is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error; return data as Quotation[];
  },
});
export const useQuote = (id: string | undefined) => useQuery({
  queryKey: ["quote", id], enabled: !!id,
  queryFn: async () => { const { data, error } = await supabase.from("quotations").select("*").eq("id", id!).maybeSingle(); if (error) throw error; return data as Quotation | null; },
});

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Same arithmetic as the database trigger, so what you see is what gets saved. */
export function lineAmount(it: QuoteItem) { return r2((it.qty || 0) * (it.rate || 0) * (1 - (it.discount_pct || 0) / 100)); }
export function quoteTotals(items: QuoteItem[], extraDiscount: number) {
  let sub = 0, gst = 0;
  for (const it of items) { const l = lineAmount(it); sub += l; gst += r2(l * (it.gst_rate || 0) / 100); }
  const extra = Math.min(Math.max(extraDiscount || 0, 0), sub);
  const ratio = sub > 0 ? (sub - extra) / sub : 1;
  const subtotal = r2(sub - extra), gstAmount = r2(gst * ratio);
  // GST split by rate for the proposal table
  const byRate: Record<number, { taxable: number; gst: number }> = {};
  for (const it of items) {
    const l = lineAmount(it) * ratio; const k = it.gst_rate || 0;
    byRate[k] ??= { taxable: 0, gst: 0 }; byRate[k].taxable += l; byRate[k].gst += l * k / 100;
  }
  return { gross: r2(sub), extra, subtotal, gstAmount, total: r2(subtotal + gstAmount), byRate };
}

/** Monthly EMI on a reducing-balance loan. */
export function emi(principal: number, ratePct: number, months: number) {
  if (!(principal > 0) || !(months > 0)) return 0;
  const r = ratePct / 1200;
  if (r === 0) return principal / months;
  return (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);
}

/** Generation and savings for the proposal. Conservative: savings never exceed the customer's current bill. */
export function savings(kw: number, netCost: number, s: EstimateSettings, monthlyBill?: number | null) {
  const monthlyUnits = kw * s.units_per_kw_month;
  let monthly = monthlyUnits * s.tariff_per_unit;
  if (monthlyBill && monthlyBill > 0) monthly = Math.min(monthly, monthlyBill);
  const annual = monthly * 12;
  return { monthlyUnits, annualUnits: monthlyUnits * 12, monthly, annual, payback: annual > 0 ? netCost / annual : 0, life25: annual * 25 };
}

const toItem = (p: PriceItem, qty: number): QuoteItem => ({
  item_id: p.id, category: p.category, name: p.name, description: p.description, unit: p.unit, qty, rate: Number(p.rate), discount_pct: 0, gst_rate: Number(p.gst_rate),
});
export const priceToItem = toItem;

/** A sensible starting kit for a system size: panels, nearest inverter, per-kW items and the usual fittings. Everything stays editable. */
export function standardKit(kw: number, systemType: string, items: PriceItem[]): QuoteItem[] {
  const act = items.filter((i) => i.active);
  const out: QuoteItem[] = [];
  const panel = act.find((i) => i.category === "Panel" && i.watt);
  if (panel) out.push(toItem(panel, Math.ceil((kw * 1000) / panel.watt!)));
  const wantHybrid = systemType !== "On-grid";
  const invs = act.filter((i) => i.category === "Inverter" && i.capacity_kw).filter((i) => /hybrid|off.?grid/i.test(i.name) === wantHybrid);
  const pool = invs.length ? invs : act.filter((i) => i.category === "Inverter" && i.capacity_kw);
  const inv = [...pool].sort((a, b) => a.capacity_kw! - b.capacity_kw!).find((i) => i.capacity_kw! >= kw * 0.9) ?? pool.sort((a, b) => b.capacity_kw! - a.capacity_kw!)[0];
  if (inv) out.push(toItem(inv, 1));
  for (const i of act) {
    if (i.category === "Panel" || i.category === "Inverter") continue;
    if (i.category === "Battery") { if (wantHybrid) out.push(toItem(i, 1)); continue; }
    if (i.per_kw) { out.push(toItem(i, kw)); continue; }
    if (i.unit === "m") { out.push(toItem(i, /dc/i.test(i.name) ? Math.max(20, Math.round(kw * 10)) : 20)); continue; }
    if (i.category === "Other") continue;
    out.push(toItem(i, 1));
  }
  return out;
}

export const quoteLabel = (q: Pick<Quotation, "quote_no" | "version">) => `${q.quote_no}${q.version > 1 ? ` v${q.version}` : ""}`;
export const pdfFileName = (q: Pick<Quotation, "quote_no" | "version" | "customer_name">) =>
  `Topline Solar ${q.quote_no}-v${q.version} ${q.customer_name}`.replace(/[\\/:*?"<>|]/g, "-") + ".pdf";

/** Start a new quotation for a lead, with the standard kit for the suggested size. Saved straight away so nothing is lost. */
export async function createQuotation(opts: {
  lead: { id: string; name: string; phone: string; address: string | null; village: string | null; district: string | null; pincode: string | null; customer_type: string; monthly_bill: number | null };
  kw: number; priceItems: PriceItem[]; company: Company; est: EstimateSettings; projectId?: string | null;
}) {
  const { lead, kw, priceItems, company, est } = opts;
  const items = standardKit(kw, "On-grid", priceItems);
  const t = quoteTotals(items, 0);
  const subsidy = lead.customer_type === "Residential" ? Math.min(subsidyFor(kw, est), t.total) : 0;
  const valid = new Date(); valid.setDate(valid.getDate() + (company.quote_valid_days || 15));
  const { data, error } = await supabase.from("quotations").insert({
    lead_id: lead.id, project_id: opts.projectId ?? null, customer_name: lead.name, customer_phone: lead.phone,
    customer_address: [lead.address, lead.village, lead.district, lead.pincode].filter(Boolean).join(", ") || null,
    capacity_kw: kw, system_type: "On-grid", customer_type: lead.customer_type, items, subsidy, monthly_bill: lead.monthly_bill,
    valid_until: valid.toISOString().slice(0, 10), payment_terms: company.payment_terms || null,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}
