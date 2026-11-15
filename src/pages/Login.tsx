import { useEffect, useState, type FormEvent } from "react";
import { supabase, callManageUsers, mobileToEmail } from "../lib/supabase";
import { normaliseMobile } from "../lib/format";
import { Button, Field } from "../components/ui";

export default function Login() {
  const [setup, setSetup] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { supabase.rpc("setup_needed").then(({ data }) => setSetup(!!data)); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    const m = normaliseMobile(mobile);
    if (!m) return setError("Enter your 10-digit mobile number.");
    if (password.length < (setup ? 8 : 1)) return setError(setup ? "Choose a password of at least 8 characters." : "Enter your password.");
    setBusy(true);
    try {
      if (setup) {
        if (!name.trim()) throw new Error("Enter your name.");
        await callManageUsers({ action: "bootstrap", full_name: name.trim(), mobile: m, password });
      }
      const { error } = await supabase.auth.signInWithPassword({ email: mobileToEmail(m), password });
      if (error) throw new Error(error.message.includes("Invalid") ? "Mobile number or password is wrong." : error.message.includes("banned") ? "This account has been switched off. Ask the owner." : error.message);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setBusy(false);
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 lg:flex">
        <img src="/brand/pattern-white.svg" alt="" className="pointer-events-none absolute -right-24 -top-24 w-[560px] opacity-[.05]" />
        <img src="/brand/topline-solar-logo-horizontal-dark.svg" alt="Topline Solar" className="relative h-12 w-auto self-start" />
        <div className="relative">
          <h1 className="text-5xl font-black leading-tight text-white">Powering Seemanchal<br />with the sun.</h1>
          <span className="mt-6 block h-1.5 w-16 rounded-full bg-orange" />
          <p className="mt-6 max-w-md text-lg text-white/70">Every lead, every follow-up and every installation in one place.</p>
        </div>
        <p className="relative text-sm text-white/40">Kishanganj · Purnea · Katihar · Araria</p>
      </div>

      <div className="flex flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <img src="/brand/topline-solar-logo-horizontal.svg" alt="Topline Solar" className="mb-10 h-11 w-auto lg:hidden" />
          <h2 className="text-2xl font-extrabold">{setup ? "Set up your CRM" : "Sign in"}</h2>
          <p className="mb-7 mt-1 text-muted">{setup ? "Create the owner account. You'll add your team after this." : "Use the mobile number and password the owner gave you."}</p>
          {setup === null ? null : (
            <form onSubmit={submit} className="grid gap-4">
              {setup && <Field label="Your name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
              <Field label="Mobile number">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted">+91</span>
                  <input className="input pl-12" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98765 43210" />
                </div>
              </Field>
              <Field label={setup ? "Choose a password" : "Password"}>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={setup ? "new-password" : "current-password"} />
              </Field>
              {error && <p className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}
              <Button type="submit" size="lg" loading={busy} className="mt-1 w-full">{setup ? "Create owner account" : "Sign in"}</Button>
              {!setup && <p className="text-center text-sm text-muted">Forgot your password? Ask the owner to reset it.</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
