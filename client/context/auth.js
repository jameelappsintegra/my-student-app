import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { api } from "../services/api";
import { Loading } from "../components/common";

const AuthContext = createContext({ user: null, signOut: async () => {}, can: () => true, setUser: () => {} });
export const useAuth = () => useContext(AuthContext);

const PUBLIC_PAGES = ["/login", "/verify/[code]"];

// Only same-site relative paths, so ?next= cannot redirect off-site.
export function safeNext(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

// Checks the session once, then gates every non-public page on it.
// This is a convenience for the UI; the API enforces access on every request.
export function AuthProvider({ children }) {
  const router = useRouter();
  const [state, setState] = useState({ user: null, checked: false });
  const isPublic = PUBLIC_PAGES.includes(router.pathname);

  useEffect(() => {
    if (isPublic) return;
    let cancelled = false;
    api.auth
      .me()
      .then((res) => !cancelled && setState({ user: res.data.user, checked: true }))
      .catch(() => {
        if (cancelled) return;
        setState({ user: null, checked: true });
        router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
      });
    return () => {
      cancelled = true;
    };
    // Re-check only when moving between public and private areas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublic]);

  // Role colour theme (admin indigo, principal teal, teacher green, parent orange).
  useEffect(() => {
    const role = state.user?.role;
    const name = !role || role === "admin" ? "edupro" : `edupro-${role}`;
    document.documentElement.setAttribute("data-theme", name);
    const colors = { edupro: "#4f46e5", "edupro-principal": "#0f766e", "edupro-teacher": "#15803d", "edupro-parent": "#c2410c", "edupro-student": "#7c3aed" };
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colors[name]);
  }, [state.user?.role]);

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setState({ user: null, checked: true });
      router.replace("/login");
    }
  }, [router]);

  if (!isPublic && !state.user) {
    return <Loading label={state.checked ? "Redirecting to sign in…" : "Checking your session…"} />;
  }
  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        signOut,
        // UI convenience only: the API enforces every permission itself.
        can: (perm) => Boolean(state.user?.permissions?.includes(perm)),
        setUser: (user) => setState((s) => ({ ...s, user })),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
