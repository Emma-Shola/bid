import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { publishEvent } from "@/lib/realtime";
import { createNotifications } from "@/lib/notifications";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { extractResumeText } from "@/lib/resume-text";
import { saveResumeFile, validateResumeFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "uploads:resume", limit: 10, windowMs: 10 * 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.bidder) {
      return jsonError("Only bidders can upload resumes", 403);
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("Resume file is required", 422);
    }

    const validationError = validateResumeFile(file.name, file.type, file.size);
    if (validationError) {
      return jsonError(validationError, 422);
    }

    const bytes = await file.arrayBuffer();

    const saved = await saveResumeFile({
      userId: auth.user.id,
      fileName: file.name,
      mimeType: file.type,
      bytes
    });
    const extracted = await extractResumeText({
      fileName: file.name,
      mimeType: file.type,
      bytes
    });

    const extractionFailed = !extracted.text || extracted.text.trim().length === 0;

    const bidder = await prisma.bidderProfile.update({
      where: { id: auth.user.id },
      data: { resumeUrl: saved.url }
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "resume.uploaded",
        details: {
          fileName: saved.fileName,
          mimeType: saved.mimeType,
          url: saved.url
        }
      }
    });

    await createNotifications([auth.user.id], {
      type: "resume.uploaded",
      title: "Resume uploaded",
      body: "Your resume file was uploaded successfully.",
      link: "/bidder/resume",
      data: {
        url: saved.url,
        fileName: saved.fileName
      }
    });

    publishEvent(
      "resume.uploaded",
      {
        resumeUrl: bidder.resumeUrl,
        file: saved
      },
      {
        userIds: [auth.user.id]
      }
    );

    return jsonOk({
      resumeUrl: bidder.resumeUrl,
      resumeText: extracted.text,
      extractionWarning: extractionFailed
        ? "We uploaded your file, but could not extract text yet. Resume generation may fail for image-only PDFs."
        : null,
      file: saved
    });
  } catch (error) {
    console.error("resume upload POST failed", error);
    return jsonError("Failed to upload resume", 500);
  }
}
