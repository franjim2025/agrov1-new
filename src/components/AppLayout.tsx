import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Boxes,
  Wallet,
  TrendingUp,
  ShoppingCart,
  Leaf,
  Menu,
  X,
  LogOut,
  Users,
  Package,
  ClipboardList,
  Shield,
  UserCircle,
  ChevronDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth, type Section } from "@/lib/auth";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type NavItem = { to: string; label: string; emoji: string; icon: typeof LayoutDashboard; section: Section };
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Poblar datos",
    items: [
      { to: "/maestro", label: "Ingresar Insumos", emoji: "📥", icon: Package, section: "maestro" },
      { to: "/contactos", label: "Ingresar Contactos", emoji: "👤", icon: Users, section: "contactos" },
    ],
  },
  {
    title: "Tableros",
    items: [
      { to: "/", label: "Dashboard", emoji: "📊", icon: LayoutDashboard, section: "dashboard" },
      { to: "/inventario", label: "Inventario", emoji: "📦", icon: Boxes, section: "inventario" },
    ],
  },
  {
    title: "Operativos",
    items: [
      { to: "/uso", label: "Registro de Uso", emoji: "🚜", icon: ClipboardList, section: "registro_uso" },
      { to: "/gastos", label: "Gastos Operativos", emoji: "📉", icon: Wallet, section: "gastos" },
    ],
  },
  {
    title: "Financieros",
    items: [
      { to: "/compras", label: "Compras", emoji: "🛒", icon: ShoppingCart, section: "compras" },
      { to: "/ventas", label: "Ventas", emoji: "💰", icon: TrendingUp, section: "ventas" },
    ],
  },
  {
    title: "Seguridad",
    items: [
      { to: "/admin", label: "Control de Roles", emoji: "👥", icon: Shield, section: "admin" },
    ],
  },
  {
    title: "Cuenta",
    items: [
      { to: "/perfil", label: "Mi Perfil", emoji: "👤", icon: UserCircle, section: "perfil" },
    ],
  },
];

export function AppLayout({ children, title, subtitle, actions }: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { user, signOut, rol, nombreCompleto, can } = useAuth();

  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((n) => can(n.section)) }))
    .filter((g) => g.items.length > 0);

  // Estado abierto/cerrado por grupo. El grupo del path activo se abre por defecto.
  const initiallyOpen = (g: NavGroup) =>
    g.items.some((n) => (n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to)));

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(visibleGroups.map((g) => [g.title, initiallyOpen(g)])),
  );

  // Mantener abierto el grupo de la ruta activa al navegar.
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const g of visibleGroups) {
        if (initiallyOpen(g)) next[g.title] = true;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const rolNorm = (rol ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

  const rolBadgeClass =
    rolNorm === "dueno" || rolNorm === "duenio" || rolNorm === "gerente" || rolNorm === "admin"
      ? "bg-info/15 text-info ring-1 ring-info/30"
      : rolNorm === "secretaria"
        ? "bg-success/15 text-success ring-1 ring-success/30"
        : rolNorm === "agricultor" || rolNorm === "conductor"
          ? "bg-warning/15 text-warning ring-1 ring-warning/30"
          : "bg-muted text-muted-foreground ring-1 ring-border";

  const displayName =
    nombreCompleto && nombreCompleto.trim() ? nombreCompleto : user?.email ?? "—";

  return (
    <div className="flex h-screen overflow-hidden">
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed lg:static z-50 h-full w-64 shrink-0 border-r border-border bg-gradient-surface flex flex-col transition-transform",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="bg-gradient-primary p-2.5 rounded-xl shadow-glow">
              <Leaf className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="text-foreground font-black text-base tracking-tight leading-none">
                APP NEGOCIOS
              </div>
              <div className="text-primary text-xs font-bold tracking-widest mt-1">
                AGRO
              </div>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
          {visibleGroups.map((group) => {
            const isOpen = openGroups[group.title] ?? false;
            return (
              <Collapsible
                key={group.title}
                open={isOpen}
                onOpenChange={(v) => setOpenGroups((p) => ({ ...p, [group.title]: v }))}
              >
                <CollapsibleTrigger
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-2 rounded-lg",
                    "text-[10px] uppercase tracking-widest font-black",
                    "text-muted-foreground/80 hover:text-foreground hover:bg-surface-elevated/50 transition-smooth",
                  )}
                >
                  <span>{group.title}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-200",
                      isOpen ? "rotate-180" : "rotate-0",
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 space-y-1 overflow-hidden">
                  {group.items.map((item) => {
                    const active =
                      item.to === "/"
                        ? location.pathname === "/"
                        : location.pathname.startsWith(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-smooth border-l-2 ml-1",
                          active
                            ? "bg-surface-elevated text-primary border-primary shadow-elegant"
                            : "text-muted-foreground border-transparent hover:bg-surface-elevated/60 hover:text-foreground"
                        )}
                      >
                        <span className="text-base leading-none" aria-hidden>{item.emoji}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">
              Sesión
            </div>
            <div className="text-foreground font-bold text-sm mt-1 truncate">
              {displayName}
            </div>
            <div className="text-muted-foreground text-[11px] truncate">
              {user?.email ?? ""}
            </div>
            <div className="mt-2">
              {rol ? (
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider", rolBadgeClass)}>
                  {rol}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-destructive/15 text-destructive ring-1 ring-destructive/30 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
                  Sin rol
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 rounded-xl bg-surface-elevated/60 hover:bg-surface-elevated text-muted-foreground hover:text-foreground px-3 py-2 text-xs font-bold transition-smooth"
          >
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border">
          <div className="flex items-center justify-between px-6 lg:px-10 py-5">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setOpen(true)}
                className="lg:hidden bg-surface-elevated p-2.5 rounded-xl text-foreground"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl lg:text-3xl font-black text-foreground tracking-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-xs lg:text-sm text-muted-foreground font-medium mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            {actions}
          </div>
        </header>

        <div className="p-6 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
