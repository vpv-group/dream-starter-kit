"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";

/** The board's "Search…" box (debounced; ?q= in the URL). */
export function BoardSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get("q") ?? "") === value.trim()) return;
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("page");
      router.replace(`?${next.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(id);
  }, [value, params, router]);

  return (
    <label className="border-input focus-within:ring-ring/50 flex h-8 w-full items-center gap-2 rounded-md border px-2 text-sm focus-within:ring-[3px] sm:w-48">
      <SearchIcon className="text-muted-foreground size-4" aria-hidden />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search…"
        aria-label="Search this board"
        className="placeholder:text-muted-foreground w-full bg-transparent outline-none"
      />
    </label>
  );
}
