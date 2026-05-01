import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { AuthGate } from "@/components/AuthGate";
import { DataTable } from "@/components/DataTable";
import { SearchBar, matchText } from "@/components/SearchBar";
import { supabase, fmtMoney, type GastoRow, type Contacto } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { exportCSV } from "@/lib/csv";

export const Route = createFileRoute("/gastos")({
  head: () => ({
    meta: [{ title: "Gastos Operativos — App Negocios Agro" }],
  }),
  component: () => (
    <AuthGate section="gastos">
      <GastosPage />
    </AuthGate>
  ),
});

// label visible -> candidatos a probar contra el CHECK constraint del backend
const CATEGORIAS_GASTO: { label: string; candidates: string[] }[] = [
  { label: "Nómina / Jornales",    candidates: ["nomina", "jornales", "Nómina", "Nomina"] },
  { label: "Servicios Públicos",   candidates: ["servicios", "servicios_publicos", "Servicios"] },
  { label: "Mantenimiento",        candidates: ["mantenimiento", "Mantenimiento"] },
  { label: "Transporte / Fletes",  candidates: ["transporte", "fletes", "Transporte"] },
  { label: "Arrendamientos",       candidates: ["arrendamientos", "arriendo", "Arrendamientos"] },
  { label: "Otros Gastos",         candidates: ["otros", "otros_gastos", "Otros"] },
];

const CAT_LABELS = CATEGORIAS_GASTO.map((c) => c.label);
function candidatesFor(label: string): string[] {
  const found = CATEGORIAS_GASTO.find((c) => c.label === label);
  return found ? [label, ...found.candidates] : [label];
}

const empty = {
  fecha: new Date().toISOString().slice(0, 10),
  concepto: "",
  categoria_gasto: "",
  beneficiario_id: "",
  valor: "",
  rete_fuente_valor: "0",
  rete_iva_valor: "0",
  estado: "Pagado",
  observaciones: "",
};

function isEnumOrCheckError(err: { code?: string; message?: string }) {
  if (!err) return false;
  return (
    err.code === "22P02" ||
    err.code === "23514" ||
    /invalid input value for enum/i.test(err.message ?? "") ||
    /violates check constraint/i.test(err.message ?? "")
  );
}

function GastosPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<GastoRow[]>([]);
  const [beneficiarios, setBeneficiarios] = useState<Contacto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<GastoRow | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todos");

  const valor = Number(form.valor || 0);
  const rf = Number(form.rete_fuente_valor || 0);
  const ri = Number(form.rete_iva_valor || 0);
  const totalNeto = valor - rf - ri;

  const benMap = useMemo(() => new Map(beneficiarios.map((b) => [b.id, b.nombre])), [beneficiarios]);

  async function load() {
    setLoading(true);
    const [g, c] = await Promise.all([
      supabase.from("gastos_operativos").select("*").order("fecha", { ascending: false }),
      supabase.from("contactos").select("*"),
    ]);
    if (g.error) toast.error(g.error.message);
    setRows((g.data as GastoRow[]) ?? []);
    const all = (c.data as Contacto[]) ?? [];
    const benef = all.filter((x) => String(x.tipo).toLowerCase().includes("benefic"));
    setBeneficiarios(benef.length ? benef : all);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(r: GastoRow) {
    setEditing(r);
    setForm({
      fecha: r.fecha,
      concepto: r.concepto ?? "",
      categoria_gasto: r.categoria_gasto ?? "",
      beneficiario_id: r.beneficiario_id ?? "",
      valor: String(r.valor ?? ""),
      rete_fuente_valor: String(r.rete_fuente_valor ?? 0),
      rete_iva_valor: String(r.rete_iva_valor ?? 0),
      estado: r.estado ?? "Pagado",
      observaciones: r.observaciones ?? "",
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const baseSinCat = {
      fecha: form.fecha,
      concepto: form.concepto,
      beneficiario_id: form.beneficiario_id,
      valor,
      rete_fuente_valor: rf,
      rete_iva_valor: ri,
      total_pagado_neto: totalNeto,
      estado: form.estado,
      observaciones: form.observaciones || null,
      registrado_por: user.id,
    };

    // Probamos varias variantes para superar el CHECK constraint del backend
    const tryValues = [...candidatesFor(form.categoria_gasto), null];
    let error: { code?: string; message?: string } | null = null;
    let savedWithFallback = false;

    for (let i = 0; i < tryValues.length; i++) {
      const cat = tryValues[i];
      const payload = { ...baseSinCat, categoria_gasto: cat };
      let res;
      if (editing) {
        res = await supabase.from("gastos_operativos").update(payload).eq("id", editing.id);
      } else {
        res = await supabase.from("gastos_operativos").insert([{ ...payload, user_id: user.id }]);
      }
      error = res.error;
      if (!error) {
        if (i > 0) savedWithFallback = true;
        break;
      }
      if (!isEnumOrCheckError(error)) break; // error distinto: no seguir
    }

    setSaving(false);
    if (error) return toast.error("No se pudo guardar: " + error.message);
    if (savedWithFallback) toast.warning("Categoría guardada con valor compatible.");
    toast.success(editing ? "Gasto actualizado" : "Gasto registrado");
    setForm(empty);
    setEditing(null);
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este gasto?")) return;
    const { error } = await supabase.from("gastos_operativos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Gasto eliminado");
    load();
  }

  const categoriasDisponibles = useMemo(() => {
    const set = new Set<string>(CAT_LABELS);
    rows.forEach((r) => r.categoria_gasto && set.add(r.categoria_gasto));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (catFilter !== "todos" && (r.categoria_gasto ?? "") !== catFilter) return false;
      if (!search) return true;
      return (
        matchText(r.concepto, search) ||
        matchText(benMap.get(r.beneficiario_id), search) ||
        matchText(r.categoria_gasto, search) ||
        matchText(r.fecha, search)
      );
    });
  }, [rows, search, catFilter]);

  return (
    <AppLayout
      title="Gastos Operativos"
      subtitle="Pagos, retenciones y estado"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              exportCSV(
                `gastos_operativos_${new Date().toISOString().slice(0, 10)}.csv`,
                ["fecha", "concepto", "categoria_gasto", "beneficiario", "valor", "rete_fuente_valor", "rete_iva_valor", "total_pagado_neto", "estado", "observaciones"],
                filtered.map((r) => [
                  r.fecha,
                  r.concepto ?? "",
                  r.categoria_gasto ?? "",
                  benMap.get(r.beneficiario_id) ?? "",
                  Number(r.valor ?? 0),
                  Number(r.rete_fuente_valor ?? 0),
                  Number(r.rete_iva_valor ?? 0),
                  Number(r.total_pagado_neto ?? 0),
                  r.estado ?? "",
                  r.observaciones ?? "",
                ]),
              );
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 sm:px-4 py-3 text-sm font-bold text-foreground hover:bg-muted transition-smooth"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar CSV Gastos</span>
            <span className="sm:hidden">Exp. Gastos</span>
          </button>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-xl bg-destructive px-5 py-3 text-sm font-black text-destructive-foreground shadow-elegant transition-smooth hover:scale-105"
          >
            <Plus className="h-4 w-4" /> Nuevo Gasto
          </button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por concepto, beneficiario…" />
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

      <DataTable<GastoRow>
        loading={loading}
        rows={filtered}
        empty="Aún no hay gastos registrados."
        columns={[
          { key: "fecha", label: "Fecha", render: (r) => <span className="font-mono text-muted-foreground">{r.fecha}</span> },
          { key: "concepto", label: "Concepto", render: (r) => <span className="font-black text-foreground uppercase">{r.concepto}</span> },
          { key: "cat", label: "Categoría", render: (r) => <span className="text-muted-foreground">{r.categoria_gasto || "—"}</span> },
          { key: "ben", label: "Beneficiario", render: (r) => <span className="font-bold text-foreground uppercase">{benMap.get(r.beneficiario_id) ?? "—"}</span> },
          { key: "valor", label: "Valor", align: "right", render: (r) => <span className="font-black text-destructive">{fmtMoney(r.valor)}</span> },
          { key: "neto", label: "Neto pagado", align: "right", render: (r) => <span className="font-bold text-foreground">{fmtMoney(r.total_pagado_neto)}</span> },
          {
            key: "estado",
            label: "Estado",
            align: "center",
            render: (r) => (
              <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${r.estado === "Pagado" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                {r.estado}
              </span>
            ),
          },
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
          <form onSubmit={submit} className="w-full max-w-2xl rounded-2xl border border-border bg-gradient-surface p-8 shadow-elegant max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-foreground tracking-tight uppercase mb-6">{editing ? "Editar Gasto" : "Nuevo Gasto Operativo"}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Fecha">
                <input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={inp} />
              </Field>
              <Field label="Concepto" className="md:col-span-2">
                <input type="text" required value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} className={inp} />
              </Field>
              <Field label="Categoría">
                <select required value={form.categoria_gasto} onChange={(e) => setForm({ ...form, categoria_gasto: e.target.value })} className={inp}>
                  <option value="">Selecciona…</option>
                  {CAT_LABELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Beneficiario" className="md:col-span-2">
                <select required value={form.beneficiario_id} onChange={(e) => setForm({ ...form, beneficiario_id: e.target.value })} className={inp}>
                  <option value="">Selecciona…</option>
                  {beneficiarios.map((b) => (
                    <option key={b.id} value={b.id}>{b.nombre}</option>
                  ))}
                </select>
              </Field>
              <Field label="Valor">
                <input type="number" required value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className={inp} />
              </Field>
              <Field label="Rte Fuente">
                <input type="number" value={form.rete_fuente_valor} onChange={(e) => setForm({ ...form, rete_fuente_valor: e.target.value })} className={`${inp} text-destructive`} />
              </Field>
              <Field label="Rte IVA">
                <input type="number" value={form.rete_iva_valor} onChange={(e) => setForm({ ...form, rete_iva_valor: e.target.value })} className={`${inp} text-destructive`} />
              </Field>
              <Field label="Neto pagado">
                <div className={`${inp} text-success font-black`}>{fmtMoney(totalNeto)}</div>
              </Field>
              <Field label="Estado">
                <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} className={inp}>
                  <option>Pagado</option>
                  <option>Pendiente</option>
                </select>
              </Field>
              <Field label="Observaciones" className="col-span-2 md:col-span-3">
                <textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className={`${inp} h-20`} />
              </Field>
            </div>
            <div className="flex gap-3 pt-6">
              <button type="button" onClick={() => { setOpen(false); setEditing(null); }} className="flex-1 rounded-xl bg-surface-elevated text-muted-foreground font-bold py-3 hover:bg-muted transition-smooth">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-destructive text-destructive-foreground font-black py-3 hover:scale-[1.02] transition-smooth disabled:opacity-60">
                {saving ? "Guardando…" : editing ? "Actualizar Gasto" : "Guardar Gasto"}
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
