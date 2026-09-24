"use client";

import { useEffect, useRef } from "react";
import type { CourseType } from "@/lib/types";

const TYPE_OPTIONS: { value: CourseType | "all"; label: string }[] = [
  { value: "all", label: "Todos los tipos" },
  { value: "nucleo", label: "Núcleo" },
  { value: "electiva", label: "Electivas" },
  { value: "cbu", label: "CBU" },
  { value: "complementaria", label: "Libre elección" },
  { value: "proyecto", label: "Proyectos" },
];

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  typeFilter: CourseType | "all";
  onTypeFilterChange: (t: CourseType | "all") => void;
  onlyAvailable: boolean;
  onOnlyAvailableChange: (v: boolean) => void;
  mode: "explore" | "progress";
  onClose: () => void;
}

export default function SearchBar({
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  onlyAvailable,
  onOnlyAvailableChange,
  mode,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        type="text"
        placeholder="Buscar por código o nombre..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />
      <select
        value={typeFilter}
        onChange={(e) => onTypeFilterChange(e.target.value as CourseType | "all")}
      >
        {TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {mode === "progress" && (
        <label className="only-available">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => onOnlyAvailableChange(e.target.checked)}
          />
          Solo lo que puedo tomar ya
        </label>
      )}
      <button className="search-bar-close" onClick={onClose} aria-label="Cerrar búsqueda">
        ×
      </button>
    </div>
  );
}
