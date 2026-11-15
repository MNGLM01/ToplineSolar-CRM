import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, FileText, Paperclip, Plus, Wallet } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { can, useAuth } from "../../lib/auth";
import { kindInfo, useProjectMoney, useProjectTxns, type TxnRow } from "../../lib/money";
import { useCompany } from "../../lib/quotes";
import { signedUrl } from "../../lib/files";
import { fmtDate, rupees } from "../../lib/format";
import type { Customer, Project } from "../../lib/projects";
import { Button, Empty, PageLoader, cx, friendlyError, useToast } from "../ui";
import { AddMoneySheet, type MoneyPreset } from "../money/AddMoneySheet";

/** Money for one project. Owner and office manager see cost, received and pending; only the owner sees spend and profit. */
export function PaymentsPanel({ project, customer }: { project: Project; customer: Customer }) {
  const { profile } = useAuth();
  const isOwner = can(profile?.role).seeMoneyTotals;
  const { data: m } = useProjectMoney(project.id);
  const { data: txns, isLoading } = useProjectTxns(project.id);
  const { data: co } = useCompany();
  const { data: commission } = useQuery({
    queryKey: ["money", "commission", project.id],
    queryFn: async () => (await supabase.from("commissions").select("amount, basis, earned_at, partner:partners(name)").eq("project_id", project.id).maybeSingle()).data as { amount: number; basis: string; earned_at: string; partner: { name: string } | null } | null,
  });
  const [sheet, setSheet] = useState<{ preset?: MoneyPreset; edit?: TxnRow } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const picked = { id: project.id, project_no: project.project_no, customer_name: customer.name };
  const pct = m?.total_cost ? Math.min(100, Math.round((m.received / m.total_cost) * 100)) : 0;

  async function statement() {
    if (!co) return;
    setBusy(true);
    try {
      const { makeStatementPdf, downloadBlob } = await import("../../lib/pdf");
      const payments = (txns ?? []).filter((t) => t.direction === "in").map((t) => ({ txn_no: t.txn_no, txn_date: t.txn_date, label: kindInfo(t.kind).short + (t.note ? ` · ${t.note}` : ""), mode: t.mode, reference: t.reference, amount: t.amount }));
      const blob = await makeStatementPdf({
        co, payments,
        customer: { name: customer.name, phone: customer.phone, customer_no: customer.customer_no, address: [customer.address, customer.village, customer.district, customer.pincode].filter(Boolean).join(", ") },
        project: { project_no: project.project_no, system: project.capacity_kw ? `${project.capacity_kw} kW ${project.system_type}` : project.system_type, total_cost: project.total_cost },
      });
      downloadBlob(blob, `Payment statement ${project.project_no} ${customer.name}.pdf`.replace(/[\\/:*?"<>|]/g, "-"));
    } catch (e) { toast(friendlyError(e), "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <div className="card p-4">
          <h3 className="mb-3 font-bold">Payments</h3>
          {!m ? <PageLoader /> : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Box k="Project cost" v={rupees(m.total_cost)} />
                <Box k="Received" v={rupees(m.received)} cls="bg-success-tint" vcls="text-success" />
                <Box k="Pending" v={rupees(m.pending)} cls={m.pending > 0 ? "bg-orange-tint" : "bg-cloud"} vcls={m.pending > 0 ? "text-orange-dark" : undefined} />
              </div>
              {m.total_cost ? (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1 text-xs text-muted">{pct}% received{m.last_payment ? ` · last payment ${fmtDate(m.last_payment)}` : ""}</p>
                </div>
              ) : <p className="mt-3 text-sm text-muted">Set the project cost (Overview → System details → Edit) to track what's pending.</p>}
              {isOwner && m.spent != null && (
                <div className="mt-4 border-t border-rule pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Owner only</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Box k="Spent on this project" v={rupees(m.spent)} />
                    <Box k="Profit so far" v={rupees(m.profit)} cls={(m.profit ?? 0) >= 0 ? "bg-success-tint" : "bg-danger-tint"} vcls={(m.profit ?? 0) >= 0 ? "text-success" : "text-danger"} />
                  </div>
                  {m.total_cost ? <p className="mt-2 text-xs text-muted">Expected profit when fully paid: <b className="text-ink">{rupees(m.total_cost - m.spent)}</b> ({Math.round(((m.total_cost - m.spent) / m.total_cost) * 100)}% margin)</p> : null}
                </div>
              )}
            </>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => setSheet({ preset: { kind: "customer_payment", project: picked, amount: undefined } })}><ArrowDownLeft className="h-4 w-4" />Customer paid</Button>
            <Button variant="secondary" onClick={() => setSheet({ preset: { project: picked } })}><Plus className="h-4 w-4" />Other entry</Button>
          </div>
          <Button variant="ghost" className="mt-2 w-full" loading={busy} onClick={statement}><FileText className="h-4 w-4" />Payment statement PDF</Button>
        </div>
        {commission && (
          <div className="card p-4 text-sm">
            <h3 className="mb-1 font-bold">Referral commission</h3>
            <p className="text-body">{commission.partner?.name}: <b className="text-ink">{rupees(commission.amount)}</b> <span className="text-muted">({commission.basis})</span></p>
            <p className="text-xs text-muted">Due since {fmtDate(commission.earned_at)}. Pay it from Money → Commissions.</p>
          </div>
        )}
      </div>

      <div className="card lg:col-span-3">
        <h3 className="border-b border-rule px-4 py-3 font-bold">Entries</h3>
        {isLoading ? <PageLoader /> : !txns?.length ? (
          <Empty icon={<Wallet className="h-6 w-6" />} title="No money recorded yet" text="Record each payment from the customer, and what you pay technicians and vendors for this project." />
        ) : (
          <ul className="divide-y divide-rule/70">
            {txns.map((t) => <TxnLine key={t.id} t={t} onOpen={() => setSheet({ edit: t })} />)}
          </ul>
        )}
        {!isOwner && <p className="border-t border-rule px-4 py-2 text-xs text-muted">You see customer payments and the entries you recorded.</p>}
      </div>

      <AddMoneySheet open={!!sheet} onClose={() => setSheet(null)} preset={sheet?.preset} edit={sheet?.edit} />
    </div>
  );
}

function Box({ k, v, cls = "bg-cloud", vcls }: { k: string; v: string; cls?: string; vcls?: string }) {
  return <div className={cx("rounded-xl px-3 py-2.5", cls)}><p className="text-[11px] text-muted">{k}</p><p className={cx("text-[15px] font-bold tabular-nums text-ink sm:text-base", vcls)}>{v}</p></div>;
}

export function TxnLine({ t, onOpen, showProject }: { t: TxnRow; onOpen: () => void; showProject?: boolean }) {
  const info = kindInfo(t.kind);
  const toast = useToast();
  const sub = [
    showProject && t.project ? `${t.project.customer?.name ?? ""} · ${t.project.project_no}` : null,
    t.partner?.name, t.category?.name, t.paid_to, t.mode, t.reference, t.note,
  ].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", t.direction === "in" ? "bg-success-tint text-success" : "bg-orange-tint text-orange-dark")}>
          {t.direction === "in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink">{info.short}</span>
          <span className="block truncate text-xs text-muted">{fmtDate(t.txn_date)} · {t.txn_no}{sub ? ` · ${sub}` : ""}</span>
        </span>
        <span className={cx("shrink-0 font-bold tabular-nums", t.direction === "in" ? "text-success" : "text-ink")}>{t.direction === "in" ? "+" : "−"}{rupees(t.amount)}</span>
      </button>
      {t.receipt_path && (
        <button aria-label="View receipt" title="View receipt" className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-cloud"
          onClick={async () => { try { window.open(await signedUrl(t.receipt_path!), "_blank"); } catch (e) { toast(friendlyError(e), "error"); } }}>
          <Paperclip className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
