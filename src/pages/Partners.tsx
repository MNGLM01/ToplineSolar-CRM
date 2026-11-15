import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Plus, Phone } from "lucide-react";
import { supabase } from "../lib/supabase";
import { usePartners, useProfiles, useStages } from "../lib/queries";
import { fmtPhone, normaliseMobile, rupees, telLink } from "../lib/format";
import type { Partner } from "../lib/types";
import { Avatar, Button, Empty, Field, PageHeader, PageLoader, Sheet, cx, friendlyError, useToast } from "../components/ui";

export const commissionText = (p: Partner) =>
  p.commission_type === "per_kw" ? `${rupees(p.commission_value)} per kW`
  : p.commission_type === "per_installation" ? `${rupees(p.commission_value)} per installation`
  : `${p.commission_value}% of project value`;

export default function Partners() {
  const { data: partners, isLoading } = usePartners();
  const { data: stages } = useStages();
  const { data: profiles } = useProfiles();
  const [editing, setEditing] = useState<Partner | "new" | null>(null);
  const { data: counts } = useQuery({
    queryKey: ["leads", "partner-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("partner_id, stage_id").not("partner_id", "is", null).is("deleted_at", null).limit(5000);
      const won = new Set(stages?.filter((s) => s.is_won).map((s) => s.id));
      const m: Record<string, { total: number; won: number }> = {};
      (data ?? []).forEach((r: { partner_id: string; stage_id: number }) => {
        m[r.partner_id] ??= { total: 0, won: 0 }; m[r.partner_id].total++; if (won.has(r.stage_id)) m[r.partner_id].won++;
      });
      return m;
    },
    enabled: !!stages,
  });

  return (
    <div>
      <PageHeader title="Referral partners" subtitle="People who bring you customers"
        actions={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add partner</Button>} />
      {isLoading ? <PageLoader /> : !partners?.length ? (
        <div className="card"><Empty icon={<Handshake className="h-6 w-6" />} title="No referral partners yet" text="Add a partner, then give them a login from Users & roles so they can refer customers themselves." action={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add partner</Button>} /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map((p) => {
            const c = counts?.[p.id]; const hasLogin = profiles?.some((u) => u.partner_id === p.id && u.active);
            return (
              <div key={p.id} className={cx("card p-4", !p.active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <Avatar name={p.name} size={42} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{p.name}</p>
                    <p className="truncate text-sm text-muted">{fmtPhone(p.phone)}{p.area ? ` · ${p.area}` : ""}</p>
                  </div>
                  <a href={telLink(p.phone)} aria-label="Call" className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-tint text-blue"><Phone className="h-4 w-4" /></a>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-cloud py-2"><p className="text-lg font-bold text-ink">{c?.total ?? 0}</p><p className="text-xs text-muted">Leads referred</p></div>
                  <div className="rounded-xl bg-success-tint py-2"><p className="text-lg font-bold text-success">{c?.won ?? 0}</p><p className="text-xs text-muted">Won</p></div>
                </div>
                <p className="mt-3 text-sm text-body">Commission: <b className="text-ink">{commissionText(p)}</b></p>
                <div className="mt-3 flex items-center justify-between">
                  <span className={cx("chip", hasLogin ? "bg-success-tint text-success" : "bg-cloud text-muted")}>{hasLogin ? "Has login" : "No login yet"}</span>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>Edit</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && <PartnerSheet partner={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PartnerSheet({ partner, onClose }: { partner: Partner | null; onClose: () => void }) {
  const [f, setF] = useState({
    name: partner?.name ?? "", phone: partner?.phone ?? "", area: partner?.area ?? "",
    commission_type: partner?.commission_type ?? "per_kw", commission_value: partner?.commission_value?.toString() ?? "",
    notes: partner?.notes ?? "", active: partner?.active ?? true,
  });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const qc = useQueryClient(); const toast = useToast();
  async function save() {
    setError("");
    const phone = normaliseMobile(f.phone);
    if (!f.name.trim()) return setError("Enter a name.");
    if (!phone) return setError("Enter a valid 10-digit mobile number.");
    setBusy(true);
    const row = { name: f.name.trim(), phone, area: f.area || null, commission_type: f.commission_type, commission_value: Number(f.commission_value || 0), notes: f.notes || null, active: f.active };
    const { error } = partner ? await supabase.from("partners").update(row).eq("id", partner.id) : await supabase.from("partners").insert(row);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    qc.invalidateQueries({ queryKey: ["partners"] }); toast(partner ? "Partner updated" : "Partner added"); onClose();
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet open onClose={onClose} title={partner ? "Edit partner" : "Add referral partner"}
      footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" loading={busy} onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Mobile"><input className="input" inputMode="tel" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Area"><input className="input" value={f.area} onChange={set("area")} placeholder="e.g. Thakurganj block" /></Field>
        <Field label="Commission type">
          <select className="input" value={f.commission_type} onChange={set("commission_type")}>
            <option value="per_kw">₹ per kW installed</option><option value="per_installation">₹ per installation</option><option value="percent">% of project value</option>
          </select>
        </Field>
        <Field label={f.commission_type === "percent" ? "Percent (%)" : "Amount (₹)"}><input className="input" inputMode="decimal" value={f.commission_value} onChange={set("commission_value")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={set("notes")} /></Field>
        {partner && (
          <label className="flex items-center justify-between rounded-xl border border-rule px-3 py-3 sm:col-span-2">
            <span className="text-sm font-semibold text-ink">Active partner</span>
            <input type="checkbox" className="h-5 w-5 accent-orange" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          </label>
        )}
        {error && <p className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger sm:col-span-2">{error}</p>}
      </div>
    </Sheet>
  );
}
