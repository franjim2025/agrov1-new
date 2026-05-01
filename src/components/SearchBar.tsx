import { Search } from "lucide-react";

export function SearchBar({
  value,
  onChange,
  placeholder = "Buscar…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex-1 min-w-[220px] max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-background border border-border rounded-xl pl-10 pr-3 py-2.5 text-foreground text-sm focus:border-primary outline-none"
      />
    </div>
  );
}

export function matchText(haystack: unknown, needle: string) {
  if (!needle) return true;
  return String(haystack ?? "")
    .toLowerCase()
    .includes(needle.toLowerCase());
}
