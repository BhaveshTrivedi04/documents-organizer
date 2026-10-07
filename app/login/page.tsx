"use client";

import { useEffect, useState } from "react";
import { COMPANY } from "@/lib/contact";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // null while checking; true on the very first visit, before a password exists.
  const [setup, setSetup] = useState<boolean | null>(null);
  // The server couldn't check the password settings (e.g. storage not connected).
  const [problem, setProblem] = useState("");

  useEffect(() => {
    fetch("/api/login", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setProblem(data.error);
        else setSetup(Boolean(data.setup));
      })
      .catch(() => setProblem("Can't reach the site. Please check your internet and try again."));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (setup && password.trim() !== confirm.trim()) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, setup: Boolean(setup) }),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
      setSetup(false);
      setConfirm("");
    }
    setError(data.error ?? "Something went wrong. Please try again.");
    setBusy(false);
  }

  return (
    <main className="login">
      <div className="login-art" aria-hidden="true">
        <img src="/icon.svg" alt="" />
      </div>
      <div className="login-card">
        <h1 className="serif">
          Every family paper,
          <br />
          one calm place
        </h1>
        <p>
          {setup
            ? "Welcome! Choose a password for your family. Everyone at home will use it to open the app."
            : "Aadhar, PAN, policies and more. Find them in seconds."}
        </p>
        {problem && (
          <form onSubmit={(e) => (e.preventDefault(), window.location.reload())}>
            <div className="error">{problem}</div>
            <button className="btn primary block">Try again</button>
          </form>
        )}
        {!problem && setup !== null && (
          <form onSubmit={submit}>
            {error && <div className="error">{error}</div>}
            <input
              className="input"
              type="password"
              placeholder={setup ? "Choose a family password" : "Family password"}
              autoComplete={setup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {setup && (
              <input
                className="input"
                type="password"
                placeholder="Type it again"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
            <button className="btn primary block" disabled={busy || !password || (setup && !confirm)}>
              {busy ? "Opening…" : setup ? "Save password & open" : "Open"}
            </button>
          </form>
        )}
        <p className="login-brand">by {COMPANY}</p>
      </div>
    </main>
  );
}
