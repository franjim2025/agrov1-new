import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  TrendingUp,
  Wallet,
  Boxes,
  Sprout,
  AlertTriangle,
  PackageX,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { AppLayout } from "@/components/AppLayout";
import { AuthGate } from "@/components/AuthGate";
import { StatCard } from "@/components/StatCard";
import { supabase, fmtMoney, fmtNum } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — App Negocios Agro" },
      { name: "description", content: "Resumen ejecutivo: ventas, compras, gastos y alertas de inventario." },
    ],
  }),
  component: () => (
    <AuthGate>
      <DashboardPage />
    </AuthGate>
  ),
});

type Producto = { id: string; nombre: string | null };
type AlertaStock = {
  producto_id: string;
  nombre: string;
  stock_actual: number;
  stock_minimo: number;
  agotado: boolean;
};

type Totals = {
  ingresosMes: number;
  comprasMes: number;
  gastosMes: number;
  ingresosTotal: number;
  serie: { mes: string; ingresos: number; gastos: number; compras: number }[];
  alertas: AlertaStock[];
  agotados: number;
  bajos: number;
};

function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Dashboard consolidado: muestra datos de todo el negocio (RLS controla acceso)
        const [vRes, gRes, cRes, iRes, mRes] = await Promise.all([
          supabase.from("ventas_cosecha").select("fecha,total,subtotal"),
          supabase.from("gastos_operativos").select("fecha,valor"),
          supabase.from("compras").select("fecha,total,subtotal"),
          supabase.from("inventario").select("producto_id,stock_actual,stock_minimo"),
          supabase.from("maestro_items").select("id,nombre"),
        ]);

        if (vRes.error) throw vRes.error;
        if (gRes.error) throw gRes.error;
        if (cRes.error) throw cRes.error;
        if (iRes.error) throw iRes.error;
        if (mRes.error) throw mRes.error;

        const ventas = vRes.data ?? [];
        const gastos = gRes.data ?? [];
        const compras = cRes.data ?? [];
        const inv = (iRes.data ?? []) as { producto_id: string; stock_actual: number; stock_minimo: number }[];
        const items = (mRes.data ?? []) as Producto[];
        const itemMap = new Map(items.map((i) => [i.id, i.nombre || "—"]));

        const now = new Date();
        const curKey = now.toISOString().slice(0, 7);
        const sumMonth = (arr: any[], field: string) =>
          arr
            .filter((r) => (r.fecha ?? "").slice(0, 7) === curKey)
            .reduce((s, r) => s + Number(r[field] || 0), 0);

        const ingresosMes = sumMonth(ventas, "total") || sumMonth(ventas, "subtotal");
        const comprasMes = sumMonth(compras, "total") || sumMonth(compras, "subtotal");
        const gastosMes = sumMonth(gastos, "valor");
        const ingresosTotal = ventas.reduce(
          (s: number, r: any) => s + Number(r.total || r.subtotal || 0),
          0,
        );

        const meses: Record<string, { ingresos: number; gastos: number; compras: number }> = {};
        const mk = (d: string) => (d ?? "").slice(0, 7);
        for (const r of ventas as any[]) {
          const k = mk(r.fecha);
          if (!k) continue;
          meses[k] = meses[k] ?? { ingresos: 0, gastos: 0, compras: 0 };
          meses[k].ingresos += Number(r.total || r.subtotal || 0);
        }
        for (const r of gastos as any[]) {
          const k = mk(r.fecha);
          if (!k) continue;
          meses[k] = meses[k] ?? { ingresos: 0, gastos: 0, compras: 0 };
          meses[k].gastos += Number(r.valor || 0);
        }
        for (const r of compras as any[]) {
          const k = mk(r.fecha);
          if (!k) continue;
          meses[k] = meses[k] ?? { ingresos: 0, gastos: 0, compras: 0 };
          meses[k].compras += Number(r.total || r.subtotal || 0);
        }
        const serie = Object.entries(meses)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-8)
          .map(([mes, v]) => ({ mes, ...v }));

        const alertas: AlertaStock[] = inv
          .filter((r) => {
            const actual = Number(r.stock_actual || 0);
            const minimo = Number(r.stock_minimo || 0);
            // Considera alerta si está por debajo del mínimo, o por debajo del 20% de un mínimo definido
            const umbralBajo = minimo > 0 ? minimo : 0;
            const veintePct = minimo > 0 ? minimo * 1.2 : 0;
            return actual <= umbralBajo || (minimo > 0 && actual <= veintePct);
          })
          .map((r) => ({
            producto_id: r.producto_id,
            nombre: itemMap.get(r.producto_id) || "Producto",
            stock_actual: Number(r.stock_actual || 0),
            stock_minimo: Number(r.stock_minimo || 0),
            agotado: Number(r.stock_actual || 0) <= 0,
          }))
          .sort((a, b) => Number(b.agotado) - Number(a.agotado));

        const agotados = alertas.filter((a) => a.agotado).length;
        const bajos = alertas.length - agotados;

        setData({
          ingresosMes,
          comprasMes,
          gastosMes,
          ingresosTotal,
          serie,
          alertas,
          agotados,
          bajos,
        });
      } catch (e: any) {
        const msg = e?.message ?? "Error cargando datos";
        setError(msg);
        toast.error(msg);
      }
    })();
  }, [user]);

  const utilidadMes =
    (data?.ingresosMes ?? 0) - (data?.comprasMes ?? 0) - (data?.gastosMes ?? 0);

  return (
    <AppLayout
      title="Dashboard General"
      subtitle="Resumen del mes actual · Alertas de inventario"
    >
      {error && (
        <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="Ventas (mes)" value={fmtMoney(data?.ingresosMes)} icon={TrendingUp} tone="success" hint="Mes en curso" />
        <StatCard label="Compras (mes)" value={fmtMoney(data?.comprasMes)} icon={Boxes} tone="info" hint="Mes en curso" />
        <StatCard label="Gastos (mes)" value={fmtMoney(data?.gastosMes)} icon={Wallet} tone="destructive" hint="Mes en curso" />
        <StatCard label="Utilidad (mes)" value={fmtMoney(utilidadMes)} icon={Sprout} tone={utilidadMes >= 0 ? "success" : "destructive"} hint="Mes en curso" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-gradient-surface shadow-elegant p-6">
          <div className="mb-6">
            <h3 className="text-lg font-black text-foreground tracking-tight">
              Ventas vs Compras vs Gastos
            </h3>
            <p className="text-xs text-muted-foreground font-medium">Últimos meses</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.serie ?? []}>
                <defs>
                  <linearGradient id="grIng" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.17 158)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.72 0.17 158)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grCom" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.15 240)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.7 0.15 240)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grGas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.65 0.22 25)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.65 0.22 25)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.03 255)" />
                <XAxis dataKey="mes" stroke="oklch(0.68 0.02 255)" fontSize={11} />
                <YAxis stroke="oklch(0.68 0.02 255)" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.23 0.03 255)",
                    border: "1px solid oklch(0.32 0.03 255)",
                    borderRadius: 12,
                    color: "oklch(0.97 0.01 250)",
                  }}
                  formatter={(v: any) => fmtMoney(Number(v))}
                />
                <Area type="monotone" dataKey="ingresos" name="Ventas" stroke="oklch(0.72 0.17 158)" strokeWidth={2.5} fill="url(#grIng)" />
                <Area type="monotone" dataKey="compras" name="Compras" stroke="oklch(0.7 0.15 240)" strokeWidth={2.5} fill="url(#grCom)" />
                <Area type="monotone" dataKey="gastos" name="Gastos" stroke="oklch(0.65 0.22 25)" strokeWidth={2.5} fill="url(#grGas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-gradient-surface shadow-elegant p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-xl p-3 bg-warning/15 text-warning">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground tracking-tight">Alertas Inventario</h3>
              <p className="text-xs text-muted-foreground font-medium">Stock bajo y agotados</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl border border-border bg-surface-elevated/60 p-3">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-black">Agotados</p>
              <p className="mt-1 text-2xl font-black text-destructive flex items-center gap-2">
                <PackageX className="h-5 w-5" /> {data?.agotados ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-elevated/60 p-3">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-black">Stock bajo</p>
              <p className="mt-1 text-2xl font-black text-warning">{data?.bajos ?? 0}</p>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(data?.alertas ?? []).map((a) => (
              <div
                key={a.producto_id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-foreground truncate">{a.nombre}</p>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                        a.agotado ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
                      }`}
                    >
                      {a.agotado ? "Agotado" : "Bajo"}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Mín: {fmtNum(a.stock_minimo)}
                  </p>
                </div>
                <span
                  className={`text-xs font-black ${
                    a.agotado ? "text-destructive" : "text-warning"
                  }`}
                >
                  {fmtNum(a.stock_actual)}
                </span>
              </div>
            ))}
            {data && data.alertas.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                Todo en orden ✓
              </p>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
