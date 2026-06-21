import { RESUME_RENDER_TOKENS } from "@/resume-rendering";

export function SectionHeading({ children }: { children: string }) {
  return (
    <div className="mb-1.5 mt-2.5 flex items-center gap-3">
      <h4
        className="shrink-0 text-[9.55px] font-bold uppercase tracking-[0.24em] text-slate-900"
        style={{ fontFamily: RESUME_RENDER_TOKENS.fonts.previewSans }}
      >
        {children}
      </h4>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}



