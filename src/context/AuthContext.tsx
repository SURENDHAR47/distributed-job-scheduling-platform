import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { engine, ApiError } from "../lib/engine";
import type { AuthSession, Role, User } from "../types";

interface AuthCtx {
  user: User | null;
  token: string | null;
  currentOrgId: string | null;
  setCurrentOrgId: (id: string) => void;
  roleInOrg: (orgId: string) => Role | null;
  can: (roles: Role[]) => boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  error: string | null;
  loading: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

const TOKEN_KEY = "pulsar.token";
const ORG_KEY = "pulsar.orgId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => engine.sessionFromToken(localStorage.getItem(TOKEN_KEY)));
  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(() => localStorage.getItem(ORG_KEY));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user && token) {
      const u = engine.sessionFromToken(token);
      if (u) setUser(u);
      else { localStorage.removeItem(TOKEN_KEY); setToken(null); }
    }
  }, [token, user]);

  useEffect(() => {
    if (user && !currentOrgId) {
      const orgs = engine.listOrganizations(user.id);
      if (orgs[0]) setCurrentOrgIdState(orgs[0].id);
    }
  }, [user, currentOrgId]);

  const applySession = (session: AuthSession) => {
    localStorage.setItem(TOKEN_KEY, session.token);
    setToken(session.token);
    setUser(session.user);
  };

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true); setError(null);
    try {
      const session = await engine.login(email, password);
      applySession(session);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Login failed");
      throw e;
    } finally { setLoading(false); }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    setLoading(true); setError(null);
    try {
      const session = await engine.register(email, name, password);
      applySession(session);
      const org = await engine.createOrganization(session.user.id, `${name.split(" ")[0]}'s Organization`);
      await engine.createProject(org.id, "Default Project", "Automatically created for you");
      setCurrentOrgId(org.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Registration failed");
      throw e;
    } finally { setLoading(false); }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const setCurrentOrgId = useCallback((id: string) => {
    localStorage.setItem(ORG_KEY, id);
    setCurrentOrgIdState(id);
  }, []);

  const roleInOrg = useCallback((orgId: string) => (user ? engine.roleOf(user.id, orgId) : null), [user]);
  const can = useCallback((roles: Role[]) => {
    if (!user || !currentOrgId) return false;
    const role = engine.roleOf(user.id, currentOrgId);
    return !!role && roles.includes(role);
  }, [user, currentOrgId]);

  const value = useMemo<AuthCtx>(() => ({
    user, token, currentOrgId, setCurrentOrgId, roleInOrg, can, login, register, logout, error, loading,
  }), [user, token, currentOrgId, setCurrentOrgId, roleInOrg, can, login, register, logout, error, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
