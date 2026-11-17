import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, LogOut, Users, Wallet } from "lucide-react";
import { useCommissions } from "../lib/money";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { fmtDate, rupees } from "../lib/format";
import type { Partner } from "../lib/types";
import { Button, Empty, PageLoader, cx } from "../components/ui";
import { NewLeadSheet } from "../components/NewLeadSheet";
import { commissionText } from "./Partners";

interface Row { id: string; lead_no: string; name: string; village: string | null; district: string | null; monthly_bill: number | null; created_at: string; stage: string; is_won: boolean; is_lost: boolean; project_status: string | null }

const status = (r: Row) => r.project_status === "Completed" ? { t: "Installed", c: "bg-success-tint text-success" }
  : r.project_status && r.project_status !== "Cancelled" ? { t: `Customer · ${r.project_status}`, c: "bg-success-tint text-success" }
  : r.is_won ? { t: "Won", c: "bg-success-tint text-success" } : r.is_lost ? { t: "Not going ahead", c: "bg-cloud text-muted" } : r.stage === "New" ? { t: "Received", c: "bg-blue-tint text-blue" } : { t: `In progress · ${r.stage}`, c: "bg-orange-tint text-orange-dark" };

export default function PartnerHome() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useQuery({
    queryKey: ["partner_leads"],
    queryFn: async () => (await supabase.from("partner_leads").select("*").order("created_at", { ascending: false })).data as Row[],
  });
  const { data: partner } = useQuery({
    queryKey: ["partners", "me", profile?.partner_id],
    queryFn: async () => (await supabase.from("partners").select("*").eq("id", profile!.partner_id!).maybeSingle()).data as Partner | null,
    enabled: !!profile?.partner_id,
  });
  const won = rows?.filter((r) => r.is_won).length ?? 0;
  const { data: commissions } = useCommissions();
  const earned = (commissions ?? []).reduce((a, c) => a + Number(c.amount), 0);
  const paid = (commissions ?? []).reduce((a, c) => a + Number(c.paid), 0);

  return (
    <div className="min-h-dvh">
      <header className="bg-navy">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <img src="/brand/topline-solar-logo-horizontal-dark.svg" alt="Topline Solar" className="h-8 w-auto" />
          <button onClick={signOut} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-8 pt-4">
          <p className="text-white/60">Namaste,</p>
          <h1 className="text-2xl font-extrabold text-white">{partner?.name ?? profile?.full_name}</h1>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Stat n={rows?.length ?? 0} l="Referred" /><Stat n={won} l="Won" /><Stat n={(rows?.length ?? 0) - won - (rows?.filter((r) => r.is_lost).length ?? 0)} l="In progress" />
          </div>
          {partner && <p className="mt-4 text-sm text-white/70">Your commission: <b className="text-amber">{commissionText(partner)}</b></p>}
        </div>
      </header>
      <main className="mx-auto -mt-4 max-w-3xl px-4 pb-24">
        <Button size="lg" className="mb-4 w-full shadow-pop" onClick={() => setOpen(true)}><Plus className="h-5 w-5" />Refer a new customer</Button>
        <div className="card mb-4 p-4">
          <div className="mb-3 flex items-center gap-2"><Wallet className="h-5 w-5 text-orange" /><h2 className="font-bold">Your commission</h2></div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-cloud py-2.5"><p className="text-lg font-extrabold tabular-nums text-ink">{rupees(earned)}</p><p className="text-xs text-muted">Earned</p></div>
            <div className="rounded-xl bg-success-tint py-2.5"><p className="text-lg font-extrabold tabular-nums text-success">{rupees(paid)}</p><p className="text-xs text-muted">Paid to you</p></div>
            <div className="rounded-xl bg-orange-tint py-2.5"><p className="text-lg font-extrabold tabular-nums text-orange-dark">{rupees(Math.max(earned - paid, 0))}</p><p className="text-xs text-muted">Pending</p></div>
          </div>
          {commissions?.length ? (
            <ul className="mt-3 divide-y divide-rule/70 text-sm">
              {commissions.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><span className="block truncate font-medium text-ink">{c.customer_name}</span><span className="block text-xs text-muted">{c.basis} · {fmtDate(c.earned_at)}</span></span>
                  <span className={cx("chip shrink-0", c.pending > 0 ? "bg-orange-tint text-orange-dark" : "bg-success-tint text-success")}>{c.pending > 0 ? `${rupees(c.pending)} pending` : `${rupees(c.amount)} paid`}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">Commission is earned when your customer's solar system is installed and connected to the grid.</p>}
        </div>
        <div className="card">
          <h2 className="border-b border-rule px-4 py-3 font-bold">Your referrals</h2>
          {isLoading ? <PageLoader /> : !rows?.length ? <Empty icon={<Users className="h-6 w-6" />} title="No referrals yet" text="Refer someone who wants rooftop solar. You'll see their progress here." /> : (
            <ul className="divide-y divide-rule/70">
              {rows.map((r) => { const s = status(r); return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{r.name}</p>
                    <p className="truncate text-sm text-muted">{[r.village, r.district].filter(Boolean).join(", ")}{r.monthly_bill ? ` · bill ${rupees(r.monthly_bill)}` : ""} · {fmtDate(r.created_at)}</p>
                  </div>
                  <span className={cx("chip", s.c)}>{s.t}</span>
                </li>
              ); })}
            </ul>
          )}
        </div>
      </main>
      <NewLeadSheet open={open} onClose={() => setOpen(false)} partnerMode />
    </div>
  );
}
function Stat({ n, l }: { n: number; l: string }) {
  return <div className="rounded-xl bg-white/10 px-3 py-3"><p className="text-2xl font-extrabold text-white">{n}</p><p className="text-xs text-white/60">{l}</p></div>;
}
