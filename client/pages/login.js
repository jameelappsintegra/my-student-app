import { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { api } from "../services/api";
import { safeNext } from "../context/auth";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.auth.login(username.trim(), password);
      // Full navigation so the app re-checks the new session.
      window.location.assign(safeNext(router.query.next));
    } catch (err) {
      setError(err.message);
      setPassword("");
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Sign in · EduPro</title>
      </Head>
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <form
          onSubmit={submit}
          noValidate
          className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div>
            <p className="text-2xl font-bold text-primary">EduPro</p>
            <h1 className="text-lg font-semibold text-slate-900 mt-2">Sign in</h1>
            <p className="text-sm text-slate-500">School staff only.</p>
          </div>
          {error && (
            <div className="alert alert-error py-2" role="alert">
              <span>{error}</span>
            </div>
          )}
          <div className="form-control">
            <label className="label" htmlFor="username">
              <span className="label-text font-medium">Username</span>
            </label>
            <input
              id="username"
              className="input input-bordered"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="form-control">
            <label className="label" htmlFor="password">
              <span className="label-text font-medium">Password</span>
            </label>
            <input
              id="password"
              type="password"
              className="input input-bordered"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className={`btn btn-primary w-full ${busy ? "loading" : ""}`}
            disabled={busy}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    </>
  );
}
