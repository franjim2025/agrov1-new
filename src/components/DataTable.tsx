export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  loading,
  empty,
}: {
  columns: { key: string; label: string; align?: "left" | "right" | "center"; render: (row: T) => React.ReactNode }[];
  rows: T[];
  loading?: boolean;
  empty?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-gradient-surface shadow-elegant overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[720px]">
          <thead className="bg-surface-elevated/60 border-b border-border">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-6 py-4 text-[10px] font-black tracking-widest uppercase text-muted-foreground text-${c.align ?? "left"}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-muted-foreground text-sm">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-muted-foreground text-sm">
                  {empty ?? "Sin registros"}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-elevated/40 transition-smooth">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-6 py-4 text-sm text-${c.align ?? "left"}`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
