import type { ResumePreviewModel } from "@/lib/resume-preview";
import { RESUME_PREVIEW_TEMPLATE } from "@/lib/resume-preview";
import { RESUME_RENDER_TOKENS } from "@/resume-rendering";

export function Header({ model }: { model: ResumePreviewModel }) {
  const { typography } = RESUME_PREVIEW_TEMPLATE;

  return (
    <header className="border-b border-slate-200 pb-3">
      <div className="space-y-1">
        <h3
          className="text-left font-bold leading-none tracking-[-0.03em] text-slate-950"
          style={{ fontSize: typography.nameSize, fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}
        >
          {model.name || "Resume"}
        </h3>
        {model.title ? (
          <p
            className="text-left font-semibold leading-none tracking-[0.03em] text-slate-700 uppercase"
            style={{ fontSize: typography.titleSize, fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}
          >
            {model.title}
          </p>
        ) : null}
        {model.contactLine ? (
          <p
            className="max-w-full text-left font-medium leading-[1.12] text-slate-600"
            style={{ fontSize: typography.subtextSize, fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}
          >
            {model.contactLine}
          </p>
        ) : null}
        {model.linksLine ? (
          <p
            className="max-w-full text-left font-medium leading-[1.12] text-slate-500"
            style={{ fontSize: typography.subtextSize - 0.35, fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}
          >
            {model.linksLine}
          </p>
        ) : null}
      </div>
    </header>
  );
}



