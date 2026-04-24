import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { looksLikeResumeDocument, parseResumeMarkdown } from "@/lib/resume-format";

type Props = HTMLAttributes<HTMLDivElement> & {
  content: string;
};

export function ResumeDocumentPreview({ content, className, ...props }: Props) {
  if (!looksLikeResumeDocument(content)) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-slate-200 bg-slate-50 px-6 py-8 text-sm leading-6 text-slate-600",
          className,
        )}
        {...props}
      >
        <p className="font-medium text-slate-900">Resume preview</p>
        <p className="mt-2 whitespace-pre-wrap">{content}</p>
      </div>
    );
  }

  const doc = parseResumeMarkdown(content);

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[820px] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-sm ring-1 ring-slate-200",
        className,
      )}
      {...props}
    >
      <div className="border-b border-slate-200 px-8 py-7">
        <div className="space-y-2">
          <h3 className="text-3xl font-semibold tracking-tight text-slate-950">
            {doc.name || "Resume"}
          </h3>
          {doc.intro.length > 0 && (
            <p className="text-sm leading-6 text-slate-600">
              {doc.intro.join(" ")}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-7 px-8 py-7">
        {doc.sections.length > 0 ? (
          doc.sections.map((section, index) => (
            <section key={`${section.title}-${index}`} className="space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                {section.title}
              </h4>
              <div className="space-y-3">
                {section.entries.map((entry, entryIndex) =>
                  entry.kind === "bullet" ? (
                    <div key={`${section.title}-bullet-${entryIndex}`} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <p className="text-sm leading-6 text-slate-700">{entry.text}</p>
                    </div>
                  ) : (
                    <p key={`${section.title}-paragraph-${entryIndex}`} className="text-sm leading-6 text-slate-700">
                      {entry.text}
                    </p>
                  ),
                )}
              </div>
            </section>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
            The generated resume will appear here.
          </div>
        )}
      </div>
    </div>
  );
}

