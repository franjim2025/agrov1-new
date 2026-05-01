import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shield, Save } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { AuthGate } from "@/components/AuthGate";
import { DataTable } from "@/components/DataTable";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administración — App Negocios Agro" }] }),
  component: () => (
    <AuthGate section="admin">
      <AdminPage />
    </AuthGate>
  ),
});

type Perfil = {
  id: string;
  user_id?: string | null;
  nombre_completo: string | null;
  correo?: string | null;
  email?: string | null;
  tipo_negocio?: string | null;
  rol?: string | null;
  profile_role?: string | null;
  created_at?: string;
};

const ROLES = ["admin", "dueño", "secretaria", "agricultor"] as const;

function AdminPage() {
  const [rows, setRows] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Detectar qué columna de rol existe realmente en la tabla
  const roleColumn = useMemo<"profile_role" | "rol">(() => {
    if (rows.length === 0) return "profile_role";
    const sample = rows[0];
    if (Object.prototype.hasOwnProperty.call(sample, "profile_role")) return "profile_role";
    return "rol";
  }, [rows]);

  const getRol = (p: Perfil) => (p.profile_role ?? p.rol ?? "") as string;
  const getCorreo = (p: Perfil) => p.correo ?? p.email ?? "—";

  async function load() {
    setLoading(true);
    const { data, error, count } = await supabase
      .from("perfiles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const list = (data as Perfil[]) ?? [];
    setRows(list);
    setLoading(false);
    // Si la consulta devolvió menos filas de las que existen (típico por RLS),
    // avisamos al dueño para que ajuste la policy en Supabase.
    if (!error && count !== null && count !== undefined && list.length < count) {
      toast.warning(
        `Solo ves ${list.length} de ${count} perfiles. Falta una policy RLS que permita al rol "dueño" leer todos los perfiles.`,
      );
    } else if (!error && list.length <= 1) {
      // Heurística: si solo aparece 1 fila, casi seguro es por RLS restrictiva.
      console.warn(
        "[admin] Solo se cargó 1 perfil. Probablemente la RLS de 'perfiles' solo permite ver el perfil propio. Agrega una policy para que el rol 'dueño' lea todos.",
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveRol(p: Perfil) {
    const actual = getRol(p);
    const nuevo = drafts[p.id] ?? actual;
    if (!nuevo || nuevo === actual) return;
    setSavingId(p.id);

    // Intento 1: columna detectada
    let { error } = await supabase
      .from("perfiles")
      .update({ [roleColumn]: nuevo })
      .eq("id", p.id);

    // Fallback: si la columna detectada no existe, probar la otra
    if (error && /column .* does not exist/i.test(error.message)) {
      const alt = roleColumn === "profile_role" ? "rol" : "profile_role";
      const retry = await supabase
        .from("perfiles")
        .update({ [alt]: nuevo })
        .eq("id", p.id);
      error = retry.error;
    }

    setSavingId(null);
    if (error) return toast.error("No se pudo actualizar el rol: " + error.message);
    toast.success(`Rol actualizado a "${nuevo}"`);
    setDrafts((d) => {
      const { [p.id]: _omit, ...rest } = d;
      return rest;
    });
    load();
  }

  return (
    <AppLayout
      title="Administración"
      subtitle="Gestión de usuarios y roles"
      actions={
        <span className="inline-flex items-center gap-2 rounded-xl bg-info/15 text-info px-4 py-2 text-xs font-black uppercase tracking-wider">
          <Shield className="h-4 w-4" /> Solo dueño
        </span>
      }
    >
      <DataTable<Perfil>
        loading={loading}
        rows={rows}
        empty="No hay perfiles registrados."
        columns={[
          {
            key: "nombre",
            label: "Nombre",
            render: (r) => (
              <span className="font-black text-foreground">{r.nombre_completo ?? "—"}</span>
            ),
          },
          {
            key: "correo",
            label: "Correo",
            render: (r) => <span className="text-muted-foreground">{getCorreo(r)}</span>,
          },
          {
            key: "rol_actual",
            label: "Rol actual",
            align: "center",
            render: (r) => (
              <span className="inline-flex items-center rounded-full bg-surface-elevated px-3 py-1 text-[10px] font-black uppercase tracking-wider text-foreground ring-1 ring-border">
                {getRol(r) || "sin rol"}
              </span>
            ),
          },
          {
            key: "asignar",
            label: "Cambiar rol",
            align: "center",
            render: (r) => {
              const actual = getRol(r);
              const draft = drafts[r.id] ?? actual;
              return (
                <div className="inline-flex items-center gap-2">
                  <select
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                    className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:border-primary outline-none"
                  >
                    <option value="">—</option>
                    {ROLES.map((rol) => (
                      <option key={rol} value={rol}>
                        {rol}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => saveRol(r)}
                    disabled={savingId === r.id || !draft || draft === actual}
                    className="inline-flex items-center gap-1 rounded-lg bg-gradient-primary text-primary-foreground px-3 py-1.5 text-[10px] font-black uppercase tracking-wider shadow-glow hover:scale-105 transition-smooth disabled:opacity-40 disabled:hover:scale-100"
                  >
                    <Save className="h-3 w-3" />
                    {savingId === r.id ? "…" : "Guardar"}
                  </button>
                </div>
              );
            },
          },
        ]}
      />

      <div className="mt-6 rounded-2xl border border-border bg-surface-elevated/40 p-4 text-xs text-muted-foreground">
        Roles disponibles: <strong className="text-foreground">admin</strong>,{" "}
        <strong className="text-foreground">dueño</strong>,{" "}
        <strong className="text-foreground">secretaria</strong>,{" "}
        <strong className="text-foreground">agricultor</strong>. Acceso restringido al rol{" "}
        <strong className="text-foreground">dueño</strong>.
      </div>
    </AppLayout>
  );
}
