import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zzqujrarwjxpkrbwtdxl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_o5Map4HlSDHtKjAC6SntIQ_KekYnjfX";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

// ===== Schema real =====

export type Contacto = {
  id: string;
  nombre: string;
  tipo: string; // proveedor | cliente | beneficiario
  identificacion?: string | null;
  telefono?: string | null;
  correo?: string | null;
  municipio?: string | null;
};

export type MaestroItem = {
  id: string;
  nombre: string | null;
  categoria?: string | null;
  unidad_medida?: string | null;
  presentacion: string;
  factor_conversion: number;
};

export type InventarioRow = {
  id: string;
  producto_id: string;
  stock_actual: number;
  stock_minimo: number;
  estado_alerta?: string | null;
  ultima_actualizacion?: string;
};

export type CompraRow = {
  id: string;
  fecha: string;
  proveedor_id: string;
  producto_id: string;
  concepto?: string | null;
  cantidad?: number | null;
  valor_unitario?: number | null;
  subtotal?: number | null;
  iva?: number | null;
  porcentaje_iva?: number | null;
  rte_fuente?: number | null;
  rte_ica?: number | null;
  impuesto_consumo?: number | null;
  total?: number | null;
  numero_factura?: string | null;
  metodo_pago?: string | null;
  observaciones?: string | null;
};

export type VentaRow = {
  id: string;
  fecha: string;
  cliente_id: string;
  producto_id: string;
  cantidad?: number | null;
  precio_unidad?: number | null;
  subtotal?: number | null;
  porcentaje_iva?: number | null;
  iva?: number | null;
  rte_fuente?: number | null;
  total?: number | null;
};

export type GastoRow = {
  id: string;
  fecha: string;
  beneficiario_id: string;
  concepto: string;
  categoria_gasto?: string | null;
  valor: number;
  rete_fuente_valor?: number | null;
  rete_iva_valor?: number | null;
  total_pagado_neto?: number | null;
  estado: string;
  observaciones?: string | null;
  registrado_por?: string | null;
};

export type ProductoVenta = {
  id: string;
  nombre: string;
  unidad_medida?: string | null;
  precio_unidad?: number | null;
};

export type RegistroUso = {
  id: string;
  fecha: string;
  producto_id: string;
  cantidad_usada: number;
  unidad_usada?: string | null;
  observaciones?: string | null;
};

export const fmtMoney = (n: number | null | undefined) =>
  "$" + Number(n || 0).toLocaleString("es-CO");

export const fmtNum = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("es-CO");

// ===== Helpers de inventario =====

/**
 * Ajusta stock_actual del inventario para un producto.
 * delta positivo = entrada (compra); negativo = salida (venta/uso).
 * cantidad ya viene en unidad base (multiplicada por factor_conversion si aplica).
 */
export async function ajustarStock(
  producto_id: string,
  delta: number,
  user_id: string,
) {
  const { data: existing } = await supabase
    .from("inventario")
    .select("id, stock_actual, stock_minimo")
    .eq("producto_id", producto_id)
    .maybeSingle();

  if (existing) {
    const nuevo = Number(existing.stock_actual || 0) + delta;
    const estado_alerta =
      nuevo <= 0 ? "AGOTADO" : nuevo <= Number(existing.stock_minimo || 0) ? "BAJO" : "OK";
    await supabase
      .from("inventario")
      .update({
        stock_actual: nuevo,
        estado_alerta,
        ultima_actualizacion: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    const estado_alerta = delta <= 0 ? "AGOTADO" : "OK";
    await supabase.from("inventario").insert([
      {
        producto_id,
        stock_actual: delta,
        stock_minimo: 0,
        estado_alerta,
        user_id,
      },
    ]);
  }
}
