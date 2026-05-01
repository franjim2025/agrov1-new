import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { AuthGate } from "@/components/AuthGate";
import { DataTable } from "@/components/DataTable";
import { SearchBar, matchText } from "@/components/SearchBar";
import {
  supabase,
  fmtMoney,
  type VentaRow,
  type Contacto,
  type ProductoVenta,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { exportCSV } from "@/lib/csv";

export const Route = createFileRoute("/ventas")({
  head: () => ({
    meta: [{ title: "Ventas de Cosecha — App Negocios Agro" }],
  }),
  component: () => (
    <AuthGate section="ventas">
      <VentasPage />
    </AuthGate>
  ),
});

const UNIDADES_VENTA = ["Kg", "Libra", "Canastilla", "Unidad"];

const empty = {
  fecha: new Date().toISOString().slice(0, 10),
  cliente_id: "",
  producto_id: "",
  unidad_medida: "Kg",
  cantidad: "",
  precio_unidad: "",
  porcentaje_iva: "0",
  rte_fuente: "0",
};

function VentasPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<VentaRow[]>([]);
  const [clientes, setClientes] = useState<Contacto[]>([]);
  const [productos, setProductos] = useState<ProductoVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<VentaRow | null>(null);
  const [search, setSearch] = useState("");

  // Cálculos automáticos
  const cantidad = Number(form.cantidad || 0);
  const precio = Number(form.precio_unidad || 0);
  const subtotal = cantidad * precio;
  const pIva = Number(form.porcentaje_iva || 0);
  const iva = +(subtotal * (pIva / 100)).toFixed(2);
  const rteFuente = Number(form.rte_fuente || 0);
  const total = +(subtotal + iva - rteFuente).toFixed(2);

  const cliMap = useMemo(() => new Map(clientes.map((c) => [c.id, c.nombre])), [clientes]);
  const itemMap = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  async function loadAll() {
    setLoading(true);
    const [v, c, m] = await Promise.all([
      supabase.from("ventas_cosecha").select("*").order("fecha", { ascending: false }),
      supabase.from("contactos").select("*"),
      supabase.from("productos_venta").select("*").order("nombre"),
    ]);
    if (v.error) toast.error(v.error.message);
    if (m.error) toast.error("productos_venta: " + m.error.message);
    setRows((v.data as VentaRow[]) ?? []);
    const allContacts = (c.data as Contacto[]) ?? [];
    const onlyClientes = allContacts.filter((x) => String(x.tipo).toLowerCase().includes("cliente"));
    setClientes(onlyClientes.length ? onlyClientes : allContacts);
    setProductos((m.data as ProductoVenta[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(r: VentaRow) {
    setEditing(r);
    setForm({
      fecha: r.fecha,
      cliente_id: r.cliente_id,
      producto_id: r.producto_id,
      unidad_medida: (r as any).unidad_medida ?? "Kg",
      cantidad: String(r.cantidad ?? ""),
      precio_unidad: String(r.precio_unidad ?? ""),
      porcentaje_iva: String(r.porcentaje_iva ?? 0),
      rte_fuente: String(r.rte_fuente ?? 0),
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const payload: Record<string, unknown> = {
      fecha: form.fecha,
      cliente_id: form.cliente_id,
      producto_id: form.producto_id,
      cantidad,
      precio_unidad: precio,
      subtotal,
      porcentaje_iva: pIva,
      iva,
      rte_fuente: rteFuente,
      total,
      registrado_por: user.id,
    };
    const payloadConUnidad = { ...payload, unidad_medida: form.unidad_medida };

    if (editing) {
      let { error } = await supabase.from("ventas_cosecha").update(payloadConUnidad).eq("id", editing.id);
      if (error && /unidad_medida/i.test(error.message)) {
        ({ error } = await supabase.from("ventas_cosecha").update(payload).eq("id", editing.id));
      }
      if (error) {
        setSaving(false);
        return toast.error("No se pudo actualizar: " + error.message);
      }
      toast.success("Venta actualizada");
    } else {
      const insertData = { ...payloadConUnidad, user_id: user.id };
      let { error } = await supabase.from("ventas_cosecha").insert([insertData]);
      if (error && /unidad_medida/i.test(error.message)) {
        ({ error } = await supabase.from("ventas_cosecha").insert([{ ...payload, user_id: user.id }]));
      }
      if (error) {
        setSaving(false);
        return toast.error("No se pudo guardar la venta: " + error.message);
      }
      toast.success("Venta registrada");
    }

    setSaving(false);
    setForm(empty);
    setEditing(null);
    setOpen(false);
    loadAll();
  }

  async function remove(r: VentaRow) {
    if (!confirm("¿Eliminar esta venta?")) return;
    const { error } = await supabase.from("ventas_cosecha").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Venta eliminada");
    loadAll();
  }

  const filtered = useMemo(() => {
    if (!search) return rows;
    return rows.filter((r) =>
      matchText(cliMap.get(r.cliente_id), search) ||
      matchText(itemMap.get(r.producto_id)?.nombre, search) ||
      matchText(r.fecha, search)
    );
  }, [rows, search, cliMap, itemMap]);

  return (
    <AppLayout
      title="Ventas de Cosecha"
      subtitle="Clientes, productos y facturación"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportCSV(
                `ventas_cosecha_${new Date().toISOString().slice(0, 10)}.csv`,
                [
                  "fecha",
                  "cliente",
                  "producto",
                  "cantidad",
                  "unidad",
                  "precio_unidad",
                  "subtotal",
                  "porcentaje_iva",
                  "iva",
                  "rte_fuente",
                  "total",
                ],
                filtered.map((r) => [
                  r.fecha,
                  cliMap.get(r.cliente_id) ?? "",
                  itemMap.get(r.producto_id)?.nombre ?? "",
                  r.cantidad ?? 0,
                  (r as any).unidad_medida ?? "",
                  r.precio_unidad ?? 0,
                  r.subtotal ?? 0,
                  r.porcentaje_iva ?? 0,
                  r.iva ?? 0,
                  r.rte_fuente ?? 0,
                  r.total ?? 0,
                ]),
              )
            }
            className="inline-flex items-center gap-2 rounded-xl bg-surface-elevated px-3 sm:px-4 py-3 text-xs font-black uppercase tracking-wider text-foreground hover:bg-muted transition-smooth"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar CSV Ventas</span>
            <span className="sm:hidden">Exp. Ventas</span>
          </button>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-glow transition-smooth hover:scale-105"
          >
            <Plus className="h-4 w-4" /> Nueva Venta
          </button>
        </div>
      }
    >
      <div className="mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por cliente, producto, fecha…" />
      </div>

      <DataTable<VentaRow>
        loading={loading}
        rows={filtered}
        empty="Aún no hay ventas registradas."
        columns={[
          { key: "fecha", label: "Fecha", render: (r) => <span className="font-mono text-muted-foreground">{r.fecha}</span> },
          { key: "cliente", label: "Cliente", render: (r) => <span className="font-black text-foreground uppercase">{cliMap.get(r.cliente_id) ?? "—"}</span> },
          { key: "prod", label: "Producto", render: (r) => <span className="text-foreground">{itemMap.get(r.producto_id)?.nombre ?? "—"}</span> },
          { key: "cant", label: "Cant.", align: "center", render: (r) => <span className="font-black text-info">{r.cantidad ?? "—"}</span> },
          { key: "und", label: "Unidad", align: "center", render: (r) => <span className="text-xs uppercase text-muted-foreground">{(r as any).unidad_medida ?? "—"}</span> },
          { key: "precio", label: "Precio", align: "right", render: (r) => <span className="text-muted-foreground">{fmtMoney(r.precio_unidad)}</span> },
          { key: "iva", label: "IVA", align: "right", render: (r) => <span className="text-warning">{fmtMoney(r.iva)}</span> },
          { key: "rte", label: "Rte Fte", align: "right", render: (r) => <span className="text-destructive">{fmtMoney(r.rte_fuente)}</span> },
          { key: "tot", label: "Total", align: "right", render: (r) => <span className="font-black text-success">{fmtMoney(r.total ?? r.subtotal)}</span> },
          { key: "acc", label: "Acciones", align: "center", render: (r) => (
            <div className="inline-flex items-center gap-3">
              <button onClick={() => openEdit(r)} title="Editar" className="text-info hover:scale-110 transition-smooth"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => remove(r)} title="Eliminar" className="text-destructive hover:scale-110 transition-smooth"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) },
        ]}
      />

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form onSubmit={submit} className="w-full max-w-2xl rounded-2xl border border-border bg-gradient-surface p-8 shadow-elegant max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-foreground tracking-tight uppercase mb-6">{editing ? "Editar Venta" : "Nueva Venta"}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Fecha">
                <input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={inp} />
              </Field>
              <Field label="Cliente" className="md:col-span-2">
                <select required value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} className={inp}>
                  <option value="">Selecciona…</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </Field>
              <Field label="Producto" className="col-span-2 md:col-span-2">
                <select
                  required
                  value={form.producto_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const p = itemMap.get(id);
                    setForm({
                      ...form,
                      producto_id: id,
                      unidad_medida: p?.unidad_medida || form.unidad_medida,
                      precio_unidad: p?.precio_unidad ? String(p.precio_unidad) : form.precio_unidad,
                    });
                  }}
                  className={inp}
                >
                  <option value="">Selecciona…</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unidad de medida">
                <select
                  required
                  value={form.unidad_medida}
                  onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })}
                  className={inp}
                >
                  {UNIDADES_VENTA.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Cantidad">
                <input type="number" step="0.01" required value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} className={inp} />
              </Field>
              <Field label="Precio / unidad">
                <input type="number" required value={form.precio_unidad} onChange={(e) => setForm({ ...form, precio_unidad: e.target.value })} className={inp} />
              </Field>
              <Field label="Subtotal">
                <div className={`${inp} font-black`}>{fmtMoney(subtotal)}</div>
              </Field>
              <Field label="% IVA">
                <input type="number" step="0.01" value={form.porcentaje_iva} onChange={(e) => setForm({ ...form, porcentaje_iva: e.target.value })} className={inp} />
              </Field>
              <Field label="IVA">
                <div className={`${inp} text-warning font-black`}>{fmtMoney(iva)}</div>
              </Field>
              <Field label="Rte Fuente">
                <input type="number" step="0.01" value={form.rte_fuente} onChange={(e) => setForm({ ...form, rte_fuente: e.target.value })} className={`${inp} text-destructive`} />
              </Field>
              <Field label="Total Neto" className="col-span-2 md:col-span-3">
                <div className={`${inp} text-success font-black text-base`}>{fmtMoney(total)}</div>
              </Field>
            </div>
            <div className="flex gap-3 pt-6">
              <button type="button" onClick={() => { setOpen(false); setEditing(null); }} className="flex-1 rounded-xl bg-surface-elevated text-muted-foreground font-bold py-3 hover:bg-muted transition-smooth">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-gradient-primary text-primary-foreground font-black py-3 shadow-glow hover:scale-[1.02] transition-smooth disabled:opacity-60">
                {saving ? "Guardando…" : editing ? "Actualizar Venta" : "Guardar Venta"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppLayout>
  );
}

const inp = "w-full bg-background border border-border rounded-xl p-3 text-foreground text-sm focus:border-primary outline-none";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-black tracking-widest uppercase text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}
