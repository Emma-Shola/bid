import { ExternalLink, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

const STATIC_BUILDER_PATH = "/resume-instruction-builder.html";

export default function ResumeInstructionBuilder() {
  const [reloadSeed, setReloadSeed] = useState(0);

  const iframeSrc = useMemo(() => `${STATIC_BUILDER_PATH}?v=${reloadSeed}`, [reloadSeed]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resume instruction builder"
        description="Use the standalone tailoring tool inside the admin portal so you can upload resumes, edit extracted data, and export instruction files without leaving the app."
        actions={
          <>
            <Button variant="outline" onClick={() => setReloadSeed((value) => value + 1)}>
              <RefreshCw className="h-4 w-4" />
              Reload
            </Button>
            <Button asChild>
              <a href={STATIC_BUILDER_PATH} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open standalone
              </a>
            </Button>
          </>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Embedded builder</p>
            <p className="text-sm text-muted-foreground">
              This view is backed by the standalone HTML tool stored in <code className="rounded bg-muted px-1.5 py-0.5 text-xs">client/public</code>.
            </p>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            Visible in admin portal
          </div>
        </div>

        <iframe
          key={reloadSeed}
          title="Resume instruction builder"
          src={iframeSrc}
          className="h-[calc(100vh-12rem)] w-full bg-white"
        />
      </div>
    </div>
  );
}
