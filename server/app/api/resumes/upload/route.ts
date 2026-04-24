import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "resumes:upload", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    // Allow managers and admins to upload
    if (auth.user.role !== UserRole.manager && auth.user.role !== UserRole.admin) {
      return jsonError("Only managers and admins can upload resumes", 403);
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const title = String(formData.get("title") ?? "").trim();
    const managerId = String(formData.get("managerId") ?? "").trim() || auth.user.id;
    const providedText = String(formData.get("originalText") ?? "").trim();

    // Validate inputs
    if (!title) {
      return jsonError("Resume title is required", 422);
    }

    if (!managerId) {
      return jsonError("Manager ID is required", 422);
    }

    // Verify manager exists and user has access
    const manager = await prisma.user.findUnique({
      where: { id: managerId },
      select: { id: true, role: true, username: true, managerProfile: true }
    });

    if (!manager || manager.role !== UserRole.manager) {
      return jsonError("Manager not found", 422);
    }

    // Verify auth user is the manager or is admin
    if (auth.user.role === UserRole.manager && auth.user.id !== managerId) {
      return jsonError("Forbidden", 403);
    }

    let fileUrl: string | null = null;
    let extractedText = providedText;

    // 🔍 Process file if provided
    if (file instanceof File) {
      console.log("=== FILE UPLOAD DEBUG ===");
      console.log("File name:", file.name);
      console.log("File size:", file.size);
      console.log("File type:", file.type);

      if (file.size === 0) {
        return jsonError("File is empty", 422);
      }

      // ✅ Convert file → buffer
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      console.log("Buffer length:", buffer.length);

      if (buffer.length === 0) {
        return jsonError("Buffer is empty", 422);
      }

      // 📄 Extract text
      if (file.type === "application/pdf") {
        try {
          const pdfParseModule = await import("pdf-parse");
          const legacyParser = (pdfParseModule as { default?: (input: Buffer) => Promise<{ text?: string }> }).default;
          if (typeof legacyParser === "function") {
            const pdfData = await legacyParser(buffer);
            extractedText = pdfData.text || "";
          }
        } catch (pdfError) {
          console.error("PDF parsing error:", pdfError);
          return jsonError("Failed to parse PDF file", 422);
        }
      } else if (file.type === "text/plain") {
        extractedText = buffer.toString("utf-8");
      } else {
        return jsonError("Only PDF and TXT files are supported", 422);
      }

      console.log("Extracted text length:", extractedText.length);

      // 💾 Save file locally for reference
      const uploadDir = path.join(process.cwd(), "public", "uploads", "resumes");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const timestamp = Date.now();
      const safeFileName = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = path.join(uploadDir, safeFileName);
      fs.writeFileSync(filePath, buffer);

      fileUrl = `/uploads/resumes/${safeFileName}`;
      console.log("File saved to:", fileUrl);
    }

    // Use provided text if no file, otherwise use extracted text
    const finalText = providedText || extractedText;

    if (!finalText || finalText.trim().length < 20) {
      return jsonError(
        "Could not extract resume text. Upload a clearer PDF/DOCX/TXT/image or paste the full resume text directly.",
        422
      );
    }

    // 🗄️ Save to database
    const resume = await prisma.$transaction(async (tx) => {
      const created = await tx.resume.create({
        data: {
          managerId: manager.id,
          createdById: auth.user.id,
          title,
          originalText: finalText,
          fileUrl
        },
        select: {
          id: true,
          managerId: true,
          title: true,
          fileUrl: true,
          createdAt: true,
          updatedAt: true
        }
      });

      await tx.managerProfile.upsert({
        where: { id: manager.id },
        update: {
          templateResumeUrl: fileUrl ?? manager.managerProfile?.templateResumeUrl ?? null,
          templateResumeText: finalText
        },
        create: {
          id: manager.id,
          email: `${manager.username}@example.com`,
          fullName: manager.username,
          templateResumeUrl: fileUrl,
          templateResumeText: finalText
        }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "resume.created",
          details: {
            resumeId: created.id,
            managerId: manager.id,
            title: created.title,
            hasFile: !!fileUrl
          }
        }
      });

      return created;
    });

    console.log("Resume saved to database with ID:", resume.id);

    return jsonOk(
      {
        resume: {
          ...resume,
          textLength: finalText.length
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("resumes upload POST failed", error);
    return jsonError("Failed to upload resume", 500);
  }
}
