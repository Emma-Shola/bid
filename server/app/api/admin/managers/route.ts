import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { hashPassword } from "@/lib/password";
import { createNotifications } from "@/lib/notifications";
import { publishEvent } from "@/lib/realtime";
import { adminCreateManagerSchema } from "@/lib/validators";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { extractResumeText } from "@/lib/resume-text";
import { saveResumeFile, validateResumeFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "admin:manager:create", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const formData = await req.formData();
    const file = formData.get("template");

    if (!(file instanceof File)) {
      return jsonError("Manager CV template file is required", 422);
    }

    const parsed = adminCreateManagerSchema.safeParse({
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      isApproved:
        formData.get("isApproved") === null
          ? undefined
          : String(formData.get("isApproved")).toLowerCase() === "true"
    });

    if (!parsed.success) {
      return jsonError("Invalid manager payload", 422, parsed.error.flatten());
    }

    const existing = await prisma.user.findUnique({
      where: { username: parsed.data.username }
    });

    if (existing) {
      return jsonError("Username is already taken", 409);
    }

    const validationError = validateResumeFile(file.name, file.type, file.size);
    if (validationError) {
      return jsonError(validationError, 422);
    }

    const bytes = await file.arrayBuffer();
    const saved = await saveResumeFile({
      userId: `manager-${parsed.data.username.trim()}`,
      fileName: file.name,
      mimeType: file.type,
      bytes
    });
    const extracted = await extractResumeText({
      fileName: file.name,
      mimeType: file.type,
      bytes
    });

    if (!extracted.text.trim()) {
      return jsonError("We could not extract text from this resume. Upload a clearer PDF/DOCX/TXT/image or paste text manually.", 422);
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: parsed.data.username.trim(),
          passwordHash,
          role: UserRole.manager,
          isApproved: parsed.data.isApproved
        }
      });

      const managerProfile = await tx.managerProfile.create({
        data: {
          id: user.id,
          email: parsed.data.email.trim(),
          fullName: parsed.data.fullName.trim(),
          templateResumeUrl: saved.url,
          templateResumeText: extracted.text
        }
      });

      await tx.resume.create({
        data: {
          managerId: user.id,
          createdById: auth.user.id,
          title: `${parsed.data.fullName.trim()} - Primary Resume`,
          originalText: extracted.text,
          fileUrl: saved.url
        }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "manager.created",
          details: {
            managerUserId: user.id,
            username: user.username,
            templateResumeUrl: saved.url
          }
        }
      });

      return { user, managerProfile };
    });

    await createNotifications([created.user.id], {
      type: "manager.created",
      title: "Manager account created",
      body: "Your manager account was created and a CV template has been attached by admin.",
      link: "/login",
      data: {
        managerUserId: created.user.id
      }
    });

    publishEvent(
      "manager.created",
      {
        user: {
          id: created.user.id,
          username: created.user.username,
          role: created.user.role,
          isApproved: created.user.isApproved
        }
      },
      {
        roles: [UserRole.admin],
        userIds: [created.user.id]
      }
    );

    return jsonOk(
      {
        user: {
          id: created.user.id,
          username: created.user.username,
          role: created.user.role,
          isApproved: created.user.isApproved
        },
        managerProfile: {
          email: created.managerProfile.email,
          fullName: created.managerProfile.fullName,
          templateResumeUrl: created.managerProfile.templateResumeUrl
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("admin managers POST failed", error);
    return jsonError("Failed to create manager account", 500);
  }
}
