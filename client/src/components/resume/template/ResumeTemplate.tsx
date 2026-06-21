import React from "react";
import DocumentFlow from "./DocumentFlow";
import { RESUME_RENDER_TOKENS } from "@/resume-rendering";

type ResumeTemplateProps = {
  children?: React.ReactNode;
  className?: string;
  resume?: unknown;
  data?: unknown;
  model?: unknown;
  candidate?: unknown;
  profile?: unknown;
};

export function ResumeTemplate(props: ResumeTemplateProps) {
  const {
    children,
    className = "",
    resume,
    data,
    model,
    candidate,
    profile,
  } = props;

  const content =
    children ?? (
      <DocumentFlow
        resume={resume}
        data={data}
        model={model}
        candidate={candidate}
        profile={profile}
      />
    );

  return (
    <div className={`mx-auto w-full bg-slate-100 p-3 text-slate-900 sm:p-4 ${className}`.trim()}>
      <div className="mx-auto w-full max-w-[860px] overflow-hidden border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
        <div
          className="bg-white"
          style={{
            fontFamily: RESUME_RENDER_TOKENS.fonts.previewSerif,
          }}
        >
          {content}
        </div>
      </div>
    </div>
  );
}

export default ResumeTemplate;



