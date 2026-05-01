import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Rol = "dueño" | "duenio" | "dueno" | "gerente" | "secretaria" | "agricultor" | "conductor" | string;

export type Section =
  | "dashboard"
  | "inventario"
  | "ventas"
  | "compras"
  | "gastos"
  | "registro_uso"
  | "contactos"
  | "maestro"
  | "admin"
  | "perfil";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rol: string | null;
  nombreCompleto: string | null;
  can: (section: Section) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

function normalizeRol(r: string | null | undefined): string {
  if (!r) return "";
  return r
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function canFor(rol: string | null, section: Section): boolean {
  const r = normalizeRol(rol);
  if (!r) return false;
  // "Mi Perfil" siempre disponible para cualquier usuario autenticado
  if (section === "perfil") return true;
  // Admin section: solo dueño / admin
  if (section === "admin") {
    return r === "dueno" || r === "duenio" || r === "dueño" || r === "admin";
  }
  if (r === "dueno" || r === "duenio" || r === "dueño" || r === "gerente" || r === "admin") return true;
  if (r === "secretaria") {
    // Poblar datos + Tableros + Financieros
    return (
      section === "maestro" ||
      section === "contactos" ||
      section === "dashboard" ||
      section === "inventario" ||
      section === "compras" ||
      section === "ventas"
    );
  }
  if (r === "agricultor" || r === "conductor") {
    // Solo Operativos
    return section === "registro_uso" || section === "gastos";
  }
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rol, setRol] = useState<string | null>(null);
  const [nombreCompleto, setNombreCompleto] = useState<string | null>(null);

  async function loadPerfil(user: User | null | undefined, opts: { initial?: boolean } = {}) {
    if (!user?.id) {
      setRol(null);
      setNombreCompleto(null);
      setLoading(false);
      return;
    }

    // Solo mostramos "Cargando sesión…" en la carga inicial.
    // En refreshes de token / cambios de pestaña NO bloqueamos la UI
    // para evitar desmontar formularios abiertos.
    if (opts.initial) setLoading(true);
    const fallbackName = (user.email ?? "").split("@")[0] || "Usuario";

    // Intentamos por user_id (patrón usado por el resto de tablas) y por id (PK = auth.uid)
    // Traemos todos los campos para evitar quedarnos cortos.
    let perfil: Record<string, unknown> | null = null;
    let lastErr: string | null = null;

    const tryByUserId = await supabase
      .from("perfiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (tryByUserId.error) {
      lastErr = tryByUserId.error.message;
    } else if (tryByUserId.data) {
      perfil = tryByUserId.data as Record<string, unknown>;
    }

    if (!perfil) {
      const tryById = await supabase
        .from("perfiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (tryById.error) {
        lastErr = tryById.error.message;
      } else if (tryById.data) {
        perfil = tryById.data as Record<string, unknown>;
      }
    }

    if (!perfil) {
      if (lastErr) console.error("[auth] error cargando perfil:", lastErr);
      else console.warn("[auth] no existe fila en perfiles para este usuario");
      setRol(null);
      setNombreCompleto(fallbackName);
      if (opts.initial) setLoading(false);
      return;
    }

    const rolDb = (perfil.rol as string | null | undefined) ?? null;
    const nombreDb = (perfil.nombre_completo as string | null | undefined) ?? null;
    console.log("[auth] perfil cargado:", { rol: rolDb, nombre_completo: nombreDb });

    setRol(rolDb);
    setNombreCompleto(nombreDb && nombreDb.trim() ? nombreDb : (user.email ?? fallbackName));
    if (opts.initial) setLoading(false);
  }

  useEffect(() => {
    // 1) Carga inicial bloqueante para resolver sesión + perfil
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void loadPerfil(data.session?.user, { initial: true });
    });
    // 2) Cambios posteriores (refresh token, cambio de pestaña) NO deben
    //    poner loading=true ni desmontar las páginas activas.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Solo recargamos perfil en eventos relevantes, sin bloquear UI.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void loadPerfil(s?.user, { initial: false });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    user: session?.user ?? null,
    session,
    loading,
    rol,
    nombreCompleto,
    can: (section) => canFor(rol, section),
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    signUp: async (email, password) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      return { error: error?.message ?? null };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
