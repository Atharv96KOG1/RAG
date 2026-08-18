import { useState } from "react";
import type { FormEvent } from "react";
import { SparkleIcon } from "../icons";

interface Props {
  onLogin: (username: string, password: string) => void;
  loggingIn: boolean;
  error: string | null;
}

export function LoginScreen({ onLogin, loggingIn, error }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || loggingIn) return;
    onLogin(username.trim(), password);
  };

  return (
    <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            <SparkleIcon width={15} height={15} />
          </div>
          <h1 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            Sign in
          </h1>
        </div>

        <input
          type="text"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          className="rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--border-strong)", background: "var(--surface-2)", color: "var(--ink)" }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--border-strong)", background: "var(--surface-2)", color: "var(--ink)" }}
        />

        {error && (
          <p className="text-xs" style={{ color: "var(--danger, #d33)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loggingIn}
          className="rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:opacity-60"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          {loggingIn ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
