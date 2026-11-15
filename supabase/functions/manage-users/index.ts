// Topline Solar CRM: user management (only the Owner can create/edit users).
// Staff log in with mobile number + password. The mobile number is mapped to an
// internal email "<mobile>@users.toplinesolar.app" so no SMS provider is needed.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["owner", "office_manager", "sales", "partner"];
const mobileEmail = (m: string) => `${m}@users.toplinesolar.app`;
const validMobile = (m: string) => /^[6-9][0-9]{9}$/.test(m);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const body = await req.json();
    const action = body.action as string;

    // One-time setup: create the first Owner account when no users exist yet.
    if (action === "bootstrap") {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true });
      if ((count ?? 0) > 0) return json({ error: "Setup is already complete. Please log in." }, 400);
      const { full_name, mobile, password } = body;
      if (!full_name || !validMobile(mobile) || !password || password.length < 8)
        return json({ error: "Enter name, a valid 10-digit mobile and a password of at least 8 characters." }, 400);
      const { error } = await admin.auth.admin.createUser({
        email: mobileEmail(mobile), password, email_confirm: true,
        user_metadata: { full_name, phone: mobile }, app_metadata: { role: "owner" },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // Everything else: caller must be an active Owner.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: caller } = await admin.auth.getUser(token);
    if (!caller?.user) return json({ error: "Not signed in" }, 401);
    const { data: me } = await admin.from("profiles").select("role, active").eq("id", caller.user.id).single();
    if (!me || !me.active || me.role !== "owner") return json({ error: "Only the owner can manage users" }, 403);

    if (action === "create") {
      const { full_name, mobile, password, role, partner_id } = body;
      if (!full_name || !validMobile(mobile)) return json({ error: "Enter a name and a valid 10-digit mobile number." }, 400);
      if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
      if (!ROLES.includes(role)) return json({ error: "Unknown role" }, 400);
      if (role === "partner" && !partner_id) return json({ error: "Choose which referral partner this login is for." }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email: mobileEmail(mobile), password, email_confirm: true,
        user_metadata: { full_name, phone: mobile },
        app_metadata: { role, partner_id: role === "partner" ? partner_id : "" },
      });
      if (error) return json({ error: error.message.includes("already") ? "A user with this mobile number already exists." : error.message }, 400);
      return json({ ok: true, id: data.user?.id });
    }

    if (action === "update") {
      const { id, full_name, role, active, partner_id } = body;
      if (id === caller.user.id && (active === false || (role && role !== "owner")))
        return json({ error: "You cannot remove your own owner access." }, 400);
      const patch: Record<string, unknown> = {};
      if (full_name !== undefined) patch.full_name = full_name;
      if (role !== undefined) { if (!ROLES.includes(role)) return json({ error: "Unknown role" }, 400); patch.role = role; }
      if (active !== undefined) patch.active = !!active;
      if (partner_id !== undefined) patch.partner_id = partner_id || null;
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      if (active === false) await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
      if (active === true) await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const { id, password } = body;
      if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
