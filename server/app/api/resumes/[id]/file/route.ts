import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import path from "node:path";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function inferContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "resumes:file", limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    const resumeId = context.params.id;
    let managerId = "";
    let fileUrl = "";

    if (resumeId.startsWith("legacy-template-")) {
      managerId = resumeId.replace("legacy-template-", "");
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
        select: {
          managerProfile: {
            select: {
              templateResumeUrl: true
            }
          }
        }
      });

      fileUrl = manager?.managerProfile?.templateResumeUrl ?? "";
    } else {
      const resume = await prisma.resume.findUnique({
        where: { id: resumeId },
        select: {
          id: true,
          managerId: true,
          fileUrl: true
        }
      });

      if (!resume) {
        return jsonError("Resume not found", 404);
      }

      managerId = resume.managerId;
      fileUrl = resume.fileUrl ?? "";
    }

    const allowed =
      auth.user.role === UserRole.admin ||
      (auth.user.role === UserRole.manager && auth.user.id === managerId) ||
      (auth.user.role === UserRole.bidder && auth.user.bidder?.managerId === managerId);

    if (!allowed) {
      return jsonError("Forbidden", 403);
    }

    if (!fileUrl) {
      return jsonError("No file is attached to this resume template", 404);
    }

    if (/^https?:\/\//i.test(fileUrl)) {
      const upstream = await fetch(fileUrl);
      if (!upstream.ok) {
        return jsonError("Could not read remote resume file", 502);
      }

      const bytes = await upstream.arrayBuffer();
      const contentType = upstream.headers.get("content-type") || inferContentType(fileUrl);
      const fileName = path.basename(new URL(fileUrl).pathname) || "resume";

      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${fileName}"`,
          "Cache-Control": "private, max-age=300"
        }
      });
    }

    const normalized = fileUrl.startsWith("/") ? fileUrl.slice(1) : fileUrl;
    const absolute = path.resolve(process.cwd(), "public", normalized);
    const publicRoot = path.resolve(process.cwd(), "public");
    if (!absolute.startsWith(publicRoot)) {
      return jsonError("Invalid file path", 400);
    }

    const buffer = await readFile(absolute);
    const fileName = path.basename(absolute) || "resume";
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": inferContentType(absolute),
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=300"
      }
    });
  } catch (error) {
    console.error("resume file GET failed", error);
    return jsonError("Failed to open resume file", 500);
  }
}
