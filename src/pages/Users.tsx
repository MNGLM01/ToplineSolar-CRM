import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, KeyRound } from "lucide-react";
import { callManageUsers } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { usePartners, useProfiles } from "../lib/queries";
import { fmtPhone, normaliseMobile } from "../lib/format";
import { ROLE_LABEL, type Profile, type Role } from "../lib/types";
import { Avatar, Button, Field, PageHeader, PageLoader, Sheet, cx, useToast } from "../components/ui";

const ROLE_HELP: Record<Role, string> = {
  owner: "Sees and controls everything, including revenue, profit, users and settings.",
  office_manager: "Runs leads, assigns them to sales and manages partners. Cannot see revenue or profit totals, delete records or change settings.",
  sales: "Sees only the leads assigned to them. Calls, follow-ups, stages and notes.",
  partner: "Refers customers and sees the status of their own referrals only.",
};

export default function Users() {
  const { profile: me } = useAuth();
  const { data: users, isLoading } = useProfiles();
  const { data: partners } = usePartners();
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [resetFor, setResetFor] = useState<Profile | null>(null);

  return (
    <div>
      <PageHeader title="Users & roles" subtitle="Who can log in, and what they can see"
        actions={<Button onClick={() => setEditing("new")}><UserPlus className="h-4 w-4" />Add user</Button>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <div key={r} className="rounded-xl border border-rule bg-white px-4 py-3"><p className="text-sm font-semibold text-ink">{ROLE_LABEL[r]}</p><p className="text-xs text-muted">{ROLE_HELP[r]}</p></div>
        ))}
      </div>
      <div className="card divide-y divide-rule/70">
        {isLoading ? <PageLoader /> : users?.map((u) => (
          <div key={u.id} className={cx("flex items-center gap-3 px-4 py-3", !u.active && "opacity-50")}>
            <Avatar name={u.full_name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{u.full_name}{u.id === me?.id && <span className="font-normal text-muted"> (you)</span>}</p>
              <p className="truncate text-sm text-muted">{fmtPhone(u.phone)} · {ROLE_LABEL[u.role]}{u.role === "partner" && u.partner_id ? ` · ${partners?.find((x) => x.id === u.partner_id)?.name ?? ""}` : ""}{!u.active && " · Switched off"}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setResetFor(u)} aria-label="Reset password"><KeyRound className="h-4 w-4" /><span className="hidden sm:inline">Password</span></Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>Edit</Button>
          </div>
        ))}
      </div>
      {editing && <UserSheet user={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {resetFor && <ResetSheet user={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
}

function UserSheet({ user, onClose }: { user: Profile | null; onClose: () => void }) {
  const { profile: me } = useAuth();
  const { data: partners } = usePartners();
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ full_name: user?.full_name ?? "", mobile: user?.phone ?? "", password: "", role: (user?.role ?? "sales") as Role, partner_id: user?.partner_id ?? "", active: user?.active ?? true });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const self = user?.id === me?.id;

  async function save() {
    setError("");
    if (!f.full_name.trim()) return setError("Enter a name.");
    if (f.role === "partner" && !f.partner_id) return setError("Choose which referral partner this login is for.");
    setBusy(true);
    try {
      if (user) await callManageUsers({ action: "update", id: user.id, full_name: f.full_name.trim(), role: f.role, active: f.active, partner_id: f.role === "partner" ? f.partner_id : null });
      else {
        const m = normaliseMobile(f.mobile);
        if (!m) throw new Error("Enter a valid 10-digit mobile number.");
        if (f.password.length < 8) throw new Error("Password must be at least 8 characters.");
        await callManageUsers({ action: "create", full_name: f.full_name.trim(), mobile: m, password: f.password, role: f.role, partner_id: f.partner_id });
      }
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast(user ? "User updated" : "User added. Share the mobile number and password with them.");
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  return (
    <Sheet open onClose={onClose} title={user ? "Edit user" : "Add user"}
      footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" loading={busy} onClick={save}>{user ? "Save" : "Add user"}</Button></>}>
      <div className="grid gap-4">
        <Field label="Full name"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        {!user && <>
          <Field label="Mobile number" hint="They sign in with this number"><input className="input" inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
          <Field label="Password" hint="At least 8 characters. Share it with them privately."><input className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        </>}
        <div>
          <span className="label">Role</span>
          <div className="grid gap-2">
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <label key={r} className={cx("flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5", f.role === r ? "border-orange bg-orange-tint" : "border-rule", self && r !== "owner" && "pointer-events-none opacity-40")}>
                <input type="radio" className="mt-1 accent-orange" checked={f.role === r} onChange={() => setF({ ...f, role: r })} />
                <span><span className="block text-sm font-semibold text-ink">{ROLE_LABEL[r]}</span><span className="block text-xs text-muted">{ROLE_HELP[r]}</span></span>
              </label>
            ))}
          </div>
        </div>
        {f.role === "partner" && (
          <Field label="Referral partner" hint="Add the partner on the Referral partners page first">
            <select className="input" value={f.partner_id} onChange={(e) => setF({ ...f, partner_id: e.target.value })}>
              <option value="">Select</option>{partners?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
        )}
        {user && !self && (
          <label className="flex items-center justify-between rounded-xl border border-rule px-3 py-3">
            <span><span className="block text-sm font-semibold text-ink">Can log in</span><span className="block text-xs text-muted">Switch off when someone leaves. Their records stay.</span></span>
            <input type="checkbox" className="h-5 w-5 accent-orange" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          </label>
        )}
        {error && <p className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

function ResetSheet({ user, onClose }: { user: Profile; onClose: () => void }) {
  const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const toast = useToast();
  async function save() {
    setBusy(true); setError("");
    try { await callManageUsers({ action: "reset_password", id: user.id, password: pw }); toast("Password changed"); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }
  return (
    <Sheet open onClose={onClose} title={`New password for ${user.full_name}`}
      footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" loading={busy} disabled={pw.length < 8} onClick={save}>Set password</Button></>}>
      <Field label="New password" hint="At least 8 characters"><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></Field>
      {error && <p className="mt-3 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}
    </Sheet>
  );
}
