import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { looksLikeResumeDocument, parseResumeMarkdown } from "@/lib/resume-format";
import {
  buildResumePreviewModel,
  type GeneratedResumeStructured,
  type ResumePreviewModel,
} from "@/lib/resume-preview";
import { ResumeTemplate } from "./template";

type Props = HTMLAttributes<HTMLDivElement> & {
  content?: string;
  structured?: GeneratedResumeStructured | null;
};

function buildFallbackModelFromMarkdown(content: string): ResumePreviewModel {
  const doc = parseResumeMarkdown(content);
  const fallbackModel: ResumePreviewModel = {
    name: doc.name || "Resume",
    title: "",
    contactLine: "",
    linksLine: "",
    summary: doc.intro.join(" "),
    skillCategories: [],
    skills: [],
    experience: [],
    education: [],
    certificates: [],
  };

  const looksLikeCertification = (value: string) => {
    const text = value.trim();
    if (!text) return false;
    if (/^(certificates?|certifications?|licenses?|licenses & certifications)$/i.test(text)) return false;
    if (/\b(certified|certification|certificate|licensed|license)\b/i.test(text)) return true;
    if (/\b(AWS|Microsoft|Google|Oracle|Cisco|CompTIA|PMP|CISSP|CISA|CEH|CKA|CKAD|ITIL|Scrum|Salesforce|Databricks|SnowPro|Docker|Kubernetes|Terraform|RHCSA|Red Hat|Linux Foundation)\b/i.test(text)) {
      return true;
    }
    return false;
  };

  doc.sections.forEach((section) => {
    const title = section.title.trim().toLowerCase();

    if (/summary/.test(title) && !fallbackModel.summary) {
      fallbackModel.summary = section.entries.map((entry) => entry.text).join(" ");
      return;
    }

    if (/skills/.test(title)) {
      fallbackModel.skills = section.entries.map((entry) => entry.text);
      return;
    }

    if (/experience|work history|employment/.test(title)) {
      fallbackModel.experience = section.entries.map((entry) => ({
        role: "",
        company: "",
        duration: "",
        location: "",
        bullets: [entry.text],
      }));
      return;
    }

    if (/education/.test(title)) {
      fallbackModel.education = section.entries.map((entry) => ({
        school: "",
        degree: "",
        duration: "",
        location: "",
        details: [entry.text],
      }));
      return;
    }

    if (/^(certificate|certificates|certification|certifications|license|licenses|licenses & certifications)$/i.test(title)) {
      fallbackModel.certificates = section.entries.map((entry) => entry.text).filter(looksLikeCertification);
    }
  });

  return fallbackModel;
}

function EmptyState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500", className)}
      {...props}
    >
      <p className="font-medium text-slate-900">Resume preview</p>
      <p className="mt-2 whitespace-pre-wrap">The generated resume will appear here.</p>
    </div>
  );
}

export function ResumeDocumentPreview({ content = "", structured, className, ...props }: Props) {
  if (structured) {
    return (
      <div className={cn(className)} {...props}>
        <ResumeTemplate model={buildResumePreviewModel(structured)} />
      </div>
    );
  }

  if (content.trim() && looksLikeResumeDocument(content)) {
    return (
      <div className={cn(className)} {...props}>
        <ResumeTemplate model={buildFallbackModelFromMarkdown(content)} />
      </div>
    );
  }

  return <EmptyState className={className} {...props} />;
}
