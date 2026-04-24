import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Sparkles, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadResumePdf } from "@/lib/pdf";
import { looksLikeResumeDocument } from "@/lib/resume-format";
import { normalizeGeneratedResumePreview } from "@/lib/resume-source";
import { ResumeDocumentPreview } from "@/components/resume/ResumeDocumentPreview";
import { useChannel, type RealtimeEvent } from "@/lib/realtime";
import type { Application, ApplicationStatus } from "@/lib/types";

const STATUSES: ApplicationStatus[] = ["submitted", "reviewed", "interviewed", "rejected", "hired"];

export default function ApplicationForm({ mode }: { mode: "create" | "edit" }) {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: existing } = useQuery({
    queryKey: ["application", id],
    queryFn: () => api.getApplication(id!),
    enabled: mode === "edit" && !!id,
  });
  const { data: resumeTemplates = [] } = useQuery({
    queryKey: ["resumes", "bidder"],
    queryFn: () => api.listResumes(),
    enabled: !!user && mode === "create",
  });

  const [form, setForm] = useState({
    jobTitle: "",
    company: "",
    jobUrl: "",
    jobDescription: "",
    resumeUrl: "",
    notes: "",
    salaryMin: "",
    salaryMax: "",
    status: "submitted" as ApplicationStatus,
  });
  const [resumePreview, setResumePreview] = useState("");
  const [resumeJobId, setResumeJobId] = useState<string | null>(null);
  const [resumeStatus, setResumeStatus] = useState<string | null>(null);
  const [generatingResume, setGeneratingResume] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const draftStorageKey = user?.id ? `topbrass:bidder:application-draft:${user.id}` : null;
  const selectedResumeTemplate = resumeTemplates.find((item) => item.id === selectedResumeId) ?? null;

  useEffect(() => {
    if (mode === "edit" && existing) {
      setForm({
        jobTitle: existing.jobTitle ?? "",
        company: existing.company ?? "",
        jobUrl: existing.jobUrl ?? existing.url ?? "",
        jobDescription: existing.jobDescription ?? existing.notes ?? "",
        resumeUrl: existing.resumeUrl ?? "",
        notes: existing.notes ?? "",
        salaryMin: existing.salaryMin?.toString() ?? "",
        salaryMax: existing.salaryMax?.toString() ?? "",
        status: existing.status ?? "submitted",
      });
    }
  }, [existing, mode]);

  useEffect(() => {
    if (mode !== "create") return;
    if (resumeTemplates.length === 0) return;

    if (!selectedResumeId || !resumeTemplates.some((resume) => resume.id === selectedResumeId)) {
      setSelectedResumeId(resumeTemplates[0].id);
    }
  }, [mode, resumeTemplates, selectedResumeId]);

  useEffect(() => {
    if (mode !== "create") return;
    const nextResumeUrl = selectedResumeTemplate?.fileUrl ?? "";
    if ((form.resumeUrl || "") === nextResumeUrl) return;
    setForm((current) => ({ ...current, resumeUrl: nextResumeUrl }));
  }, [mode, selectedResumeTemplate, form.resumeUrl]);

  useEffect(() => {
    if (mode !== "create" || !draftStorageKey) return;
    const saved = localStorage.getItem(draftStorageKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as {
        form?: typeof form;
        selectedResumeId?: string;
        resumePreview?: string;
        resumeJobId?: string | null;
        resumeStatus?: string | null;
      };
      if (parsed.form) {
        setForm((current) => ({ ...current, ...parsed.form }));
      }
      if (typeof parsed.selectedResumeId === "string") setSelectedResumeId(parsed.selectedResumeId);
      if (parsed.resumePreview) setResumePreview(parsed.resumePreview);
      if (typeof parsed.resumeJobId !== "undefined") setResumeJobId(parsed.resumeJobId ?? null);
      if (typeof parsed.resumeStatus !== "undefined") setResumeStatus(parsed.resumeStatus ?? null);
    } catch {
      // Ignore corrupted local draft.
    }
  }, [mode, draftStorageKey]);

  useEffect(() => {
    if (mode !== "create" || !draftStorageKey) return;
    localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        form,
        selectedResumeId,
        resumePreview,
        resumeJobId,
        resumeStatus
      })
    );
  }, [mode, draftStorageKey, form, selectedResumeId, resumePreview, resumeJobId, resumeStatus]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const generateResume = useMutation({
    mutationFn: () =>
      api.generateResume({
        resumeId: selectedResumeId || undefined,
        jobTitle: form.jobTitle.trim(),
        company: form.company.trim(),
        jobDescription: form.jobDescription.trim(),
        preferInline: true,
      }),
    onSuccess: (result) => {
      setResumeJobId(result.jobId);
      setResumeStatus(result.status);
      setResumePreview(
        result.preview
          ? normalizeGeneratedResumePreview(result.preview, "")
          : result.message ??
            "Resume generation has been queued. We will show the preview here when it is ready.",
      );
      toast.success(result.status === "completed" ? "Resume generated" : "Resume generation queued");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to generate resume");
    },
    onSettled: () => setGeneratingResume(false),
  });

  function triggerResumeGeneration() {
    const missing = [];
    if (!form.jobTitle.trim()) missing.push("job title");
    if (!form.company.trim()) missing.push("company");
    if (!form.jobDescription.trim()) missing.push("job description");

    if (missing.length > 0) {
      toast.error(`Add ${missing.join(", ")} before generating the resume.`);
      return;
    }

    setGeneratingResume(true);
    generateResume.mutate();
  }

  async function copyResumePreview() {
    if (!resumePreview) return;
    await navigator.clipboard.writeText(resumePreview);
    toast.success("Preview copied");
  }

  function downloadResumePreview() {
    if (!resumePreview) return;
    downloadResumePdf({
      title: `resume-${form.jobTitle.trim() || "draft"}`,
      content: resumePreview,
    });
  }

  useChannel<RealtimeEvent<{ job: { id: string; status: string; result?: { preview?: string; markdown?: string; content?: string }; error?: string } }>>(
    "background-job.updated",
    (event) => {
      if (!resumeJobId || event.data.job.id !== resumeJobId) return;
      setResumeStatus(event.data.job.status);
      if (event.data.job.status === "completed") {
        const preview = normalizeGeneratedResumePreview(
          typeof event.data.job.result?.preview === "string"
            ? event.data.job.result.preview
            : JSON.stringify(event.data.job.result ?? {}),
          "",
        );
        if (preview) {
          setResumePreview(preview);
        }
        toast.success("Resume preview is ready");
      }
      if (event.data.job.status === "failed" || event.data.job.status === "dead_letter") {
        setResumePreview(event.data.job.error ?? "Resume generation failed.");
      }
    },
  );

  const create = useMutation({
    mutationFn: () =>
      api.createApplication({
        jobTitle: form.jobTitle.trim(),
        company: form.company.trim(),
        jobUrl: form.jobUrl.trim() || undefined,
        jobDescription: form.jobDescription.trim(),
        resumeUrl: form.resumeUrl.trim() || undefined,
        notes: form.notes.trim() || undefined,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Application created");
      navigate(`/bidder/applications/${created.id}`);
    },
  });

  const update = useMutation({
    mutationFn: () =>
      api.updateApplication(id!, {
        jobTitle: form.jobTitle.trim(),
        company: form.company.trim(),
        jobUrl: form.jobUrl.trim() || undefined,
        jobDescription: form.jobDescription.trim(),
        resumeUrl: form.resumeUrl.trim() || undefined,
        notes: form.notes.trim() || undefined,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
        status: form.status,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["application", id] });
      toast.success("Application updated");
      navigate(`/bidder/applications/${id}`);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={mode === "create" ? "New application" : "Edit application"}
        description="Capture the real job details and keep everything in one place."
      />
      <form
        className="grid gap-6 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          mode === "create" ? create.mutate() : update.mutate();
        }}
      >
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Job details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="company">Company</Label>
                <Input id="company" value={form.company} onChange={(e) => set("company", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Job title</Label>
                <Input id="title" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} required />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="jobUrl">Job URL</Label>
                <Input id="jobUrl" type="url" value={form.jobUrl} onChange={(e) => set("jobUrl", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
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
                  Admin uploads manager templates. Bidders assigned to that manager reuse them without uploading each time.
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
                <Label htmlFor="salaryMin">Salary min</Label>
                <Input id="salaryMin" type="number" min="0" value={form.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salaryMax">Salary max</Label>
                <Input id="salaryMax" type="number" min="0" value={form.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Job description</h2>
            <Textarea
              rows={8}
              placeholder="Paste the full role description here..."
              value={form.jobDescription}
              onChange={(e) => set("jobDescription", e.target.value)}
            />
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Notes</h2>
            <Textarea
              rows={5}
              placeholder="Recruiter notes, interview prep, follow-ups..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {mode === "create" && (
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Resume assistant</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enter job details and generate directly from the selected manager resume template.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={triggerResumeGeneration}
                  disabled={generatingResume}
                  className="shrink-0"
                >
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  {generatingResume ? "Generating..." : "Generate preview"}
                </Button>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  {resumePreview ? (
                    looksLikeResumeDocument(resumePreview) ? (
                      <div className="max-h-[760px] overflow-auto">
                        <ResumeDocumentPreview content={resumePreview} />
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-border bg-background px-6 py-10 text-center text-sm text-muted-foreground">
                        {resumePreview}
                      </div>
                    )
                  ) : (
                    <div className="flex min-h-[280px] items-center justify-center rounded-md border border-dashed border-border bg-background px-6 text-center text-sm text-muted-foreground">
                      Fill in the job details and generate a resume preview here.
                    </div>
                  )}
                </div>
                <div className="flex flex-row gap-2 lg:flex-col">
                  <Button type="button" variant="outline" onClick={copyResumePreview} disabled={!resumePreview}>
                    <Copy className="mr-1.5 h-4 w-4" /> Copy
                  </Button>
                  <Button type="button" variant="outline" onClick={downloadResumePreview} disabled={!resumePreview || !looksLikeResumeDocument(resumePreview)}>
                    <Download className="mr-1.5 h-4 w-4" /> Download
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setResumePreview("");
                      setResumeJobId(null);
                      setResumeStatus(null);
                    }}
                    disabled={!resumePreview}
                  >
                    <RefreshCw className="mr-1.5 h-4 w-4" /> Clear
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {resumeJobId && (
                  <span>
                    Job ID: <span className="font-mono">{resumeJobId}</span>
                  </span>
                )}
                {resumeStatus && <span className="capitalize">Status: {resumeStatus}</span>}
                {resumePreview && <span>Tip: keep it as a draft or reuse parts in your notes.</span>}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {mode === "edit" && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Status</h2>
              <Select value={form.status} onValueChange={(v) => set("status", v as ApplicationStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status} className="capitalize">
                      {status.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Owner</p>
            <p className="mt-2 text-sm font-medium text-foreground">{user?.name}</p>
            <p className="text-xs text-muted-foreground">Changes are saved to your bidder account.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {mode === "create" ? "Create application" : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
