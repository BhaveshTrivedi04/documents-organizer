"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    const data = await res.json().catch(() => ({}));
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
        <p>Aadhar, PAN, policies and more. Find them in seconds.</p>
        <form onSubmit={submit}>
          {error && <div className="error">{error}</div>}
          <input
            className="input"
            type="password"
            placeholder="Family password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <button className="btn primary block" disabled={busy || !password}>
            {busy ? "Opening…" : "Open"}
          </button>
        </form>
      </div>
    </main>
  );
}
