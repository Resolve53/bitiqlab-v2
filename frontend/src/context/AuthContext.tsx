import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";
import { apiFetch } from "@/lib/api";
import {
  clearSession,
  getAccessToken,
  getStoredUser,
  setSession,
  type StoredUser,
} from "@/lib/auth-storage";

interface AuthContextValue {
  user: StoredUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_ROUTES = ["/login", "/register"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const me = await apiFetch<StoredUser>("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(me);
      localStorage.setItem("bitiq_user", JSON.stringify(me));
    } catch {
      clearSession();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) setUser(stored);
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  useEffect(() => {
    if (loading) return;
    const path = router.pathname;
    const isPublic = PUBLIC_ROUTES.includes(path);
    const token = getAccessToken();

    if (!token && !isPublic) {
      router.replace(`/login?redirect=${encodeURIComponent(path)}`);
      return;
    }
    if (token && isPublic) {
      router.replace("/dashboard");
    }
  }, [loading, router.pathname, router, user]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<{
        access_token: string;
        refresh_token: string;
        user: StoredUser;
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });

      setSession(data.access_token, data.refresh_token, data.user);
      setUser(data.user);

      const redirect =
        typeof router.query.redirect === "string"
          ? router.query.redirect
          : "/dashboard";
      await router.replace(redirect.startsWith("/") ? redirect : "/dashboard");
    },
    [router]
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearSession();
    setUser(null);
    await router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser }),
    [user, loading, login, logout, refreshUser]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
