import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Home, Users, CalendarClock, Handshake, UserCog, Settings, LogOut, Plus, Menu, Upload, Trash2, X, FolderKanban, FileCheck2, FileText, Wallet } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { ROLE_LABEL } from "../lib/types";
import { Avatar, cx } from "./ui";
import { NewLeadSheet } from "./NewLeadSheet";

export function Layout() {
  const { profile, signOut } = useAuth();
  const p = can(profile?.role);
  const [newOpen, setNewOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const nav = useNavigate();

  const main: { to: string; label: string; icon: typeof Home; end?: boolean }[] = [
    { to: "/", label: "Today", icon: Home, end: true },
    { to: "/leads", label: "Leads", icon: Users },
    { to: "/projects", label: "Projects", icon: FolderKanban },
    { to: "/followups", label: "Follow-ups", icon: CalendarClock },
    { to: "/quotes", label: "Quotations", icon: FileText },
    ...(p.assignLeads ? [{ to: "/money", label: "Money", icon: Wallet }] : []),
  ];
  const more = [
    { to: "/followups", label: "Follow-ups", icon: CalendarClock, mobileOnly: true },
    p.assignLeads && { to: "/money", label: "Money", icon: Wallet, mobileOnly: true },
    { to: "/quotes", label: "Quotations", icon: FileText, mobileOnly: true },
    p.assignLeads && { to: "/documents", label: "Documents to check", icon: FileCheck2 },
    p.managePartners && { to: "/partners", label: "Referral partners", icon: Handshake },
    p.importLeads && { to: "/import", label: "Import from Excel", icon: Upload },
    p.manageUsers && { to: "/users", label: "Users & roles", icon: UserCog },
    p.manageSettings && { to: "/settings", label: "Settings", icon: Settings },
    p.deleteRecords && { to: "/trash", label: "Trash", icon: Trash2 },
  ].filter(Boolean) as { to: string; label: string; icon: typeof Home; mobileOnly?: boolean }[];

  const link = ({ isActive }: { isActive: boolean }) =>
    cx("flex items-center gap-3 rounded-xl px-3 h-11 text-[15px] font-medium transition",
      isActive ? "bg-white/10 text-white" : "text-white/65 hover:text-white hover:bg-white/5");

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy px-4 py-5 lg:flex">
        <img src="/brand/topline-solar-logo-horizontal-dark.svg" alt="Topline Solar" className="mb-7 h-9 w-auto self-start px-2" />
        <button onClick={() => setNewOpen(true)} className="mb-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-orange font-semibold text-white transition hover:bg-orange-dark">
          <Plus className="h-5 w-5" /> New lead
        </button>
        <nav className="flex flex-col gap-1">
          {main.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={link}><i.icon className="h-5 w-5" />{i.label}</NavLink>)}
          {more.some((i) => !i.mobileOnly) && <div className="mx-3 my-3 h-px bg-white/10" />}
          {more.filter((i) => !i.mobileOnly).map((i) => <NavLink key={i.to} to={i.to} className={link}><i.icon className="h-5 w-5" />{i.label}</NavLink>)}
        </nav>
        <div className="mt-auto flex items-center gap-3 rounded-xl px-2 py-2">
          {profile && <Avatar name={profile.full_name} size={34} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile?.full_name}</p>
            <p className="text-xs text-white/55">{profile && ROLE_LABEL[profile.role]}</p>
          </div>
          <button onClick={() => { signOut(); nav("/"); }} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-navy px-4 lg:hidden">
        <img src="/brand/topline-solar-logo-horizontal-dark.svg" alt="Topline Solar" className="h-7 w-auto" />
        {profile && <Avatar name={profile.full_name} size={30} />}
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        <Outlet context={{ openNewLead: () => setNewOpen(true) }} />
      </main>

      {/* Mobile bottom bar */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-white lg:hidden">
        <div className="grid h-16 grid-cols-5">
          {main.slice(0, 2).map((i) => <BottomLink key={i.to} {...i} />)}
          <div className="flex items-center justify-center">
            <button onClick={() => setNewOpen(true)} aria-label="New lead" className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-orange text-white shadow-pop active:scale-95">
              <Plus className="h-7 w-7" />
            </button>
          </div>
          <BottomLink {...main[2]} />
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
            <Menu className="h-5 w-5" /> More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-navy/40" />
          <div className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3 px-1">
              {profile && <Avatar name={profile.full_name} />}
              <div className="flex-1"><p className="font-semibold text-ink">{profile?.full_name}</p><p className="text-sm text-muted">{profile && ROLE_LABEL[profile.role]}</p></div>
              <button onClick={() => setMoreOpen(false)} aria-label="Close" className="rounded-lg p-2 text-muted"><X className="h-5 w-5" /></button>
            </div>
            {more.map((i) => (
              <NavLink key={i.to} to={i.to} onClick={() => setMoreOpen(false)} className="flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-ink hover:bg-cloud">
                <i.icon className="h-5 w-5 text-muted" />{i.label}
              </NavLink>
            ))}
            <button onClick={() => { signOut(); nav("/"); }} className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-danger hover:bg-danger-tint">
              <LogOut className="h-5 w-5" /> Sign out
            </button>
          </div>
        </div>
      )}

      <NewLeadSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function BottomLink({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Home; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => cx("flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium", isActive ? "text-orange" : "text-muted")}>
      <Icon className="h-5 w-5" />{label}
    </NavLink>
  );
}
