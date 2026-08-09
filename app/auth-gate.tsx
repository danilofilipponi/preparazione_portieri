"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(Boolean(supabase));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setSession(data.session);
      setError(sessionError?.message ?? null);
      setChecking(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setChecking(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setPassword("");
  }

  if (checking) {
    return <main className="auth-screen"><div className="auth-loading" role="status"><span className="auth-spinner" />Controllo della sessione…</div></main>;
  }

  if (!isSupabaseConfigured || !supabase) {
    return <main className="auth-screen"><section className="auth-card"><span className="auth-brand-mark">K</span><h1>Configurazione mancante</h1><p>Configura URL e chiave pubblica Supabase nelle variabili ambiente per avviare KeeperLab.</p></section></main>;
  }

  if (!session) {
    return (
      <main className="auth-screen">
        <section className="auth-card" aria-labelledby="login-title">
          <div className="auth-brand"><span className="auth-brand-mark">K</span><div><strong>KeeperLab</strong><small>Area preparatore portieri</small></div></div>
          <span className="eyebrow">Accesso riservato</span>
          <h1 id="login-title">Bentornato</h1>
          <p>Accedi con l’account Supabase autorizzato. La sessione resterà attiva su questo dispositivo.</p>
          <form onSubmit={signIn} className="auth-form">
            <div className="field"><label htmlFor="login-email">Email</label><input id="login-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></div>
            <div className="field"><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></div>
            {error ? <div className="auth-error" role="alert">{error}</div> : null}
            <button className="primary auth-submit" type="submit" disabled={submitting}>{submitting ? "Accesso in corso…" : "Accedi"}</button>
          </form>
        </section>
      </main>
    );
  }

  return children;
}
