import React from "react";
import { RESUME_RENDER_TOKENS } from "@/resume-rendering";

type SkillGroup = {
  category?: string;
  label?: string;
  name?: string;
  title?: string;
  skills?: unknown;
  values?: unknown;
  items?: unknown;
  list?: unknown;
};

type SkillsSectionProps = {
  skills?: unknown;
  data?: { skills?: unknown };
  resume?: { skills?: unknown };
  className?: string;
};

function toStringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function normalizeValues(value: unknown): string[] {
  return asArray(value)
    .flatMap((item) => {
      if (Array.isArray(item)) return item;
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const nested =
          obj.skills ?? obj.values ?? obj.items ?? obj.list ?? obj.value ?? [];
        if (Array.isArray(nested)) return nested;
        const maybeLabel =
          toStringValue(obj.name) ||
          toStringValue(obj.label) ||
          toStringValue(obj.title);
        const maybeValue = toStringValue(obj.value);
        if (maybeLabel && maybeValue) return [`${maybeLabel}: ${maybeValue}`];
        return Object.values(obj)
          .map((entry) => toStringValue(entry))
          .filter(Boolean);
      }
      return [item];
    })
    .map((item) => toStringValue(item))
    .filter(Boolean);
}

export function normalizeGroups(raw: unknown): Array<{ label: string; values: string[] }> {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") {
          const label = "";
          const value = toStringValue(item);
          return value ? { label, values: [value] } : null;
        }

        if (!item || typeof item !== "object") return null;

        const entry = item as SkillGroup & Record<string, unknown>;
        const label =
          toStringValue(entry.category) ||
          toStringValue(entry.label) ||
          toStringValue(entry.name) ||
          toStringValue(entry.title) ||
          "";
        const values = normalizeValues(
          entry.skills ?? entry.values ?? entry.items ?? entry.list ?? entry
        );

        if (!values.length) return null;
        return { label, values };
      })
      .filter((item): item is { label: string; values: string[] } => Boolean(item));
  }

  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .map(([label, values]) => ({
        label,
        values: normalizeValues(values),
      }))
      .filter((item) => item.values.length > 0);
  }

  const fallback = toStringValue(raw);
  return fallback ? [{ label: "", values: [fallback] }] : [];
}

export function SkillsSection(props: SkillsSectionProps) {
  const rawSkills = props.skills ?? props.data?.skills ?? props.resume?.skills;
  const groups = normalizeGroups(rawSkills).filter((group) => group.values.length > 0);

  if (!groups.length) return null;

  return (
    <section className={`space-y-[2px] ${props.className ?? ""}`.trim()}>
      {groups.map((group, index) => {
        const label = group.label.trim();
        const value = group.values.join(", ");
        return (
          <div
            key={`${label || "skills"}-${index}`}
            className="flex items-start gap-2 text-[9.05px] leading-[1.13] text-slate-800"
          >
            <span className="shrink-0 font-semibold text-slate-900" style={{ minWidth: RESUME_RENDER_TOKENS.composition.labelWidth, fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}>
              {label || "Skills"}:
            </span>
            <span className="min-w-0 flex-1 break-words text-slate-700" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSerif }}>{value}</span>
          </div>
        );
      })}
    </section>
  );
}

export default SkillsSection;



