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
  ajustarStock,
  type CompraRow,
  type Contacto,
  type MaestroItem,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { exportCSV } from "@/lib/csv";

export const Route = createFileRoute("/compras")({
  head: () => ({
    meta: [{ title: "Compras — App Negocios Agro" }],
  }),
  component: () => (
    <AuthGate section="compras">
      <ComprasPage />
    </AuthGate>
  ),
});

const empty = {
  fecha: new Date().toISOString().slice(0, 10),
  proveedor_id: "",
  producto_id: "",
  concepto: "",
  cantidad: "",
  valor_unitario: "",
  porcentaje_iva: "19",
  rte_fuente: "0",
  numero_factura: "",
  metodo_pago: "Efectivo",
  observaciones: "",
};

function ComprasPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CompraRow[]>([]);
  const [proveedores, setProveedores] = useState<Contacto[]>([]);
  const [productos, setProductos] = useState<MaestroItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<CompraRow | null>(null);
  const [search, setSearch] = useState("");

  const subtotal = Number(form.cantidad || 0) * Number(form.valor_unitario || 0);
  const iva = subtotal * (Number(form.porcentaje_iva || 0) / 100);
  const rte = Number(form.rte_fuente || 0);
  const total = subtotal + iva - rte;

  const provMap = useMemo(() => new Map(proveedores.map((p) => [p.id, p.nombre])), [proveedores]);
  const itemMap = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  async function loadAll() {
    setLoading(true);
    const [c, p, m] = await Promise.all([
      supabase.from("compras").select("*").order("fecha", { ascending: false }),
      supabase.from("contactos").select("*"),
      supabase.from("maestro_items").select("*").order("nombre"),
    ]);
    if (c.error) toast.error(c.error.message);
    setRows((c.data as CompraRow[]) ?? []);
    const all = (p.data as Contacto[]) ?? [];
    const provs = all.filter((x) => String(x.tipo).toLowerCase().includes("proveedor"));
    setProveedores(provs.length ? provs : all);
    setProductos((m.data as MaestroItem[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(r: CompraRow) {
    setEditing(r);
    setForm({
      fecha: r.fecha,
      proveedor_id: r.proveedor_id,
      producto_id: r.producto_id,
      concepto: r.concepto ?? "",
      cantidad: String(r.cantidad ?? ""),
      valor_unitario: String(r.valor_unitario ?? ""),
      porcentaje_iva: String(r.porcentaje_iva ?? 0),
      rte_fuente: String(r.rte_fuente ?? 0),
      numero_factura: r.numero_factura ?? "",
      metodo_pago: r.metodo_pago ?? "Efectivo",
      observaciones: r.observaciones ?? "",
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const item = itemMap.get(form.producto_id);
    const factor = Number(item?.factor_conversion ?? 1);
    const cantidadBase = Number(form.cantidad || 0) * factor;

    const payload = {
      fecha: form.fecha,
      proveedor_id: form.proveedor_id,
      producto_id: form.producto_id,
      concepto: form.concepto || null,
      cantidad: Number(form.cantidad),
      valor_unitario: Number(form.valor_unitario),
      subtotal,
      porcentaje_iva: Number(form.porcentaje_iva || 0),
      iva,
      rte_fuente: rte,
      total,
      numero_factura: form.numero_factura || null,
      metodo_pago: form.metodo_pago || null,
      observaciones: form.observaciones || null,
      registrado_por: user.id,
    };

    if (editing) {
      const { error } = await supabase.from("compras").update(payload).eq("id", editing.id);
      if (error) {
        setSaving(false);
        return toast.error("No se pudo actualizar: " + error.message);
      }
      // Reajustar stock por delta de cantidad (en unidad base)
      const oldBase = Number(editing.cantidad ?? 0) * factor;
      const delta = cantidadBase - oldBase;
      if (form.producto_id && delta !== 0) {
        await ajustarStock(form.producto_id, delta, user.id);
      }
      toast.success("Compra actualizada");
    } else {
      const { error } = await supabase.from("compras").insert([{ ...payload, user_id: user.id }]);
      if (error) {
        setSaving(false);
        return toast.error("No se pudo guardar la compra: " + error.message);
      }
      if (form.producto_id && cantidadBase > 0) {
        await ajustarStock(form.producto_id, cantidadBase, user.id);
      }
      toast.success("Compra registrada e inventario actualizado");
    }

    setSaving(false);
    setForm(empty);
    setEditing(null);
    setOpen(false);
    loadAll();
  }

  async function remove(r: CompraRow) {
    if (!confirm("¿Eliminar esta compra? Se revertirá el ingreso al inventario.")) return;
    const item = itemMap.get(r.producto_id);
    const factor = Number(item?.factor_conversion ?? 1);
    const baseQty = Number(r.cantidad ?? 0) * factor;
    const { error } = await supabase.from("compras").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    if (user && r.producto_id && baseQty > 0) await ajustarStock(r.producto_id, -baseQty, user.id);
    toast.success("Compra eliminada");
    loadAll();
  }

  const filtered = useMemo(() => {
    if (!search) return rows;
    return rows.filter((r) =>
      matchText(provMap.get(r.proveedor_id), search) ||
      matchText(itemMap.get(r.producto_id)?.nombre, search) ||
      matchText(r.numero_factura, search) ||
      matchText(r.concepto, search) ||
      matchText(r.fecha, search)
    );
  }, [rows, search, provMap, itemMap]);

  return (
    <AppLayout
      title="Compras"
      subtitle="Proveedores, productos e impuestos"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportCSV(
                `compras_${new Date().toISOString().slice(0, 10)}.csv`,
                [
                  "fecha",
                  "numero_factura",
                  "proveedor",
                  "producto",
                  "concepto",
                  "cantidad",
                  "valor_unitario",
                  "subtotal",
                  "porcentaje_iva",
                  "iva",
                  "rte_fuente",
                  "total",
                  "metodo_pago",
                  "observaciones",
                ],
                filtered.map((r) => [
                  r.fecha,
                  r.numero_factura ?? "",
                  provMap.get(r.proveedor_id) ?? "",
                  itemMap.get(r.producto_id)?.nombre ?? "",
                  r.concepto ?? "",
                  r.cantidad ?? 0,
                  r.valor_unitario ?? 0,
                  r.subtotal ?? 0,
                  r.porcentaje_iva ?? 0,
                  r.iva ?? 0,
                  r.rte_fuente ?? 0,
                  r.total ?? 0,
                  r.metodo_pago ?? "",
                  r.observaciones ?? "",
                ]),
              )
            }
            className="inline-flex items-center gap-2 rounded-xl bg-surface-elevated px-3 sm:px-4 py-3 text-xs font-black uppercase tracking-wider text-foreground hover:bg-muted transition-smooth"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar CSV Contable</span>
            <span className="sm:hidden">Exp. Compras</span>
          </button>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-glow transition-smooth hover:scale-105"
          >
            <Plus className="h-4 w-4" /> Nueva Compra
          </button>
        </div>
      }
    >
      <div className="mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por proveedor, producto, factura…" />
      </div>

      <DataTable<CompraRow>
        loading={loading}
        rows={filtered}
        empty="Aún no hay compras registradas."
        columns={[
          { key: "fecha", label: "Fecha", render: (r) => <span className="font-mono text-muted-foreground">{r.fecha}</span> },
          { key: "prov", label: "Proveedor", render: (r) => <span className="font-black text-foreground uppercase">{provMap.get(r.proveedor_id) ?? "—"}</span> },
          { key: "prod", label: "Producto", render: (r) => <span className="text-foreground">{itemMap.get(r.producto_id)?.nombre ?? "—"}</span> },
          { key: "cant", label: "Cant.", align: "center", render: (r) => <span className="font-bold">{r.cantidad ?? "—"}</span> },
          { key: "sub", label: "Subtotal", align: "right", render: (r) => <span className="text-foreground">{fmtMoney(r.subtotal)}</span> },
          { key: "iva", label: "IVA", align: "right", render: (r) => <span className="text-warning">{fmtMoney(r.iva)}</span> },
          { key: "rte", label: "Rte Fte", align: "right", render: (r) => <span className="text-destructive">-{fmtMoney(r.rte_fuente)}</span> },
          { key: "tot", label: "Total", align: "right", render: (r) => <span className="font-black text-success">{fmtMoney(r.total)}</span> },
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
            <h3 className="text-xl font-black text-foreground tracking-tight uppercase mb-6">{editing ? "Editar Compra" : "Nueva Compra"}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Fecha">
                <input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={inp} />
              </Field>
              <Field label="Proveedor" className="md:col-span-2">
                <select required value={form.proveedor_id} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })} className={inp}>
                  <option value="">Selecciona…</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </Field>
              <Field label="Producto" className="col-span-2 md:col-span-3">
                <select required value={form.producto_id} onChange={(e) => setForm({ ...form, producto_id: e.target.value })} className={inp}>
                  <option value="">Selecciona…</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.presentacion ? `· ${p.presentacion}` : ""} (×{p.factor_conversion} {p.unidad_medida ?? ""})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Concepto" className="col-span-2 md:col-span-3">
                <input type="text" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} className={inp} />
              </Field>
              <Field label="Cantidad">
                <input type="number" step="0.01" required value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} className={inp} />
              </Field>
              <Field label="Valor Unitario">
                <input type="number" required value={form.valor_unitario} onChange={(e) => setForm({ ...form, valor_unitario: e.target.value })} className={inp} />
              </Field>
              <Field label="Subtotal">
                <div className={`${inp} text-foreground font-bold`}>{fmtMoney(subtotal)}</div>
              </Field>
              <Field label="% IVA">
                <input type="number" value={form.porcentaje_iva} onChange={(e) => setForm({ ...form, porcentaje_iva: e.target.value })} className={inp} />
              </Field>
              <Field label="IVA">
                <div className={`${inp} text-warning font-bold`}>{fmtMoney(iva)}</div>
              </Field>
              <Field label="Rte Fuente">
                <input type="number" value={form.rte_fuente} onChange={(e) => setForm({ ...form, rte_fuente: e.target.value })} className={`${inp} text-destructive`} />
              </Field>
              <Field label="N° Factura">
                <input type="text" value={form.numero_factura} onChange={(e) => setForm({ ...form, numero_factura: e.target.value })} className={inp} />
              </Field>
              <Field label="Método de pago">
                <select value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} className={inp}>
                  <option>Efectivo</option>
                  <option>Transferencia</option>
                  <option>Crédito</option>
                </select>
              </Field>
              <Field label="Total" className="col-span-2 md:col-span-3">
                <div className={`${inp} text-success font-black text-base`}>{fmtMoney(total)}</div>
              </Field>
              <Field label="Observaciones" className="col-span-2 md:col-span-3">
                <textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className={`${inp} h-20`} />
              </Field>
            </div>
            <div className="flex gap-3 pt-6">
              <button type="button" onClick={() => { setOpen(false); setEditing(null); }} className="flex-1 rounded-xl bg-surface-elevated text-muted-foreground font-bold py-3 hover:bg-muted transition-smooth">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-gradient-primary text-primary-foreground font-black py-3 shadow-glow hover:scale-[1.02] transition-smooth disabled:opacity-60">
                {saving ? "Guardando…" : editing ? "Actualizar Compra" : "Guardar Compra"}
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
