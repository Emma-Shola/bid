import type { ResumePreviewModel } from "@/lib/resume-preview";
import { Bullet } from "./Bullet";
import { SectionHeading } from "./SectionHeading";
import { RESUME_RENDER_TOKENS } from "@/resume-rendering";

type EducationSectionProps = Pick<ResumePreviewModel, "education">;

export function EducationSection({ education }: EducationSectionProps) {
  if (education.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <SectionHeading>Education</SectionHeading>
      <div className="space-y-2 pt-0.5">
        {education.map((item, index) => (
          <article key={`${item.school}-${index}`} className="space-y-[2px]">
            <div className="grid grid-cols-[minmax(0,1fr)_96px] items-baseline gap-2">
              <p className="min-w-0 text-[9.75px] font-semibold leading-[1.04] text-slate-700" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSerif }}>
                {item.degree}
              </p>
              <p className="text-right text-[8.1px] font-semibold leading-[1.04] text-slate-500 uppercase tracking-[0.08em]" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}>
                {item.duration || " "}
              </p>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_96px] items-baseline gap-2">
              <p className="min-w-0 text-[9.45px] font-bold leading-[1.04] text-slate-950" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}>
                {item.school}
              </p>
              <p className="text-right text-[8.1px] font-medium leading-[1.04] italic text-slate-500" style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSerif }}>
                {item.location || " "}
              </p>
            </div>
            <div className="space-y-[1px] pt-[1px]">
              {item.details.map((detail, detailIndex) => (
                <Bullet key={`${item.school}-${index}-detail-${detailIndex}`}>{detail}</Bullet>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}



