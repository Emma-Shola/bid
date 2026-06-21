import { Prisma } from "@prisma/client";

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  const clean = (item: unknown): Prisma.InputJsonValue | null => {
    if (item === undefined || item === null) {
      return null;
    }

    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      return item;
    }

    if (item instanceof Date) {
      return item.toISOString();
    }

    if (Array.isArray(item)) {
      return item.map((entry) => clean(entry));
    }

    if (typeof item === "object") {
      const output: Record<string, Prisma.InputJsonValue | null> = {};
      for (const [key, entry] of Object.entries(item as Record<string, unknown>)) {
        if (entry !== undefined) {
          output[key] = clean(entry);
        }
      }
      return output as Prisma.InputJsonObject;
    }

    return String(item);
  };

  return clean(value) ?? {};
}
