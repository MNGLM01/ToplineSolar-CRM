import { supabase } from "./supabase";
import { kindInfo, type CommissionRow, type Due, type TxnKind } from "./money";
import type { Profile } from "./types";

/**
 * Excel reports. Each report fetches only what the signed-in role may read: the money
 * reports call owner-only server functions, so even a changed browser can't pull them
 * for another role.
 */

export type Cell = string | number | Date | null;
export interface ReportSheet { sheet: string; head: string[]; rows: Cell[][]; money?: number[]; dates?: number[] }
export interface ReportDef {
  id: string; title: string; text: string; group: "Leads" | "Projects" | "Money";
  ownerOnly?: boolean; usesPeriod?: boolean;
  build: (ctx: Ctx) => Promise<ReportSheet>;
}
export interface Ctx { from: string; to: string; isOwner: boolean; profiles: Profile[] }

const nameOf = (ctx: Ctx, id: string | null | undefined) => (id ? ctx.profiles.find((p) => p.id === id)?.full_name ?? "" : "");
const d = (s: string | null | undefined) => (s ? new Date(s.length === 10 ? `${s}T00:00:00` : s) : null);
const endOf = (to: string) => new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString();
const startOf = (from: string) => new Date(`${from}T00:00:00`).toISOString();
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a * 1000) / b) / 10 : 0);
async function rows<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await p; if (error) throw error; return (data ?? []) as T[];
}

type LeadRow = {
  lead_no: string; name: string; phone: string; village: string | null; district: string | null; monthly_bill: number | null;
  temperature: string | null; assigned_to: string | null; created_at: string; won_at: string | null; next_followup_at: string | null; deal_value: number | null;
  stage: { name: string } | null; source: { name: string } | null; partner: { name: string } | null;
};
type ProjectRow = {
  project_no: string; capacity_kw: number | null; system_type: string; finance_type: string; total_cost: number | null; assigned_to: string | null;
  status_changed_at: string; start_date: string | null; installed_on: string | null; completed_on: string | null; created_at: string; installer_names: string | null;
  customer: { name: string; phone: string; village: string | null; district: string | null } | null; status: { name: string } | null;
};
type TxnLite = { txn_no: string; kind: TxnKind; direction: "in" | "out"; amount: number; txn_date: string; mode: string; paid_to: string | null; reference: string | null; note: string | null;
  project: { project_no: string; customer: { name: string } | null } | null; partner: { name: string } | null; category: { name: string } | null };
type ProjectMoneyRow = { project_no: string; customer_name: string; district: string | null; salesperson: string | null; status: string; capacity_kw: number | null;
  booked_on: string; installed_on: string | null; total_cost: number | null; received: number; pending: number; labour: number; vendor: number; commission: number;
  other_spend: number; spent: number; profit: number; margin_pct: number | null };

async function dashLeads(ctx: Ctx) {
  const { data, error } = await supabase.rpc("dashboard_leads", { d_from: ctx.from, d_to: ctx.to, p_district: null });
  if (error) throw error;
  return data as { by_source: { name: string; count: number; won: number }[]; team: { name: string; role: string; leads: number; open: number; followups_done: number; overdue: number; won: number }[] };
}
const txns = (ctx: Ctx, dir: "in" | "out") => rows<TxnLite>(supabase.from("transactions")
  .select("txn_no, kind, direction, amount, txn_date, mode, paid_to, reference, note, project:projects(project_no, customer:customers(name)), partner:partners(name), category:expense_categories(name)")
  .is("deleted_at", null).eq("direction", dir).gte("txn_date", ctx.from).lte("txn_date", ctx.to).order("txn_date"));
const projectMoney = (ctx: Ctx) => rows<ProjectMoneyRow>(supabase.rpc("report_project_money", { d_from: ctx.from, d_to: ctx.to }));

export const REPORTS: ReportDef[] = [
  {
    id: "leads", group: "Leads", title: "Leads", text: "Every lead added in the period with stage, source and salesperson", usesPeriod: true,
    async build(ctx) {
      const data = await rows<LeadRow>(supabase.from("leads")
        .select("lead_no, name, phone, village, district, monthly_bill, temperature, assigned_to, created_at, won_at, next_followup_at, deal_value, stage:lead_stages(name), source:lead_sources(name), partner:partners(name)")
        .is("deleted_at", null).gte("created_at", startOf(ctx.from)).lt("created_at", endOf(ctx.to)).order("created_at").limit(10000));
      const head = ["Lead no", "Name", "Mobile", "Village", "District", "Monthly bill (₹)", "Stage", "Hot/Warm/Cold", "Source", "Referral partner", "Salesperson", "Added on", "Next follow-up", "Won on"];
      if (ctx.isOwner) head.push("Deal value (₹)");
      return {
        sheet: "Leads", head, money: ctx.isOwner ? [5, 14] : [5], dates: [11, 12, 13],
        rows: data.map((l) => {
          const r: Cell[] = [l.lead_no, l.name, l.phone, l.village, l.district, l.monthly_bill, l.stage?.name ?? "", l.temperature ?? "", l.source?.name ?? "",
            l.partner?.name ?? "", nameOf(ctx, l.assigned_to), d(l.created_at), d(l.next_followup_at), d(l.won_at)];
          if (ctx.isOwner) r.push(l.deal_value);
          return r;
        }),
      };
    },
  },
  {
    id: "sources", group: "Leads", title: "Lead sources", text: "Which source brings leads and customers", usesPeriod: true,
    async build(ctx) {
      const { by_source } = await dashLeads(ctx);
      return { sheet: "Lead sources", head: ["Source", "Leads", "Won", "Converted %"], rows: by_source.map((s) => [s.name, s.count, s.won, pctOf(s.won, s.count)]) };
    },
  },
  {
    id: "team", group: "Leads", title: "Salesperson performance", text: "Leads given, follow-ups done and leads won per person", usesPeriod: true,
    async build(ctx) {
      const { team } = await dashLeads(ctx);
      return { sheet: "Sales team", head: ["Name", "New leads", "Open now", "Follow-ups done", "Overdue now", "Won", "Converted %"],
        rows: team.map((t) => [t.name, t.leads, t.open, t.followups_done, t.overdue, t.won, pctOf(t.won, t.leads)]) };
    },
  },
  {
    id: "projects", group: "Projects", title: "Project status", text: "All projects as of today with stage, dates and installer",
    async build(ctx) {
      const data = await rows<ProjectRow>(supabase.from("projects")
        .select("project_no, capacity_kw, system_type, finance_type, total_cost, assigned_to, status_changed_at, start_date, installed_on, completed_on, created_at, installer_names, customer:customers(name, phone, village, district), status:project_statuses(name)")
        .is("deleted_at", null).order("created_at").limit(10000));
      const now = Date.now();
      const head = ["Project no", "Customer", "Mobile", "Village", "District", "kW", "System", "Payment", "Stage", "Days in stage", "Salesperson", "Installer", "Booked on", "Work started", "Installed on", "Completed on"];
      if (ctx.isOwner) head.push("Project value (₹)");
      return {
        sheet: "Projects", head, money: ctx.isOwner ? [16] : [], dates: [12, 13, 14, 15],
        rows: data.map((p) => {
          const r: Cell[] = [p.project_no, p.customer?.name ?? "", p.customer?.phone ?? "", p.customer?.village ?? "", p.customer?.district ?? "", p.capacity_kw,
            p.system_type, p.finance_type, p.status?.name ?? "", Math.floor((now - new Date(p.status_changed_at).getTime()) / 86_400_000),
            nameOf(ctx, p.assigned_to), p.installer_names, d(p.created_at), d(p.start_date), d(p.installed_on), d(p.completed_on)];
          if (ctx.isOwner) r.push(p.total_cost);
          return r;
        }),
      };
    },
  },
  {
    id: "documents", group: "Projects", title: "Documents pending", text: "Documents waiting to be checked or sent back for a new copy",
    async build() {
      type R = { status: string; file_name: string; reject_reason: string | null; created_at: string; type: { name: string } | null;
        project: { project_no: string; customer: { name: string; phone: string } | null } | null; lead: { lead_no: string; name: string; phone: string } | null };
      const data = await rows<R>(supabase.from("documents")
        .select("status, file_name, reject_reason, created_at, type:document_types(name), project:projects(project_no, customer:customers(name, phone)), lead:leads(lead_no, name, phone)")
        .is("deleted_at", null).in("status", ["pending", "rejected"]).order("created_at").limit(10000));
      return {
        sheet: "Documents pending", head: ["Customer", "Mobile", "Project / lead no", "Document", "Status", "Why rejected", "Uploaded on", "File"], dates: [6],
        rows: data.map((x) => [x.project?.customer?.name ?? x.lead?.name ?? "", x.project?.customer?.phone ?? x.lead?.phone ?? "", x.project?.project_no ?? x.lead?.lead_no ?? "",
          x.type?.name ?? "", x.status === "pending" ? "To check" : "Rejected", x.reject_reason, d(x.created_at), x.file_name]),
      };
    },
  },
  {
    id: "subsidy", group: "Projects", title: "Subsidy", text: "PM Surya Ghar subsidy stage for every project",
    async build() {
      type R = { stage: string; application_no: string | null; expected_amount: number | null; applied_on: string | null; approved_on: string | null; received_amount: number | null; received_on: string | null;
        project: { project_no: string; capacity_kw: number | null; installed_on: string | null; deleted_at: string | null; customer: { name: string; phone: string; district: string | null } | null } | null };
      const data = (await rows<R>(supabase.from("subsidies")
        .select("stage, application_no, expected_amount, applied_on, approved_on, received_amount, received_on, project:projects(project_no, capacity_kw, installed_on, deleted_at, customer:customers(name, phone, district))")
        .limit(10000))).filter((x) => x.project && !x.project.deleted_at);
      return {
        sheet: "Subsidy", head: ["Project no", "Customer", "Mobile", "District", "kW", "Installed on", "Subsidy stage", "Application no", "Expected (₹)", "Applied on", "Approved on", "Received (₹)", "Received on"],
        money: [8, 11], dates: [5, 9, 10, 12],
        rows: data.map((x) => [x.project!.project_no, x.project!.customer?.name ?? "", x.project!.customer?.phone ?? "", x.project!.customer?.district ?? "", x.project!.capacity_kw,
          d(x.project!.installed_on), x.stage, x.application_no, x.expected_amount, d(x.applied_on), d(x.approved_on), x.received_amount, d(x.received_on)]),
      };
    },
  },
  {
    id: "dues", group: "Money", title: "Dues by customer", text: "What each customer still has to pay",
    async build() {
      const data = (await rows<Due>(supabase.rpc("dues_list"))).filter((x) => x.pending > 0);
      return {
        sheet: "Dues", head: ["Customer", "Mobile", "Village", "Project no", "Stage", "Project value (₹)", "Received (₹)", "Due (₹)", "Last payment"], money: [5, 6, 7], dates: [8],
        rows: data.map((x) => [x.customer_name, x.phone, x.village, x.project_no, x.status, x.total_cost, x.received, x.pending, d(x.last_payment)]),
      };
    },
  },
  {
    id: "commissions", group: "Money", title: "Referral commission", text: "Commission earned, paid and still to pay per partner",
    async build() {
      const data = await rows<CommissionRow>(supabase.rpc("commission_list"));
      return {
        sheet: "Commission", head: ["Partner", "Customer", "Project no", "kW", "Earned on", "Commission (₹)", "Paid (₹)", "To pay (₹)"], money: [5, 6, 7], dates: [4],
        rows: data.map((x) => [x.partner_name, x.customer_name, x.project_no, x.capacity_kw, d(x.earned_at), x.amount, x.paid, x.pending]),
      };
    },
  },
  // ---------- Owner only ----------
  {
    id: "project_money", group: "Money", ownerOnly: true, usesPeriod: true, title: "Profit per project", text: "Project value, money received, spent and profit for projects booked in the period",
    async build(ctx) {
      const data = await projectMoney(ctx);
      return {
        sheet: "Profit per project",
        head: ["Project no", "Customer", "District", "Salesperson", "Stage", "kW", "Booked on", "Installed on", "Project value (₹)", "Received (₹)", "Due (₹)", "Labour (₹)", "Vendor (₹)", "Commission (₹)", "Other spend (₹)", "Total spent (₹)", "Profit (₹)", "Margin %"],
        money: [8, 9, 10, 11, 12, 13, 14, 15, 16], dates: [6, 7],
        rows: data.map((x) => [x.project_no, x.customer_name, x.district, x.salesperson, x.status, x.capacity_kw, d(x.booked_on), d(x.installed_on), x.total_cost,
          x.received, x.pending, x.labour, x.vendor, x.commission, x.other_spend, x.spent, x.profit, x.margin_pct]),
      };
    },
  },
  {
    id: "monthly", group: "Money", ownerOnly: true, usesPeriod: true, title: "Money by month", text: "Money received and spent each month, by type",
    async build(ctx) {
      const [ins, outs] = await Promise.all([txns(ctx, "in"), txns(ctx, "out")]);
      const kinds: TxnKind[] = ["labour", "vendor", "commission", "office_expense", "other_out"];
      const m = new Map<string, { in: number; out: Record<string, number> }>();
      for (const t of [...ins, ...outs]) {
        const k = t.txn_date.slice(0, 7);
        const e = m.get(k) ?? { in: 0, out: {} };
        if (t.direction === "in") e.in += Number(t.amount); else e.out[t.kind] = (e.out[t.kind] ?? 0) + Number(t.amount);
        m.set(k, e);
      }
      return {
        sheet: "Money by month", head: ["Month", "Received (₹)", ...kinds.map((k) => `${kindInfo(k).short} (₹)`), "Total spent (₹)", "Net (₹)"], money: [1, 2, 3, 4, 5, 6, 7, 8],
        rows: [...m.entries()].sort().map(([k, e]) => {
          const out = kinds.reduce((s, x) => s + (e.out[x] ?? 0), 0);
          return [new Date(`${k}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }), e.in, ...kinds.map((x) => e.out[x] ?? 0), out, e.in - out];
        }),
      };
    },
  },
  {
    id: "by_salesperson", group: "Money", ownerOnly: true, usesPeriod: true, title: "Sales and profit per salesperson", text: "Projects booked in the period, grouped by salesperson",
    async build(ctx) {
      const data = await projectMoney(ctx);
      const g = new Map<string, { n: number; kw: number; value: number; received: number; spent: number; profit: number }>();
      for (const x of data) {
        const k = x.salesperson || "Not set";
        const e = g.get(k) ?? { n: 0, kw: 0, value: 0, received: 0, spent: 0, profit: 0 };
        e.n++; e.kw += Number(x.capacity_kw ?? 0); e.value += Number(x.total_cost ?? 0); e.received += Number(x.received); e.spent += Number(x.spent); e.profit += Number(x.profit);
        g.set(k, e);
      }
      return {
        sheet: "Per salesperson", head: ["Salesperson", "Projects", "kW", "Project value (₹)", "Received (₹)", "Spent (₹)", "Profit (₹)", "Margin %"], money: [3, 4, 5, 6],
        rows: [...g.entries()].sort((a, b) => b[1].value - a[1].value).map(([k, e]) => [k, e.n, e.kw, e.value, e.received, e.spent, e.profit, pctOf(e.profit, e.value)]),
      };
    },
  },
  {
    id: "collections", group: "Money", ownerOnly: true, usesPeriod: true, title: "Collections", text: "Every payment received in the period",
    async build(ctx) {
      const data = await txns(ctx, "in");
      return {
        sheet: "Collections", head: ["Entry no", "Date", "Type", "Customer", "Project no", "Mode", "Reference", "Amount (₹)", "Note"], money: [7], dates: [1],
        rows: data.map((t) => [t.txn_no, d(t.txn_date), kindInfo(t.kind).short, t.project?.customer?.name ?? t.paid_to ?? "", t.project?.project_no ?? "", t.mode, t.reference, Number(t.amount), t.note]),
      };
    },
  },
  {
    id: "expenses", group: "Money", ownerOnly: true, usesPeriod: true, title: "Expenses", text: "Every payment made in the period: labour, vendors, commission and office",
    async build(ctx) {
      const data = await txns(ctx, "out");
      return {
        sheet: "Expenses", head: ["Entry no", "Date", "Type", "Category", "Paid to", "Customer / project", "Mode", "Reference", "Amount (₹)", "Note"], money: [8], dates: [1],
        rows: data.map((t) => [t.txn_no, d(t.txn_date), kindInfo(t.kind).short, t.category?.name ?? "", t.partner?.name ?? t.paid_to ?? "",
          t.project ? `${t.project.customer?.name ?? ""} (${t.project.project_no})` : "", t.mode, t.reference, Number(t.amount), t.note]),
      };
    },
  },
];

export const reportsFor = (isOwner: boolean) => REPORTS.filter((r) => isOwner || !r.ownerOnly);

/** Build an .xlsx file (one sheet per report) and download it. The Excel library loads only when needed. */
export async function downloadExcel(sheets: ReportSheet[], fileName: string) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const navy = "#0A1F3C";
  const toSheet = (s: ReportSheet) => {
    const header = s.head.map((h) => ({ value: h, fontWeight: "bold" as const, textColor: "#FFFFFF", backgroundColor: navy }));
    const body = s.rows.map((r) => r.map((v, i) => {
      if (v == null || v === "") return null;
      if (v instanceof Date) return { value: v, type: Date, format: "dd mmm yyyy" };
      if (typeof v === "number" || (s.money?.includes(i) && !isNaN(Number(v)))) return { value: Number(v), type: Number, format: s.money?.includes(i) ? "#,##,##0" : undefined };
      return { value: String(v), type: String };
    }));
    const widths = s.head.map((h, i) => ({
      width: Math.min(40, Math.max(h.length + 2, ...s.rows.slice(0, 200).map((r) => (r[i] instanceof Date ? 12 : String(r[i] ?? "").length + 2)))),
    }));
    return { data: [header, ...(body.length ? body : [[{ value: "Nothing to show", type: String }]])], sheet: s.sheet.slice(0, 31), columns: widths, stickyRowsCount: 1 };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await writeXlsxFile(sheets.map(toSheet) as any, { fontFamily: "Calibri", fontSize: 11 }).toFile(fileName);
}
