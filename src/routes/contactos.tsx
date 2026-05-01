import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { AuthGate } from "@/components/AuthGate";
import { DataTable } from "@/components/DataTable";
import { SearchBar, matchText } from "@/components/SearchBar";
import { supabase, type Contacto } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/contactos")({
  head: () => ({ meta: [{ title: "Contactos — App Negocios Agro" }] }),
  component: () => (
    <AuthGate section="contactos">
      <ContactosPage />
    </AuthGate>
  ),
});

const TIPOS = ["proveedor", "cliente", "beneficiario"];

const empty = {
  nombre: "",
  tipo: "proveedor",
  identificacion: "",
  telefono: "",
  correo: "",
  municipio: "",
};

function isEnumError(err: { code?: string; message?: string }) {
  return err?.code === "22P02" || /invalid input value for enum/i.test(err?.message ?? "");
}

function ContactosPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Contacto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("contactos").select("*").order("nombre");
    if (error) toast.error("Error cargando contactos: " + error.message);
    setRows((data as Contacto[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditId(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(r: Contacto) {
    setEditId(r.id);
    setForm({
      nombre: r.nombre ?? "",
      tipo: r.tipo ?? "proveedor",
      identificacion: r.identificacion ?? "",
      telefono: r.telefono ?? "",
      correo: r.correo ?? "",
      municipio: r.municipio ?? "",
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const base = {
      nombre: form.nombre,
      tipo: form.tipo,
      identificacion: form.identificacion || null,
      telefono: form.telefono || null,
      correo: form.correo || null,
      municipio: form.municipio || null,
      registrado_por: user.id,
    };

    if (editId) {
      const { error } = await supabase.from("contactos").update(base).eq("id", editId);
      setSaving(false);
      if (error) return toast.error("No se pudo actualizar: " + error.message);
      toast.success("Contacto actualizado");
    } else {
      const { error } = await supabase.from("contactos").insert([{ ...base, user_id: user.id }]);
      setSaving(false);
      if (error) {
        if (isEnumError(error)) toast.error(`Tipo "${form.tipo}" no permitido por la base de datos.`);
        else toast.error("No se pudo guardar: " + error.message);
        return;
      }
      toast.success("Contacto creado");
    }
    setForm(empty);
    setOpen(false);
    setEditId(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este contacto?")) return;
    const { error } = await supabase.from("contactos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Contacto eliminado");
    load();
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "todos" && String(r.tipo).toLowerCase() !== filter) return false;
      if (!search) return true;
      return (
        matchText(r.nombre, search) ||
        matchText(r.identificacion, search) ||
        matchText(r.telefono, search) ||
        matchText(r.correo, search) ||
        matchText(r.municipio, search)
      );
    });
  }, [rows, filter, search]);

  return (
    <AppLayout
      title="Contactos"
      subtitle="Proveedores, clientes y beneficiarios"
      actions={
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-glow transition-smooth hover:scale-105">
          <Plus className="h-4 w-4" /> Nuevo Contacto
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre, ID, teléfono…" />
        {["todos", ...TIPOS].map((t) => (
          <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-smooth ${filter === t ? "bg-primary text-primary-foreground" : "bg-surface-elevated text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      <DataTable<Contacto>
        loading={loading}
        rows={filtered}
        empty="Aún no hay contactos."
        columns={[
          { key: "nombre", label: "Nombre", render: (r) => <span className="font-black text-foreground uppercase">{r.nombre}</span> },
          { key: "tipo", label: "Tipo", render: (r) => <span className="inline-flex rounded-full bg-info/15 text-info px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">{r.tipo}</span> },
          { key: "id", label: "ID", render: (r) => <span className="text-muted-foreground">{r.identificacion ?? "—"}</span> },
          { key: "tel", label: "Teléfono", render: (r) => <span className="text-muted-foreground">{r.telefono ?? "—"}</span> },
          { key: "mail", label: "Correo", render: (r) => <span className="text-muted-foreground">{r.correo ?? "—"}</span> },
          { key: "mun", label: "Municipio", render: (r) => <span className="text-muted-foreground">{r.municipio ?? "—"}</span> },
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
            <h3 className="text-xl font-black text-foreground tracking-tight uppercase mb-6">{editId ? "Editar Contacto" : "Nuevo Contacto"}</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre" className="col-span-2">
                <input type="text" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={inp} />
              </Field>
              <Field label="Tipo">
                <select required value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className={inp}>
                  {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Identificación">
                <input type="text" value={form.identificacion} onChange={(e) => setForm({ ...form, identificacion: e.target.value })} className={inp} />
              </Field>
              <Field label="Teléfono">
                <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={inp} />
              </Field>
              <Field label="Correo">
                <input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} className={inp} />
              </Field>
              <Field label="Municipio" className="col-span-2">
                <input type="text" value={form.municipio} onChange={(e) => setForm({ ...form, municipio: e.target.value })} className={inp} />
              </Field>
            </div>
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
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-black tracking-widest uppercase text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}
