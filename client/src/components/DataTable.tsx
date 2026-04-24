import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  width?: string;
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchKeys?: (keyof T)[] | ((row: T) => string);
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  toolbar?: ReactNode;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  searchable = true,
  searchPlaceholder = "Search…",
  searchKeys,
  pageSize = 10,
  emptyTitle,
  emptyDescription,
  onRowClick,
  toolbar,
}: Props<T>) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const filtered = useMemo(() => {
    if (!q.trim()) return data;
    const needle = q.toLowerCase();
    return data.filter((row) => {
      let hay = "";
      if (typeof searchKeys === "function") {
        hay = searchKeys(row);
      } else if (Array.isArray(searchKeys)) {
        hay = searchKeys.map((k) => String(row[k] ?? "")).join(" ");
      } else {
        hay = JSON.stringify(row);
      }
      return hay.toLowerCase().includes(needle);
    });
  }, [data, q, searchKeys]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const copy = [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filtered, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="rounded-lg border border-border bg-card">
      {(searchable || toolbar) && (
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          {searchable ? (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="h-9 pl-8"
              />
            </div>
          ) : <div />}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(c.sortable && "cursor-pointer select-none", c.className)}
                  onClick={() => {
                    if (!c.sortable) return;
                    setSort((prev) =>
                      prev?.key === c.key
                        ? { key: c.key, dir: prev.dir === "asc" ? "desc" : "asc" }
                        : { key: c.key, dir: "asc" },
                    );
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {sort?.key === c.key && (
                      <span className="text-2xs text-muted-foreground">{sort.dir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {pageRows.length === 0 && (
          <div className="p-4">
            <EmptyState title={emptyTitle ?? "No results"} description={emptyDescription ?? "Try adjusting your filters."} />
          </div>
        )}
      </div>

      {sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm">
          <p className="text-xs text-muted-foreground tabular-nums">
            {safePage * pageSize + 1}–{Math.min(sorted.length, safePage * pageSize + pageSize)} of {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-xs tabular-nums">
              Page {safePage + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
