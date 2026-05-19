import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AdminLogin from "./AdminLogin";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://crunches-training.fly.dev";
const AUTH_TOKEN_KEY = "crunches_admin_token";
const AUTH_ADMIN_KEY = "crunches_admin_user";

const AdminAuthContext = createContext(null);

function readStoredAdmin() {
  try {
    const raw = localStorage.getItem(AUTH_ADMIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AdminAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY) || "");
  const [admin, setAdmin] = useState(readStoredAdmin);
  const [authReady, setAuthReady] = useState(false);

  const logout = useCallback(() => {
    setToken("");
    setAdmin(null);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_ADMIN_KEY);
  }, []);

  const api = useCallback(
    async (path, options = {}) => {
      const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
      });
      const body = await response.json().catch(() => ({}));

      if (response.status === 401) {
        logout();
        throw new Error(body.message || "Session expired. Please sign in again.");
      }

      if (!response.ok) {
        const serverMessage =
          body?.message || body?.error || body?.detail || body?.title;
        throw new Error(serverMessage || `Request failed (${response.status})`);
      }
      return body;
    },
    [token, logout]
  );

  const login = useCallback(async (email, password) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || "Login failed");
    }

    const newToken = body.token || "";
    const newAdmin = body.admin || null;
    setToken(newToken);
    setAdmin(newAdmin);
    localStorage.setItem(AUTH_TOKEN_KEY, newToken);
    localStorage.setItem(AUTH_ADMIN_KEY, JSON.stringify(newAdmin || {}));
    return newAdmin;
  }, []);

  useEffect(() => {
    if (!token) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/auth/me`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.message || "Session invalid");
        }
        if (!cancelled && data.admin) {
          setAdmin(data.admin);
          localStorage.setItem(AUTH_ADMIN_KEY, JSON.stringify(data.admin));
        }
      } catch {
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      token,
      admin,
      isAuthenticated: Boolean(token),
      isSuperAdmin: Boolean(admin?.isSuperAdmin),
      api,
      login,
      logout,
      apiBaseUrl: API_BASE_URL,
    }),
    [token, admin, api, login, logout]
  );

  if (!authReady) {
    return (
      <div className="app-initial-load" aria-live="polite">
        <div className="app-initial-load-spinner" aria-hidden="true" />
        <p className="app-initial-load-text">Loading…</p>
      </div>
    );
  }

  if (!token) {
    return <AdminLogin onLogin={login} />;
  }

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return context;
}
