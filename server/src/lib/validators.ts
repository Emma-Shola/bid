import { ApplicationStatus, UserRole } from "@prisma/client";
import { z } from "zod";

const resumeUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => /^https?:\/\//i.test(value) || value.startsWith("/"), {
    message: "Resume URL must be a valid URL or local upload path"
  })
  .optional()
  .or(z.literal(""));

export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100),
  role: z.enum([UserRole.bidder, UserRole.manager]).default(UserRole.bidder),
  email: z.string().email().optional(),
  fullName: z.string().min(2).max(255).optional()
});

export const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(1)
});

export const applicationCreateSchema = z.object({
  jobTitle: z.string().min(2).max(500),
  company: z.string().min(2).max(255),
  jobUrl: z.string().url().optional().or(z.literal("")),
  jobDescription: z.string().min(10),
  resumeUrl: resumeUrlSchema,
  notes: z.string().optional(),
  salaryMin: z.coerce.number().nonnegative().optional(),
  salaryMax: z.coerce.number().nonnegative().optional()
});

export const applicationUpdateSchema = applicationCreateSchema.partial().extend({
  status: z.enum([
    ApplicationStatus.submitted,
    ApplicationStatus.reviewed,
    ApplicationStatus.interviewed,
    ApplicationStatus.rejected,
    ApplicationStatus.hired
  ]).optional()
});

export const paymentCreateSchema = z.object({
  bidderId: z.string().min(1),
  amount: z.coerce.number().positive(),
  paymentDate: z.string().datetime().optional(),
  notes: z.string().optional()
});

export const generateResumeSchema = z.object({
  resumeId: z.string().min(1).optional(),
  jobTitle: z.string().min(2).max(500),
  company: z.string().min(2).max(255),
  jobDescription: z.string().min(10),
  resumeText: z.string().max(20_000).optional(),
  resumeUrl: resumeUrlSchema,
  preferInline: z.boolean().optional()
});

export const adminResumeCreateSchema = z.object({
  managerId: z.string().min(1),
  title: z.string().trim().min(2).max(255),
  originalText: z.string().trim().min(20).optional()
});

export const resumeListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  managerId: z.string().min(1).optional(),
  q: z.string().trim().max(200).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc")
});

export const applicationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum([
      ApplicationStatus.submitted,
      ApplicationStatus.reviewed,
      ApplicationStatus.interviewed,
      ApplicationStatus.rejected,
      ApplicationStatus.hired
    ])
    .optional(),
  bidderId: z.string().min(1).optional(),
  q: z.string().trim().max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sortBy: z.enum(["createdAt", "submittedDate", "company", "jobTitle"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc")
});

export const paymentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  bidderId: z.string().min(1).optional(),
  managerId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().trim().max(200).optional(),
  sortBy: z.enum(["paymentDate", "createdAt", "amount"]).default("paymentDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc")
});

export const adminUserListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().max(200).optional(),
  role: z.enum([UserRole.bidder, UserRole.manager, UserRole.admin]).optional(),
  isApproved: z.enum(["true", "false"]).optional().transform((value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  }),
  sortBy: z.enum(["createdAt", "username"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc")
});

export const auditLogListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  userId: z.string().min(1).optional(),
  action: z.string().trim().max(255).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc")
});

export const backgroundJobListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  userId: z.string().min(1).optional(),
  type: z.string().trim().max(100).optional(),
  status: z
    .enum(["queued", "processing", "retrying", "completed", "failed", "dead_letter"])
    .optional(),
  q: z.string().trim().max(255).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "attempts"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc")
});

export const uploadResumeSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100)
});

export const adminUserUpdateSchema = z.object({
  role: z.enum([UserRole.bidder, UserRole.manager, UserRole.admin]).optional(),
  isApproved: z.boolean().optional(),
  email: z.string().email().optional(),
  fullName: z.string().min(2).max(255).optional(),
  managerId: z.string().min(1).nullable().optional()
});

export const adminCreateManagerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100),
  fullName: z.string().min(2).max(255),
  email: z.string().email(),
  isApproved: z.boolean().optional().default(true)
});
