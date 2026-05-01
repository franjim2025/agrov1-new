import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Leaf } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Iniciar sesión — App Negocios Agro" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const { error } =
      mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (error) {
      setError(error);
    } else if (mode === "signup") {
      setInfo("Cuenta creada. Si tu proyecto requiere confirmar correo, revisa tu bandeja. Si no, ya puedes iniciar sesión.");
      setMode("signin");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-gradient-surface shadow-elegant p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-gradient-primary p-2.5 rounded-xl shadow-glow">
            <Leaf className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="text-foreground font-black tracking-tight leading-none">
              APP NEGOCIOS
            </div>
            <div className="text-primary text-xs font-bold tracking-widest mt-1">AGRO</div>
          </div>
        </div>

        <h1 className="text-2xl font-black text-foreground tracking-tight mb-1">
          {mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Accede para gestionar inventario, ventas y compras.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 rounded-xl border border-success/40 bg-success/10 p-3 text-sm text-success">
            {info}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black tracking-widest uppercase text-muted-foreground mb-1.5">
              Correo
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-background border border-border rounded-xl p-3 text-foreground text-sm focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black tracking-widest uppercase text-muted-foreground mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-background border border-border rounded-xl p-3 text-foreground text-sm focus:border-primary outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-primary text-primary-foreground font-black py-3 shadow-glow hover:scale-[1.02] transition-smooth disabled:opacity-60"
          >
            {loading ? "…" : mode === "signin" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="mt-6 w-full text-xs text-muted-foreground hover:text-foreground transition-smooth"
        >
          {mode === "signin"
            ? "¿No tienes cuenta? Regístrate"
            : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </div>
  );
}
