import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AuthGate } from "@/components/AuthGate";
import { DataTable } from "@/components/DataTable";
import { supabase, fmtNum, type InventarioRow, type MaestroItem } from "@/lib/supabase";

export const Route = createFileRoute("/inventario")({
  head: () => ({
    meta: [{ title: "Inventario — App Negocios Agro" }],
  }),
  component: () => (
    <AuthGate section="inventario">
      <InventarioPage />
    </AuthGate>
  ),
});

type Row = InventarioRow & { _nombre: string; _unidad: string };

function InventarioPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [productos, setProductos] = useState<MaestroItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [i, m] = await Promise.all([
      supabase.from("inventario").select("*"),
      supabase.from("maestro_items").select("*").order("nombre"),
    ]);
    if (i.error) setError(i.error.message);
    const items = (m.data as MaestroItem[]) ?? [];
    setProductos(items);
    const map = new Map(items.map((x) => [x.id, x]));
    const inv = ((i.data as InventarioRow[]) ?? []).map((r) => ({
      ...r,
      _nombre: map.get(r.producto_id)?.nombre ?? "—",
      _unidad: map.get(r.producto_id)?.unidad_medida ?? "",
    }));
    setRows(inv.sort((a, b) => a._nombre.localeCompare(b._nombre)));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const sinInventario = useMemo(() => {
    const ids = new Set(rows.map((r) => r.producto_id));
    return productos.filter((p) => !ids.has(p.id));
  }, [productos, rows]);

  return (
    <AppLayout title="Estado de Inventario" subtitle="Stock actual, mínimos y alertas">
      {error && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <DataTable<Row>
        loading={loading}
        rows={rows}
        empty="Aún no hay registros de inventario. Registra una compra para comenzar."
        columns={[
          { key: "prod", label: "Producto", render: (r) => <span className="font-black text-foreground">{r._nombre}</span> },
          { key: "und", label: "Unidad", align: "center", render: (r) => <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{r._unidad}</span> },
          { key: "stock", label: "Stock actual", align: "center", render: (r) => <span className="font-black text-info">{fmtNum(r.stock_actual)}</span> },
          { key: "min", label: "Stock mínimo", align: "center", render: (r) => <span className="text-muted-foreground">{fmtNum(r.stock_minimo)}</span> },
          {
            key: "alerta",
            label: "Estado",
            align: "center",
            render: (r) => {
              const s = Number(r.stock_actual);
              const m = Number(r.stock_minimo || 0);
              if (s <= 0)
                return <span className="inline-flex rounded-full bg-destructive/15 text-destructive px-3 py-1 text-[10px] font-black uppercase tracking-wider">Agotado</span>;
              if (s <= m)
                return <span className="inline-flex rounded-full bg-warning/15 text-warning px-3 py-1 text-[10px] font-black uppercase tracking-wider">Bajo</span>;
              return <span className="inline-flex rounded-full bg-success/15 text-success px-3 py-1 text-[10px] font-black uppercase tracking-wider">OK</span>;
            },
          },
        ]}
      />

      {sinInventario.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-surface-elevated/40 p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black mb-2">
            Productos sin inventario inicial ({sinInventario.length})
          </p>
          <p className="text-xs text-muted-foreground">
            {sinInventario.slice(0, 8).map((p) => p.nombre).join(", ")}
            {sinInventario.length > 8 ? "…" : ""}
          </p>
        </div>
      )}
    </AppLayout>
  );
}
