import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeIndianRupee, Handshake, MessageCircle, Phone, Plus, Wallet } from "lucide-react";
import { supabase } from "../lib/supabase";
import { can, useAuth } from "../lib/auth";
import { KINDS, PERIODS, TXN_SELECT, periodRange, useCommissions, useDues, type MoneySummary, type TxnKind, type TxnRow } from "../lib/money";
import { daysSince } from "../lib/projects";
import { useCompany } from "../lib/quotes";
import { fmtDate, fmtPhone, rupees, telLink, waLink } from "../lib/format";
import { Button, Empty, PageHeader, PageLoader, Segmented, cx } from "../components/ui";
import { AddMoneySheet, type MoneyPreset } from "../components/money/AddMoneySheet";
import { TxnLine } from "../components/project/PaymentsPanel";

type Tab = "dues" | "entries" | "commissions";

export default function Money() {
  const { profile } = useAuth();
  const isOwner = can(profile?.role).seeMoneyTotals;
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "dues";
  const [sheet, setSheet] = useState<{ preset?: MoneyPreset; edit?: TxnRow } | null>(null);
  return (
    <div>
      <PageHeader title="Money" subtitle={isOwner ? "Payments, dues, expenses and commissions" : "Customer payments, dues and commissions"}
        actions={<Button onClick={() => setSheet({})}><Plus className="h-4 w-4" />Add money</Button>} />
      <div className="mb-4 flex gap-1 rounded-xl bg-ink/5 p-1">
        {([["dues", "Dues"], ["entries", "Entries"], ["commissions", "Commissions"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setSp(k === "dues" ? {} : { tab: k }, { replace: true })} className={cx("h-9 flex-1 rounded-lg px-3 text-sm font-semibold", tab === k ? "bg-white text-ink shadow-sm" : "text-muted")}>{l}</button>
        ))}
      </div>
      {tab === "dues" && <Dues isOwner={isOwner} onPay={(preset) => setSheet({ preset })} />}
      {tab === "entries" && <Entries isOwner={isOwner} onOpen={(t) => setSheet({ edit: t })} />}
      {tab === "commissions" && <Commissions onPay={(preset) => setSheet({ preset })} />}
      <AddMoneySheet open={!!sheet} onClose={() => setSheet(null)} preset={sheet?.preset} edit={sheet?.edit} />
    </div>
  );
}

function Dues({ isOwner, onPay }: { isOwner: boolean; onPay: (p: MoneyPreset) => void }) {
  const { data, isLoading } = useDues();
  const { data: co } = useCompany();
  if (isLoading) return <PageLoader />;
  if (!data?.length) return <div className="card"><Empty icon={<BadgeIndianRupee className="h-6 w-6" />} title="No pending dues" text="Every customer has paid their project cost in full, or no project cost is set yet." /></div>;
  const total = data.reduce((a, d) => a + Number(d.pending), 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">{data.length} customer{data.length > 1 ? "s" : ""} with money pending · oldest payment first</p>
        {isOwner && <p className="text-sm text-muted">Total pending <b className="text-lg tabular-nums text-ink">{rupees(total)}</b></p>}
      </div>
      <div className="card divide-y divide-rule/70">
        {data.map((d) => {
          const since = d.last_payment ?? d.start_date;
          const days = since ? daysSince(since) : null;
          const pct = d.total_cost ? Math.round((d.received / d.total_cost) * 100) : 0;
          const msg = `Namaste ${d.customer_name.split(" ")[0]} ji, Topline Solar se. Aapke solar project (${d.project_no}) ka ${rupees(d.pending)} baaki hai.${co?.upi_id ? ` UPI: ${co.upi_id}.` : ""} Dhanyavaad.`;
          return (
            <div key={d.project_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link to={`/projects/${d.project_id}?tab=payments`} className="min-w-[200px] flex-1">
                <p className="font-semibold text-ink">{d.customer_name}</p>
                <p className="text-xs text-muted">{d.project_no}{d.village ? ` · ${d.village}` : ""} · {d.status}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div>
                  <span className="text-xs text-muted">{rupees(d.received)} of {rupees(d.total_cost)}</span>
                </div>
              </Link>
              <div className="text-right">
                <p className="text-lg font-extrabold tabular-nums text-orange-dark">{rupees(d.pending)}</p>
                <p className={cx("text-xs", days != null && days > 30 ? "font-semibold text-danger" : "text-muted")}>{d.last_payment ? `last paid ${days === 0 ? "today" : `${days} days ago`}` : "nothing paid yet"}</p>
              </div>
              <div className="flex gap-1.5">
                <a href={telLink(d.phone)} aria-label={`Call ${fmtPhone(d.phone)}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-tint text-blue"><Phone className="h-4 w-4" /></a>
                <a href={waLink(d.phone, msg)} target="_blank" rel="noreferrer" aria-label="WhatsApp reminder" className="flex h-9 w-9 items-center justify-center rounded-full bg-success-tint text-success"><MessageCircle className="h-4 w-4" /></a>
                <Button size="sm" variant="secondary" onClick={() => onPay({ kind: "customer_payment", project: { id: d.project_id, project_no: d.project_no, customer_name: d.customer_name } })}>Paid</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Entries({ isOwner, onOpen }: { isOwner: boolean; onOpen: (t: TxnRow) => void }) {
  const [period, setPeriod] = useState("month");
  const [kind, setKind] = useState<"" | "in" | "out" | TxnKind>("");
  const [from, to] = periodRange(period);
  const { data, isLoading } = useQuery({
    queryKey: ["money", "entries", period, kind], placeholderData: (p) => p,
    queryFn: async () => {
      let q = supabase.from("transactions").select(TXN_SELECT).is("deleted_at", null).gte("txn_date", from).lte("txn_date", to);
      if (kind === "in" || kind === "out") q = q.eq("direction", kind); else if (kind) q = q.eq("kind", kind);
      const { data, error } = await q.order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error; return data as TxnRow[];
    },
  });
  const { data: sum } = useQuery({
    queryKey: ["money", "summary", period], enabled: isOwner,
    queryFn: async () => { const { data, error } = await supabase.rpc("money_summary", { d_from: from, d_to: to }); if (error) throw error; return (data as MoneySummary[])[0]; },
  });
  const byCategory = useMemo(() => {
    if (kind !== "office_expense" || !data) return [];
    const m: Record<string, number> = {};
    data.forEach((t) => { const k = t.category?.name ?? "Other"; m[k] = (m[k] ?? 0) + Number(t.amount); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [data, kind]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="overflow-x-auto"><Segmented value={period} onChange={setPeriod} options={PERIODS} /></div>
        <select className="input h-10 w-auto" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="">All entries</option>
          <option value="in">Money in</option>
          <option value="out">Money out</option>
          {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.short}</option>)}
        </select>
      </div>

      {isOwner && sum && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile k="Money in" v={rupees(sum.money_in)} cls="bg-success-tint" vcls="text-success" />
          <Tile k="Money out" v={rupees(sum.money_out)} />
          <Tile k="Net" v={rupees(sum.net)} cls={sum.net >= 0 ? "bg-navy" : "bg-danger"} vcls="text-white" kcls="text-white/70" />
          <Tile k="Pending dues (today)" v={rupees(sum.pending_dues)} cls="bg-orange-tint" vcls="text-orange-dark" />
          <Tile k="Project spend" v={rupees(sum.project_spend)} small />
          <Tile k="Office expenses" v={rupees(sum.office_expenses)} small />
          <Tile k="Commissions paid" v={rupees(sum.commissions_paid)} small />
          <Tile k="Commissions due (today)" v={rupees(sum.commissions_unpaid)} small />
        </div>
      )}

      {byCategory.length > 0 && isOwner && (
        <div className="card mb-4 p-4">
          <h3 className="mb-2 font-bold">Office expenses by category</h3>
          {byCategory.map(([k, v]) => {
            const max = byCategory[0][1];
            return (
              <div key={k} className="flex items-center gap-3 py-1 text-sm">
                <span className="w-32 shrink-0 truncate text-body">{k}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full bg-orange" style={{ width: `${(v / max) * 100}%` }} /></div>
                <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-ink">{rupees(v)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        {isLoading ? <PageLoader /> : !data?.length ? (
          <Empty icon={<Wallet className="h-6 w-6" />} title="No entries for this period" text="Use “Add money” to record payments received, money paid out and office expenses." />
        ) : (
          <ul className="divide-y divide-rule/70">{data.map((t) => <TxnLine key={t.id} t={t} onOpen={() => onOpen(t)} showProject />)}</ul>
        )}
        {!isOwner && <p className="border-t border-rule px-4 py-2 text-xs text-muted">You see customer payments and the entries you recorded. Company totals are visible to the owner only.</p>}
      </div>
    </div>
  );
}

function Tile({ k, v, cls = "bg-white border border-rule", vcls, kcls, small }: { k: string; v: string; cls?: string; vcls?: string; kcls?: string; small?: boolean }) {
  return <div className={cx("rounded-xl px-3 py-2.5", cls)}><p className={cx("text-[11px]", kcls ?? "text-muted")}>{k}</p><p className={cx("font-bold tabular-nums text-ink", small ? "text-[15px]" : "text-lg", vcls)}>{v}</p></div>;
}

function Commissions({ onPay }: { onPay: (p: MoneyPreset) => void }) {
  const { data, isLoading } = useCommissions();
  const [showPaid, setShowPaid] = useState(false);
  if (isLoading) return <PageLoader />;
  if (!data?.length) return <div className="card"><Empty icon={<Handshake className="h-6 w-6" />} title="No commissions yet" text="When a referred customer's project reaches the status set in Settings, the partner's commission shows up here automatically." /></div>;
  const partners = Object.values(data.reduce<Record<string, { id: string; name: string; earned: number; paid: number; pending: number }>>((m, c) => {
    m[c.partner_id] ??= { id: c.partner_id, name: c.partner_name, earned: 0, paid: 0, pending: 0 };
    m[c.partner_id].earned += Number(c.amount); m[c.partner_id].paid += Number(c.paid); m[c.partner_id].pending += Number(c.pending); return m;
  }, {})).sort((a, b) => b.pending - a.pending);
  const rows = data.filter((c) => showPaid || c.pending > 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {partners.map((p) => (
          <div key={p.id} className="card p-3">
            <p className="font-semibold text-ink">{p.name}</p>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
              <div className="rounded-lg bg-cloud py-1.5"><p className="text-muted">Earned</p><p className="font-bold tabular-nums text-ink">{rupees(p.earned)}</p></div>
              <div className="rounded-lg bg-success-tint py-1.5"><p className="text-muted">Paid</p><p className="font-bold tabular-nums text-success">{rupees(p.paid)}</p></div>
              <div className="rounded-lg bg-orange-tint py-1.5"><p className="text-muted">Pending</p><p className="font-bold tabular-nums text-orange-dark">{rupees(p.pending)}</p></div>
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <h3 className="font-bold">{showPaid ? "All commissions" : "Waiting to be paid"}</h3>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="h-4 w-4 accent-orange" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} />Show paid</label>
        </div>
        {!rows.length ? <p className="px-4 py-6 text-center text-sm text-muted">All commissions are paid.</p> : (
          <ul className="divide-y divide-rule/70">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[180px] flex-1">
                  <p className="font-semibold text-ink">{c.partner_name}</p>
                  <p className="text-xs text-muted">For <Link to={`/projects/${c.project_id}`} className="text-blue">{c.customer_name} · {c.project_no}</Link> · {c.basis} · due since {fmtDate(c.earned_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums text-ink">{rupees(c.amount)}</p>
                  <p className="text-xs text-muted">{c.pending > 0 ? `${rupees(c.pending)} pending` : "Paid"}</p>
                </div>
                {c.pending > 0 && <Button size="sm" onClick={() => onPay({ kind: "commission", partnerId: c.partner_id, project: { id: c.project_id, project_no: c.project_no, customer_name: c.customer_name }, amount: c.pending })}>Pay</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
