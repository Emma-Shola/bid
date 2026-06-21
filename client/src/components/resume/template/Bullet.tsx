import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RESUME_RENDER_TOKENS } from "@/resume-rendering";

export function Bullet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid items-start gap-x-2", className)} style={{ gridTemplateColumns: "6px minmax(0, 1fr)" }}>
      <span className="mt-[0.48rem] h-1.25 w-1.25 rounded-full bg-slate-500" />
      <p className="min-w-0 break-words text-[9.05px] leading-[1.13] text-slate-700" style={{ textAlign: "left", fontFamily: RESUME_RENDER_TOKENS.fonts.previewSerif }}>
        {children}
      </p>
    </div>
  );
}



