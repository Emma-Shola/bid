import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadResumePdf } from "@/lib/pdf";
import { looksLikeResumeDocument } from "@/lib/resume-format";
import { ResumeDocumentPreview } from "@/components/resume/ResumeDocumentPreview";
import { normalizeGeneratedResumePreview } from "@/lib/resume-source";
import { useChannel, type RealtimeEvent } from "@/lib/realtime";

export default function ResumeGenerator() {
  const { user } = useAuth();
  const { data: resumeTemplates = [] } = useQuery({
    queryKey: ["resumes", "bidder"],
    queryFn: () => api.listResumes(),
    enabled: !!user,
  });
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const draftStorageKey = user?.id ? `topbrass:bidder:resume-generator:${user.id}` : null;
  const selectedResumeTemplate = resumeTemplates.find((template) => template.id === selectedResumeId) ?? null;

  const gen = useMutation({
    mutationFn: () =>
      api.generateResume({
        resumeId: selectedResumeId || undefined,
        jobTitle,
        company,
        jobDescription,
        preferInline: true,
      }),
    onSuccess: (result) => {
      setJobId(result.jobId);
      setStatus(result.status);
      setOutput(
        result.preview
          ? normalizeGeneratedResumePreview(result.preview, "")
          : result.message ?? "Your resume job has been queued. We will notify you as soon as it is ready.",
      );
      toast.success(result.status === "completed" ? "Resume generated" : "Resume generation queued");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to generate resume");
    },
  });

  useChannel<
    RealtimeEvent<{ job: { id: string; status: string; result?: { preview?: string; markdown?: string; content?: string }; error?: string } }>
  >("background-job.updated", (event) => {
    if (!jobId || event.data.job.id !== jobId) return;
    setStatus(event.data.job.status);
    if (event.data.job.status === "completed") {
      const preview = normalizeGeneratedResumePreview(
        typeof event.data.job.result?.preview === "string"
          ? event.data.job.result.preview
          : JSON.stringify(event.data.job.result ?? {}),
        "",
      );
      if (preview) {
        setOutput(preview);
      }
      toast.success("Resume is ready");
    }
    if (event.data.job.status === "failed" || event.data.job.status === "dead_letter") {
      setOutput(event.data.job.error ?? "Resume generation failed.");
    }
  });

  useEffect(() => {
    if (!output && status === "queued") {
      setOutput("Resume generation is in progress. We will update this panel when the job completes.");
    }
  }, [output, status]);

  useEffect(() => {
    if (!draftStorageKey) return;
    const saved = localStorage.getItem(draftStorageKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as {
        jobTitle?: string;
        company?: string;
        jobDescription?: string;
        selectedResumeId?: string;
        jobId?: string | null;
        status?: string | null;
        output?: string | null;
      };
      if (typeof parsed.jobTitle === "string") setJobTitle(parsed.jobTitle);
      if (typeof parsed.company === "string") setCompany(parsed.company);
      if (typeof parsed.jobDescription === "string") setJobDescription(parsed.jobDescription);
      if (typeof parsed.selectedResumeId === "string") setSelectedResumeId(parsed.selectedResumeId);
      if (typeof parsed.jobId !== "undefined") setJobId(parsed.jobId ?? null);
      if (typeof parsed.status !== "undefined") setStatus(parsed.status ?? null);
      if (typeof parsed.output !== "undefined") setOutput(parsed.output ?? null);
    } catch {
      // Ignore corrupted local draft.
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey) return;
    localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        jobTitle,
        company,
        jobDescription,
        selectedResumeId,
        jobId,
        status,
        output
      })
    );
  }, [draftStorageKey, jobTitle, company, jobDescription, selectedResumeId, jobId, status, output]);

  useEffect(() => {
    if (resumeTemplates.length === 0) return;
    if (!selectedResumeId || !resumeTemplates.some((resume) => resume.id === selectedResumeId)) {
      setSelectedResumeId(resumeTemplates[0].id);
    }
  }, [resumeTemplates, selectedResumeId]);

  function handleGenerate() {
    const missing: string[] = [];
    if (!jobTitle.trim()) missing.push("job title");
    if (!company.trim()) missing.push("company");
    if (!jobDescription.trim()) missing.push("job description");

    if (missing.length > 0) {
      toast.error(`Add ${missing.join(", ")} before generating.`);
      return;
    }

    gen.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resume generator"
        description="Create a tailored resume from a job description using the backend AI workflow."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Inputs</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="jobTitle">Job title</Label>
                <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company">Company</Label>
                <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Resume Template</Label>
                <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={resumeTemplates.length ? "Select resume template" : "No templates assigned"} />
                  </SelectTrigger>
                  <SelectContent>
                    {resumeTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Admin uploads manager templates. Assigned bidders reuse the same template when generating.
                </p>
                {selectedResumeTemplate ? (
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    Selected template is available.
                    {selectedResumeTemplate.openUrl || selectedResumeTemplate.fileUrl ? (
                      <a
                        href={selectedResumeTemplate.openUrl ?? selectedResumeTemplate.fileUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 underline underline-offset-2"
                      >
                        Open template
                      </a>
                    ) : (
                      <span className="ml-2">Text template saved in database.</span>
                    )}
                    <span className="ml-2">({selectedResumeTemplate.textLength.toLocaleString()} chars)</span>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600">
                    No template in the list yet. You can still try generate; backend will use manager default template if available.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jobDescription">Job description</Label>
                <Textarea
                  id="jobDescription"
                  rows={8}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the role description here..."
                />
              </div>
              <Button className="w-full" disabled={gen.isPending} onClick={handleGenerate}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                {gen.isPending ? "Generating..." : "Generate resume"}
              </Button>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Preview</h2>
              <Button
                size="sm"
                variant="outline"
                disabled={!output}
                onClick={() => {
                  if (!output) return;
                  downloadResumePdf({
                    title: `resume-${jobTitle || "generated"}`,
                    content: output,
                  });
                }}
              >
                <Download className="mr-1.5 h-4 w-4" /> Download
              </Button>
            </div>
            {output ? (
              looksLikeResumeDocument(output) ? (
                <div className="max-h-[760px] overflow-auto">
                  <ResumeDocumentPreview content={output} />
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                  {output}
                </div>
              )
            ) : (
              <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                Generate a resume to see the preview here.
              </div>
            )}
          </div>
          {jobId && (
            <p className="mt-3 text-xs text-muted-foreground">
              Job ID: <span className="font-mono">{jobId}</span> {status ? `| ${status}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
