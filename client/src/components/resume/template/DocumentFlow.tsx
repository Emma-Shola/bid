import React from "react";
import SkillsSection, { normalizeGroups as normalizeSkillGroups } from "./SkillsSection";
import { RESUME_RENDER_TOKENS } from "@/resume-rendering";

type ResumeFlowProps = {
  resume?: unknown;
  data?: unknown;
  model?: unknown;
  candidate?: unknown;
  profile?: unknown;
  className?: string;
};

type RecordLike = Record<string, unknown>;

function asObject(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : {};
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function pickString(source: RecordLike, keys: string[]) {
  for (const key of keys) {
    const value = text(source[key]);
    if (value) return value;
  }
  return "";
}

function pickArray(source: RecordLike, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function combineContactParts(contact: RecordLike) {
  const ordered = [text(contact.email), text(contact.phone), text(contact.location), text(contact.address), text(contact.website)].filter(Boolean);
  return ordered.join("  |  ");
}

function sectionHeading(title: string) {
  return (
    <div className="flex items-center gap-3">
      <h2
        className="shrink-0 text-[9.55px] font-bold uppercase tracking-[0.24em] text-slate-900"
        style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}
      >
        {title}
      </h2>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function bulletRow(value: unknown, index: number) {
  const item = text(value);
  if (!item) return null;

  return (
    <div
      key={`${index}-${item.slice(0, 18)}`}
      className="grid items-start gap-x-1.5"
      style={{ gridTemplateColumns: "6px minmax(0, 1fr)", marginTop: `${RESUME_RENDER_TOKENS.composition.bulletGap}px` }}
    >
      <span className="mt-[0.42rem] text-[6.35px] font-bold leading-none text-slate-500">•</span>
      <p
        className="min-w-0 break-words text-[9.05px] leading-[1.145] text-slate-700"
        style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSerif }}
      >
        {item}
      </p>
    </div>
  );
}

function normalizeResume(root: unknown): RecordLike {
  const obj = asObject(root);
  const nested = asObject(obj.resume ?? obj.data ?? obj.model ?? obj.candidate ?? obj.profile);
  return {
    ...nested,
    ...obj,
    contact: asObject(obj.contact ?? nested.contact)
  };
}

export function DocumentFlow(props: ResumeFlowProps) {
  const resume = normalizeResume(props.resume ?? props.data ?? props.model ?? props.candidate ?? props.profile ?? {});

  const name = pickString(resume, ["name", "fullName", "candidateName", "displayName"]);
  const title = pickString(resume, ["title", "role", "headline", "position"]);
  const contact = asObject(resume.contact);
  const contactLine = pickString(resume, ["contactLine"]);
  const linksLine = pickString(resume, ["linksLine"]);
  const summary = text(resume.summary ?? resume.professionalSummary ?? resume.overview ?? resume.profileSummary ?? "");
  const skills = resume.skillCategories ?? resume.skills;
  const experience = pickArray(resume, ["experience", "experiences", "workExperience"]);
  const education = pickArray(resume, ["education", "educations"]);
  const certificates = pickArray(resume, ["certificates"]).map((item) => text(item)).filter(Boolean);
  const renderedContact = contactLine || combineContactParts(contact);
  const renderedLinks = linksLine || text(contact.linkedin);

  return (
    <article className={`w-full px-7 py-7 text-slate-900 sm:px-8 sm:py-8 ${props.className ?? ""}`.trim()}>
      <header className="border-b border-slate-200 pb-3">
        <div className="space-y-1">
          <div className="min-w-0">
            <h1
              className="text-[24.8px] font-bold tracking-[-0.045em] text-slate-950"
              style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}
            >
              {name}
            </h1>
            {title ? (
              <div
                className="mt-[2px] text-[10.8px] font-semibold uppercase tracking-[0.06em] text-slate-700"
                style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}
              >
                {title}
              </div>
            ) : null}
          </div>
        </div>

        {renderedContact ? (
          <div className="mt-2 text-[7.95px] font-medium tracking-[0.01em] text-slate-600" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}>
            {renderedContact}
            {renderedLinks ? <span className="ml-2 text-slate-500">| {renderedLinks}</span> : null}
          </div>
        ) : null}
      </header>

      <div className="mt-3 space-y-3.5">
        {summary ? (
          <section className="space-y-2" style={{ breakInside: "avoid" }}>
            {sectionHeading("Summary")}
            <p className="break-words text-justify text-[9.05px] leading-[1.15] text-slate-900" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSerif }}>
              {summary}
            </p>
          </section>
        ) : null}

        {experience.length ? (
          <section className="space-y-2">
            {sectionHeading("Experience")}
            <div className="space-y-[5px]">
              {experience.map((entry, index) => {
                const item = asObject(entry);
                const role = pickString(item, ["role", "title", "position", "jobTitle"]);
                const company = pickString(item, ["company", "employer", "organization"]);
                const date = pickString(item, ["duration", "date", "period", "range"]);
                const location = pickString(item, ["location", "workLocation", "city"]);
                const bullets = pickArray(item, ["bullets", "highlights", "achievements"]);

                return (
                  <div key={`${company || role || "experience"}-${index}`} className="space-y-[2px]" style={{ breakInside: "avoid" }}>
                    <div className="grid grid-cols-[minmax(0,1fr)_82px] items-baseline gap-2">
                      <div className="min-w-0">
                        <div className="text-[10.15px] font-bold tracking-[-0.01em] text-slate-950" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}>
                          {role}
                        </div>
                      </div>
                      {date ? (
                          <div className="shrink-0 text-right text-[8.15px] font-semibold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}>
                          {date}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_82px] items-baseline gap-2">
                      <div className="min-w-0">
                        {company ? (
                          <div className="text-[9.75px] font-bold tracking-[-0.01em] text-slate-950" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}>
                            {company}
                          </div>
                        ) : null}
                      </div>
                      {location ? (
                          <div className="shrink-0 text-right text-[8.05px] font-medium italic text-slate-500" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSerif }}>
                          {location}
                        </div>
                      ) : null}
                    </div>

                    {bullets.length ? (
                      <div className="space-y-[1px] pt-[1px]">
                        {bullets.map((bullet, bulletIndex) => bulletRow(bullet, bulletIndex))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {education.length ? (
          <section className="space-y-2">
            {sectionHeading("Education")}
            <div className="space-y-[5px]">
              {education.map((entry, index) => {
                const item = asObject(entry);
                const degree = pickString(item, ["degree", "title", "qualification"]);
                const school = pickString(item, ["school", "institution", "organization"]);
                const date = pickString(item, ["duration", "date", "period", "range"]);
                const location = pickString(item, ["location", "city"]);

                return (
                  <div key={`${school || degree || "education"}-${index}`} className="space-y-[2px]" style={{ breakInside: "avoid" }}>
                    <div className="grid grid-cols-[minmax(0,1fr)_82px] items-baseline gap-2">
                      <div className="min-w-0">
                        <div className="text-[9.75px] font-bold tracking-[-0.01em] text-slate-950" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}>
                          {school || degree}
                        </div>
                      </div>
                      {date ? (
                          <div className="shrink-0 text-right text-[8.15px] font-semibold uppercase tracking-[0.08em] text-slate-500" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}>
                          {date}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_82px] items-baseline gap-2">
                      <div className="min-w-0">
                        {school && degree ? (
                          <div className="text-[9.75px] font-semibold tracking-[-0.01em] text-slate-700" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSerif }}>
                            {degree}
                          </div>
                        ) : null}
                      </div>
                      {location ? (
                          <div className="shrink-0 text-right text-[8.05px] font-medium italic text-slate-500" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSerif }}>
                          {location}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {certificates.length ? (
          <section className="space-y-2" style={{ breakInside: "avoid" }}>
            {sectionHeading("Certifications")}
            <div className="space-y-[1px]">
              {certificates.map((certificate, index) => (
                <div key={`${certificate}-${index}`} className="grid items-start gap-x-2" style={{ gridTemplateColumns: "6px minmax(0, 1fr)" }}>
                  <span className="mt-[0.48rem] h-1.25 w-1.25 rounded-full bg-slate-500" />
                  <span className="text-[9.05px] leading-[1.13] text-slate-700" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSerif }}>
                    {certificate}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {normalizeSkillGroups(skills).length > 0 ? (
          <section className="space-y-2" style={{ breakInside: "avoid" }}>
            {sectionHeading("Skills")}
            <SkillsSection skills={skills} />
          </section>
        ) : null}
      </div>
    </article>
  );
}

export default DocumentFlow;



