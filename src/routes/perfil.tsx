import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, User } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/perfil")({
  head: () => ({ meta: [{ title: "Mi Perfil — App Negocios Agro" }] }),
  component: () => (
    <AuthGate section="perfil">
      <PerfilPage />
    </AuthGate>
  ),
});

function PerfilPage() {
  const { user, rol, nombreCompleto } = useAuth();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [saving, setSaving] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 6) return toast.error("La contraseña debe tener al menos 6 caracteres");
    if (pwd !== pwd2) return toast.error("Las contraseñas no coinciden");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Contraseña actualizada");
    setPwd("");
    setPwd2("");
  }

  const inp =
    "w-full bg-background border border-border rounded-xl p-3 text-foreground text-sm focus:border-primary outline-none";

  return (
    <AppLayout title="Mi Perfil" subtitle="Datos de tu cuenta y seguridad">
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-gradient-surface p-6 shadow-elegant">
          <div className="flex items-center gap-3 mb-5">
            <div className="bg-primary/15 text-primary p-2.5 rounded-xl">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-foreground">Cuenta</h2>
              <p className="text-xs text-muted-foreground">Información básica</p>
            </div>
          </div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Nombre</dt>
              <dd className="text-foreground font-bold">{nombreCompleto || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Correo</dt>
              <dd className="text-foreground">{user?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Rol</dt>
              <dd className="text-foreground uppercase">{rol ?? "Sin rol"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-gradient-surface p-6 shadow-elegant">
          <div className="flex items-center gap-3 mb-5">
            <div className="bg-warning/15 text-warning p-2.5 rounded-xl">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-foreground">Cambiar contraseña</h2>
              <p className="text-xs text-muted-foreground">Mínimo 6 caracteres</p>
            </div>
          </div>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black tracking-widest uppercase text-muted-foreground mb-1.5">
                Nueva contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className="block text-[10px] font-black tracking-widest uppercase text-muted-foreground mb-1.5">
                Confirmar contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                className={inp}
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-gradient-primary text-primary-foreground font-black py-3 shadow-glow hover:scale-[1.01] transition-smooth disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Actualizar contraseña"}
            </button>
          </form>
        </section>
      </div>
    </AppLayout>
  );
}
