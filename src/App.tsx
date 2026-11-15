import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { can, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Button, PageLoader } from "./components/ui";
import Login from "./pages/Login";
import Today from "./pages/Today";
import Leads from "./pages/Leads";
import LeadDetail from "./pages/LeadDetail";
import Followups from "./pages/Followups";

const Partners = lazy(() => import("./pages/Partners"));
const Users = lazy(() => import("./pages/Users"));
const Settings = lazy(() => import("./pages/Settings"));
const Trash = lazy(() => import("./pages/Trash"));
const Import = lazy(() => import("./pages/Import"));
const PartnerHome = lazy(() => import("./pages/PartnerHome"));

export default function App() {
  const { session, profile, loading, signOut } = useAuth();
  if (loading) return <div className="flex min-h-dvh items-center justify-center"><PageLoader /></div>;
  if (!session) return <Login />;
  if (!profile) return <div className="flex min-h-dvh items-center justify-center"><PageLoader /></div>;
  if (!profile.active)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <img src="/brand/topline-solar-logo-horizontal.svg" alt="Topline Solar" className="h-10" />
        <p className="max-w-sm text-body">Your account doesn't have access yet. Ask the owner to set it up.</p>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </div>
    );
  const p = can(profile.role);

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        {p.isPartner ? (
          <Routes><Route path="*" element={<PartnerHome />} /></Routes>
        ) : (
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Today />} />
              <Route path="leads" element={<Leads />} />
              <Route path="leads/:id" element={<LeadDetail />} />
              <Route path="followups" element={<Followups />} />
              {p.managePartners && <Route path="partners" element={<Partners />} />}
              {p.importLeads && <Route path="import" element={<Import />} />}
              {p.manageUsers && <Route path="users" element={<Users />} />}
              {p.manageSettings && <Route path="settings" element={<Settings />} />}
              {p.deleteRecords && <Route path="trash" element={<Trash />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        )}
      </Suspense>
    </BrowserRouter>
  );
}
