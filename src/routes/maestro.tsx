import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, HelpCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { AuthGate } from "@/components/AuthGate";
import { DataTable } from "@/components/DataTable";
import { SearchBar, matchText } from "@/components/SearchBar";
import { supabase, type MaestroItem } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/maestro")({
  head: () => ({ meta: [{ title: "Maestro de Ítems — App Negocios Agro" }] }),
  component: () => (
    <AuthGate section="maestro">
      <MaestroPage />
    </AuthGate>
  ),
});

const CATEGORIAS = ["Fertilizantes", "Herbicidas", "Maquinaria", "Cosecha", "Herramientas"];
const UNIDADES = ["kg", "L", "Unidad", "Bulto", "Galón", "Canastilla"];
const PRESENTACIONES = ["kg", "L", "Unidad", "Bulto", "Galón", "Canastilla"];
const FACTORES: { value: string; label: string }[] = [
  { value: "1", label: "1 — Unidad / Repuestos" },
  { value: "20", label: "20 — Pimpinas" },
  { value: "25", label: "25 — Medio Bulto" },
  { value: "50", label: "50 — Bulto estándar" },
  { value: "1000", label: "1000 — g a kg / ml a L" },
  { value: "custom", label: "Personalizado…" },
];

const CUSTOM = "__custom__";

const empty = {
  nombre: "",
  categoria_modo: "",
  categoria: "",
  unidad_modo: "kg",
  unidad_medida: "kg",
  presentacion_modo: "Unidad",
  presentacion: "Unidad",
  factor_conversion: "1",
  factor_modo: "1",
};

function buildFormFromRow(r: MaestroItem) {
  const cat = r.categoria ?? "";
  const und = r.unidad_medida ?? "kg";
  const pres = r.presentacion ?? "Unidad";
  const fac = String(r.factor_conversion ?? 1);
  const inFactor = FACTORES.some((f) => f.value === fac);
  return {
    nombre: r.nombre ?? "",
    categoria_modo: cat ? (CATEGORIAS.includes(cat) ? cat : CUSTOM) : "",
    categoria: cat,
    unidad_modo: UNIDADES.includes(und) ? und : CUSTOM,
    unidad_medida: und,
    presentacion_modo: PRESENTACIONES.includes(pres) ? pres : CUSTOM,
    presentacion: pres,
    factor_conversion: fac,
    factor_modo: inFactor ? fac : "custom",
  };
}

// Postgres invalid_text_representation (enum mismatch)
function isEnumError(err: { code?: string; message?: string }) {
  return err?.code === "22P02" || /invalid input value for enum/i.test(err?.message ?? "");
}

function MaestroPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<MaestroItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todos");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("maestro_items").select("*").order("nombre");
    if (error) toast.error("Error: " + error.message);
    setRows((data as MaestroItem[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditId(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(r: MaestroItem) {
    setEditId(r.id);
    setForm(buildFormFromRow(r));
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const basePayload = {
      nombre: form.nombre,
      categoria: form.categoria || null,
      unidad_medida: form.unidad_medida || null,
      presentacion: form.presentacion,
      factor_conversion: Number(form.factor_conversion || 1),
      registrado_por: user.id,
    };

    if (editId) {
      let { error } = await supabase.from("maestro_items").update(basePayload).eq("id", editId);
      if (error && isEnumError(error)) {
        toast.warning(`La categoría "${form.categoria}" no existe en el catálogo. Se guardó sin categoría.`);
        const retry = await supabase
          .from("maestro_items")
          .update({ ...basePayload, categoria: null })
          .eq("id", editId);
        error = retry.error;
      }
      setSaving(false);
      if (error) return toast.error("No se pudo actualizar: " + error.message);
      toast.success("Ítem actualizado");
      setOpen(false);
      setEditId(null);
      setForm(empty);
      load();
      return;
    }

    // INSERT
    const payload = { ...basePayload, user_id: user.id };
    let ins = await supabase.from("maestro_items").insert([payload]).select("id").single();
    if (ins.error && isEnumError(ins.error)) {
      toast.warning(`La categoría "${form.categoria}" no existe en el catálogo. Se guardó sin categoría.`);
      ins = await supabase
        .from("maestro_items")
        .insert([{ ...payload, categoria: null }])
        .select("id")
        .single();
    }
    if (ins.error) {
      setSaving(false);
      toast.error("No se pudo crear el ítem: " + ins.error.message);
      return;
    }
    if (ins.data?.id) {
      // Inicializa SIEMPRE inventario en 0 para cumplir el constraint positive_stock
      const { error: invErr } = await supabase.from("inventario").insert([{
        producto_id: ins.data.id,
        stock_actual: 0,
        stock_minimo: 0,
        estado_alerta: "AGOTADO",
        user_id: user.id,
      }]);
      if (invErr) toast.warning("Ítem creado, pero falló inventario inicial: " + invErr.message);
      else toast.success("Ítem creado e inventario inicializado en 0");
    }
    setSaving(false);
    setForm(empty);
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este ítem? Se borrará también su inventario.")) return;
    await supabase.from("inventario").delete().eq("producto_id", id);
    const { error } = await supabase.from("maestro_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Ítem eliminado");
    load();
  }

  const categoriasDisponibles = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.categoria && set.add(r.categoria));
    CATEGORIAS.forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (catFilter !== "todos" && (r.categoria ?? "") !== catFilter) return false;
      if (!search) return true;
      return (
        matchText(r.nombre, search) ||
        matchText(r.categoria, search) ||
        matchText(r.presentacion, search) ||
        matchText(r.unidad_medida, search)
      );
    });
  }, [rows, search, catFilter]);

  return (
    <AppLayout
      title="Maestro de Ítems"
      subtitle="Catálogo de productos y unidades"
      actions={
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-glow transition-smooth hover:scale-105">
          <Plus className="h-4 w-4" /> Nuevo Ítem
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre, categoría, unidad…" />
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:border-primary outline-none"
        >
          <option value="todos">Todas las categorías</option>
          {categoriasDisponibles.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <DataTable<MaestroItem>
        loading={loading}
        rows={filtered}
        empty="Aún no hay ítems en el maestro."
        columns={[
          { key: "nombre", label: "Nombre", render: (r) => <span className="font-black text-foreground uppercase">{r.nombre}</span> },
          { key: "cat", label: "Categoría", render: (r) => <span className="text-muted-foreground">{r.categoria ?? "—"}</span> },
          { key: "und", label: "Unidad base", align: "center", render: (r) => <span className="text-xs uppercase font-bold text-info">{r.unidad_medida ?? "—"}</span> },
          { key: "pres", label: "Presentación", render: (r) => <span className="text-foreground">{r.presentacion}</span> },
          { key: "fac", label: "Factor", align: "center", render: (r) => <span className="font-black text-warning">×{r.factor_conversion}</span> },
          { key: "acc", label: "Acciones", align: "center", render: (r) => (
            <div className="inline-flex items-center gap-3">
              <button onClick={() => openEdit(r)} title="Editar" className="text-info hover:scale-110 transition-smooth"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => remove(r.id)} title="Eliminar" className="text-destructive hover:scale-110 transition-smooth"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) },
        ]}
      />

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form onSubmit={submit} className="w-full max-w-xl rounded-2xl border border-border bg-gradient-surface p-8 shadow-elegant max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-foreground tracking-tight uppercase mb-6">{editId ? "Editar Ítem" : "Nuevo Ítem"}</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre" className="col-span-2">
                <input type="text" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={inp} />
              </Field>

              <Field label="Categoría">
                <select
                  value={form.categoria_modo}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm({
                      ...form,
                      categoria_modo: v,
                      categoria: v === CUSTOM ? "" : v,
                    });
                  }}
                  className={inp}
                >
                  <option value="">Selecciona…</option>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value={CUSTOM}>Personalizado…</option>
                </select>
                {form.categoria_modo === CUSTOM && (
                  <input
                    type="text"
                    required
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    className={`${inp} mt-2`}
                    placeholder="Escribe la categoría (ej: Arbol)"
                  />
                )}
              </Field>

              <Field label="Unidad de medida">
                <select
                  required={form.unidad_modo !== CUSTOM}
                  value={form.unidad_modo}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm({
                      ...form,
                      unidad_modo: v,
                      unidad_medida: v === CUSTOM ? "" : v,
                    });
                  }}
                  className={inp}
                >
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  <option value={CUSTOM}>Personalizado…</option>
                </select>
                {form.unidad_modo === CUSTOM && (
                  <input
                    type="text"
                    required
                    value={form.unidad_medida}
                    onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })}
                    className={`${inp} mt-2`}
                    placeholder="Ej: m, ton, caja…"
                  />
                )}
              </Field>

              <Field label="Presentación">
                <select
                  required={form.presentacion_modo !== CUSTOM}
                  value={form.presentacion_modo}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm({
                      ...form,
                      presentacion_modo: v,
                      presentacion: v === CUSTOM ? "" : v,
                    });
                  }}
                  className={inp}
                >
                  {PRESENTACIONES.map((p) => <option key={p} value={p}>{p}</option>)}
                  <option value={CUSTOM}>Personalizado…</option>
                </select>
                {form.presentacion_modo === CUSTOM && (
                  <input
                    type="text"
                    required
                    value={form.presentacion}
                    onChange={(e) => setForm({ ...form, presentacion: e.target.value })}
                    className={`${inp} mt-2`}
                    placeholder="Ej: Tarro, Caja x 12…"
                  />
                )}
              </Field>

              <Field
                label={
                  <span className="inline-flex items-center gap-1.5">
                    Factor de conversión
                    <span
                      title="Indica cuántas unidades de uso contiene esta presentación (Ej: Si el bulto es de 50kg, el factor es 50)"
                      className="cursor-help text-muted-foreground hover:text-foreground"
                    >
                      <HelpCircle className="h-3 w-3" />
                    </span>
                  </span>
                }
              >
                <select
                  value={form.factor_modo}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm({
                      ...form,
                      factor_modo: v,
                      factor_conversion: v === "custom" ? "" : v,
                    });
                  }}
                  className={inp}
                >
                  {FACTORES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                {form.factor_modo === "custom" && (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.factor_conversion}
                    onChange={(e) => setForm({ ...form, factor_conversion: e.target.value })}
                    className={`${inp} mt-2`}
                    placeholder="Ingresa un número (ej: 12)"
                  />
                )}
              </Field>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">El factor convierte la presentación a unidad base (ej: 1 Bulto = 50 kg → factor 50).</p>
            <div className="flex gap-3 pt-6">
              <button type="button" onClick={() => { setOpen(false); setEditId(null); }} className="flex-1 rounded-xl bg-surface-elevated text-muted-foreground font-bold py-3 hover:bg-muted transition-smooth">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-gradient-primary text-primary-foreground font-black py-3 shadow-glow hover:scale-[1.02] transition-smooth disabled:opacity-60">
                {saving ? "Guardando…" : editId ? "Actualizar" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppLayout>
  );
}

const inp = "w-full bg-background border border-border rounded-xl p-3 text-foreground text-sm focus:border-primary outline-none";
function Field({ label, children, className = "" }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-black tracking-widest uppercase text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}
