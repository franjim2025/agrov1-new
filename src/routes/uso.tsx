import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { AuthGate } from "@/components/AuthGate";
import { DataTable } from "@/components/DataTable";
import { SearchBar, matchText } from "@/components/SearchBar";
import { supabase, ajustarStock, type MaestroItem, type RegistroUso } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/uso")({
  head: () => ({ meta: [{ title: "Registro de Uso — App Negocios Agro" }] }),
  component: () => (
    <AuthGate section="registro_uso">
      <UsoPage />
    </AuthGate>
  ),
});

const empty = {
  fecha: new Date().toISOString().slice(0, 10),
  producto_id: "",
  cantidad_usada: "",
  unidad_usada: "",
  observaciones: "",
};

function UsoPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<RegistroUso[]>([]);
  const [productos, setProductos] = useState<MaestroItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<RegistroUso | null>(null);
  const [search, setSearch] = useState("");

  const itemMap = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  async function load() {
    setLoading(true);
    const [u, m] = await Promise.all([
      supabase.from("registro_uso").select("*").order("fecha", { ascending: false }),
      supabase.from("maestro_items").select("*").order("nombre"),
    ]);
    if (u.error) toast.error(u.error.message);
    setRows((u.data as RegistroUso[]) ?? []);
    setProductos((m.data as MaestroItem[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(r: RegistroUso) {
    setEditing(r);
    setForm({
      fecha: r.fecha,
      producto_id: r.producto_id,
      cantidad_usada: String(r.cantidad_usada ?? ""),
      unidad_usada: r.unidad_usada ?? itemMap.get(r.producto_id)?.unidad_medida ?? "",
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
    const cantidadBase = Number(form.cantidad_usada || 0) * factor;

    const payload = {
      fecha: form.fecha,
      producto_id: form.producto_id,
      cantidad_usada: Number(form.cantidad_usada),
      unidad_usada: form.unidad_usada || item?.unidad_medida || null,
      observaciones: form.observaciones || null,
      registrado_por: user.id,
    };

    if (editing) {
      const { error } = await supabase.from("registro_uso").update(payload).eq("id", editing.id);
      if (error) {
        setSaving(false);
        return toast.error("No se pudo actualizar: " + error.message);
      }
      const oldBase = Number(editing.cantidad_usada ?? 0) * factor;
      const delta = cantidadBase - oldBase;
      if (form.producto_id && delta !== 0) {
        // mayor uso => mayor salida (-delta)
        await ajustarStock(form.producto_id, -delta, user.id);
      }
      toast.success("Uso actualizado");
    } else {
      const { error } = await supabase.from("registro_uso").insert([{ ...payload, user_id: user.id }]);
      if (error) {
        setSaving(false);
        return toast.error("No se pudo guardar: " + error.message);
      }
      if (form.producto_id && cantidadBase > 0) {
        await ajustarStock(form.producto_id, -cantidadBase, user.id);
      }
      toast.success("Uso registrado e inventario descontado");
    }

    setSaving(false);
    setForm(empty);
    setEditing(null);
    setOpen(false);
    load();
  }

  async function remove(r: RegistroUso) {
    if (!confirm("¿Eliminar este uso? Se devolverá la cantidad al inventario.")) return;
    const item = itemMap.get(r.producto_id);
    const factor = Number(item?.factor_conversion ?? 1);
    const baseQty = Number(r.cantidad_usada ?? 0) * factor;
    const { error } = await supabase.from("registro_uso").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    if (user && r.producto_id && baseQty > 0) await ajustarStock(r.producto_id, baseQty, user.id);
    toast.success("Registro eliminado");
    load();
  }

  const filtered = useMemo(() => {
    if (!search) return rows;
    return rows.filter((r) =>
      matchText(itemMap.get(r.producto_id)?.nombre, search) ||
      matchText(r.observaciones, search) ||
      matchText(r.fecha, search)
    );
  }, [rows, search, itemMap]);

  return (
    <AppLayout
      title="Registro de Uso"
      subtitle="Consumos internos que descuentan inventario"
      actions={
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-glow transition-smooth hover:scale-105">
          <Plus className="h-4 w-4" /> Nuevo Uso
        </button>
      }
    >
      <div className="mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por producto, fecha, observación…" />
      </div>

      <DataTable<RegistroUso>
        loading={loading}
        rows={filtered}
        empty="Aún no hay registros de uso."
        columns={[
          { key: "fecha", label: "Fecha", render: (r) => <span className="font-mono text-muted-foreground">{r.fecha}</span> },
          { key: "prod", label: "Producto", render: (r) => <span className="font-black text-foreground">{itemMap.get(r.producto_id)?.nombre ?? "—"}</span> },
          { key: "cant", label: "Cantidad", align: "center", render: (r) => <span className="font-black text-info">{r.cantidad_usada}</span> },
          { key: "und", label: "Unidad", align: "center", render: (r) => <span className="text-muted-foreground uppercase text-xs">{r.unidad_usada ?? "—"}</span> },
          { key: "obs", label: "Observaciones", render: (r) => <span className="text-muted-foreground">{r.observaciones ?? "—"}</span> },
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
          <form onSubmit={submit} className="w-full max-w-xl rounded-2xl border border-border bg-gradient-surface p-8 shadow-elegant max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-foreground tracking-tight uppercase mb-6">{editing ? "Editar Registro de Uso" : "Nuevo Registro de Uso"}</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Fecha">
                <input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={inp} />
              </Field>
              <Field label="Producto" className="col-span-2">
                <select
                  required
                  value={form.producto_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const it = itemMap.get(id);
                    setForm({
                      ...form,
                      producto_id: id,
                      unidad_usada: it?.unidad_medida ?? "",
                    });
                  }}
                  className={inp}
                >
                  <option value="">Selecciona…</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.presentacion ? `· ${p.presentacion}` : ""} (×{p.factor_conversion} {p.unidad_medida ?? ""})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cantidad usada">
                <input type="number" step="0.01" required value={form.cantidad_usada} onChange={(e) => setForm({ ...form, cantidad_usada: e.target.value })} className={inp} />
              </Field>
              <Field label="Unidad de medida (auto)">
                <input
                  type="text"
                  readOnly
                  value={form.unidad_usada || itemMap.get(form.producto_id)?.unidad_medida || ""}
                  className={`${inp} bg-surface-elevated/50 cursor-not-allowed text-muted-foreground`}
                  placeholder="Selecciona un producto"
                />
              </Field>
              <Field label="Observaciones" className="col-span-2">
                <textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className={`${inp} h-20`} />
              </Field>
            </div>
            <div className="flex gap-3 pt-6">
              <button type="button" onClick={() => { setOpen(false); setEditing(null); }} className="flex-1 rounded-xl bg-surface-elevated text-muted-foreground font-bold py-3 hover:bg-muted transition-smooth">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-gradient-primary text-primary-foreground font-black py-3 shadow-glow hover:scale-[1.02] transition-smooth disabled:opacity-60">
                {saving ? "Guardando…" : editing ? "Actualizar" : "Guardar"}
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
