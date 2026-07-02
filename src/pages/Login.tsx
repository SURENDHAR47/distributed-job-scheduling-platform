import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Radio } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, Input, Field } from "../components/ui";

export default function Login() {
  const { login, error, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@pulsar.dev");
  const [password, setPassword] = useState("password123");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      navigate("/");
    } catch { /* surfaced via context error */ }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-900/40">
            <Radio size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold">Sign in to Pulsar</h1>
          <p className="text-sm text-slate-500">Distributed job scheduling platform</p>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </Field>
          <Field label="Password">
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          {error && <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
        </form>

        <div className="mt-4 rounded-xl border border-slate-800/70 bg-slate-900/30 p-3 text-xs text-slate-500">
          <p className="mb-1 font-medium text-slate-400">Demo accounts (password: password123)</p>
          <p>admin@pulsar.dev · ADMIN — dev@pulsar.dev · DEVELOPER — viewer@pulsar.dev · VIEWER</p>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          No account? <Link to="/register" className="text-indigo-400 hover:text-indigo-300">Create one</Link>
        </p>
      </div>
    </div>
  );
}
