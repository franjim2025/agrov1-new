import { Navigate } from "@tanstack/react-router";
import { useAuth, type Section } from "@/lib/auth";

export function AuthGate({ children, section }: { children: React.ReactNode; section?: Section }) {
  const { user, loading, can } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        Cargando sesión…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (section && !can(section)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-md">
          <h2 className="text-xl font-black text-foreground mb-2">Sin acceso</h2>
          <p className="text-sm text-muted-foreground">Tu rol no tiene permiso para ver esta sección.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
