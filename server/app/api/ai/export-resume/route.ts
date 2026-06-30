import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/rbac";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { applyCorsHeaders } from "@/lib/cors";
import { buildResumeDocxBuffer, buildResumePdfBuffer } from "@/lib/resume/exporter";
import { type ParsedResume, type TailoredResume } from "@/lib/resume/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const exportSchema = z.object({
  structured: z.object({
    source: z.record(z.unknown()),
    tailored: z.record(z.unknown()),
  }),
  jobTitle: z.string().min(1).max(500),
  company: z.string().min(1).max(255),
  format: z.enum(["pdf", "docx"]).default("pdf"),
});

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "ai:export-resume", limit: 30, windowMs: 60_000 });
    if (limited) return applyCorsHeaders(req, limited);

    const auth = await getAuthUser(req);
    if (!auth) return applyCorsHeaders(req, jsonError("Unauthorized", 401));
    if (auth.user.role === UserRole.admin) {
      // admins don't generate resumes
    } else if (auth.user.role !== UserRole.bidder && auth.user.role !== UserRole.manager) {
      return applyCorsHeaders(req, jsonError("Forbidden", 403));
    }

    const body = await req.json().catch(() => null);
    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(req, jsonError("Invalid export payload", 422, parsed.error.flatten()));
    }

    const { structured, jobTitle, company, format } = parsed.data;

    const source = structured.source as ParsedResume;
    const tailored = structured.tailored as TailoredResume;

    const buffer =
      format === "docx"
        ? await buildResumeDocxBuffer({ source, tailored })
        : await buildResumePdfBuffer({ source, tailored });

    const fileBase = sanitizeFileName([jobTitle, company, format].filter(Boolean).join("-"));
    const contentType =
      format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";

    const response = new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileBase}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
    response.headers.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Type");
    return applyCorsHeaders(req, response);
  } catch (error) {
    console.error("[export-resume] threw", error);
    return applyCorsHeaders(req, jsonError("Failed to export resume", 500));
  }
}
