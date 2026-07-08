import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const quickPrompts = [
  "Why do you feel interested in this role?",
  "Tell me about a technical challenge you solved.",
  "How do you balance speed and reliability?",
  "Why are you the right fit for this team?",
  "Describe a project you led end to end.",
];

const refinePrompts = [
  "Make it shorter",
  "More casual",
  "More confident",
  "Add more technical detail",
];

const MAX_QUESTIONS_PER_BATCH = 10;

type QaResult = {
  id: string;
  question: string;
  answer: string;
  keyPoints: string[];
  followUps: string[];
  loading: boolean;
  refining: boolean;
  refineDraft: string;
  error?: string;
};

function makeResultId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function InterviewCoach() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const applicationId = searchParams.get("applicationId")?.trim() || "";
  const initialJobTitle = searchParams.get("jobTitle")?.trim() || "";
  const initialCompany = searchParams.get("company")?.trim() || "";
  const initialJobDescription = searchParams.get("jobDescription")?.trim() || "";

  const { data: application, isLoading: applicationLoading } = useQuery({
    queryKey: ["application", applicationId, "interview-coach"],
    queryFn: () => api.getApplication(applicationId),
    enabled: !!applicationId,
  });

  const [jobTitle, setJobTitle] = useState(initialJobTitle);
  const [company, setCompany] = useState(initialCompany);
  const [jobDescription, setJobDescription] = useState(initialJobDescription);
  const [questionsDraft, setQuestionsDraft] = useState(quickPrompts[0]);
  const [results, setResults] = useState<QaResult[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const hasContext = useMemo(
    () => Boolean(applicationId || jobTitle.trim() || company.trim() || jobDescription.trim()),
    [applicationId, jobTitle, company, jobDescription],
  );

  useEffect(() => {
    if (!application) return;
    setJobTitle((current) => current.trim() ? current : application.jobTitle || "");
    setCompany((current) => current.trim() ? current : application.company || "");
    setJobDescription((current) => current.trim() ? current : application.jobDescription || "");
  }, [application]);

  // Reset the whole session whenever the coach is opened for a different
  // resume/job (new URL params) — otherwise this route stays mounted and the
  // previous resume's questions/answers bleed into the next one.
  useEffect(() => {
    setJobTitle(initialJobTitle);
    setCompany(initialCompany);
    setJobDescription(initialJobDescription);
    setQuestionsDraft(quickPrompts[0]);
    setResults([]);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!copiedId) return;
    const timer = window.setTimeout(() => setCopiedId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  async function handleCopy(entry: QaResult) {
    if (!entry.answer.trim()) return;
    await navigator.clipboard.writeText(entry.answer);
    setCopiedId(entry.id);
    toast.success("Answer copied");
  }

  function appendQuickPrompt(prompt: string) {
    setQuestionsDraft((current) => {
      const lines = current.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.includes(prompt)) return current;
      return [...lines, prompt].join("\n");
    });
  }

  function handleAskAll() {
    const questions = Array.from(
      new Set(questionsDraft.split("\n").map((line) => line.trim()).filter(Boolean)),
    ).slice(0, MAX_QUESTIONS_PER_BATCH);

    if (questions.length === 0) {
      toast.error("Ask at least one question first.");
      return;
    }

    if (!hasContext) {
      toast.error("Add job context or open a specific application first.");
      return;
    }

    const pending: QaResult[] = questions.map((question) => ({
      id: makeResultId(),
      question,
      answer: "",
      keyPoints: [],
      followUps: [],
      loading: true,
      refining: false,
      refineDraft: "",
    }));

    setResults((current) => [...pending, ...current]);
    setQuestionsDraft("");
    setIsAsking(true);

    Promise.allSettled(
      pending.map((entry) =>
        api
          .askInterviewQuestion({
            question: entry.question,
            applicationId: applicationId || undefined,
            jobTitle: jobTitle.trim() || undefined,
            company: company.trim() || undefined,
            jobDescription: jobDescription.trim() || undefined,
          })
          .then((result) => {
            setResults((current) =>
              current.map((item) =>
                item.id === entry.id
                  ? { ...item, answer: result.answer, keyPoints: result.keyPoints ?? [], followUps: result.followUpQuestions ?? [], loading: false }
                  : item,
              ),
            );
          })
          .catch((error) => {
            setResults((current) =>
              current.map((item) =>
                item.id === entry.id ? { ...item, loading: false, error: (error as Error).message || "Failed to generate answer" } : item,
              ),
            );
          }),
      ),
    ).finally(() => setIsAsking(false));
  }

  function handleRefine(entry: QaResult, instruction?: string) {
    const text = (instruction ?? entry.refineDraft).trim();
    if (!text) {
      toast.error("Tell the coach what to change first.");
      return;
    }
    if (!entry.answer.trim()) return;

    setResults((current) => current.map((item) => (item.id === entry.id ? { ...item, refining: true } : item)));

    api
      .askInterviewQuestion({
        question: entry.question,
        applicationId: applicationId || undefined,
        jobTitle: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
        jobDescription: jobDescription.trim() || undefined,
        refineInstruction: text,
        previousAnswer: entry.answer,
      })
      .then((result) => {
        setResults((current) =>
          current.map((item) =>
            item.id === entry.id
              ? { ...item, answer: result.answer, keyPoints: result.keyPoints ?? [], followUps: result.followUpQuestions ?? [], refining: false, refineDraft: "" }
              : item,
          ),
        );
        toast.success("Answer refined");
      })
      .catch((error) => {
        setResults((current) => current.map((item) => (item.id === entry.id ? { ...item, refining: false } : item)));
        toast.error((error as Error).message || "Failed to refine the answer");
      });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI interview coach"
        description="Ask interview questions and get strong, truthful answers grounded in your resume and the target job."
        actions={
          applicationId ? (
            <Button variant="outline" onClick={() => navigate(`/bidder/applications/${applicationId}`)}>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              View application
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {applicationId ? "Loaded application" : "Job context"}
                </p>
                <h2 className="mt-1 text-base font-semibold text-foreground">
                  {application ? `${application.jobTitle} · ${application.company}` : "Add a role to tailor answers"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {application
                    ? "The coach will ground answers in this application and your latest resume."
                    : "You can paste the role details manually or open this page from an application."}
                </p>
              </div>
              <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {applicationId ? "Application mode" : "Manual mode"}
              </div>
            </div>

            {application && (
              <div className="mb-4 rounded-md border border-border/70 bg-muted/30 p-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Company</dt>
                    <dd className="mt-1 font-medium text-foreground">{application.company}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Job title</dt>
                    <dd className="mt-1 font-medium text-foreground">{application.jobTitle}</dd>
                  </div>
                </dl>
                {application.jobUrl ? (
                  <a
                    href={application.jobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Open job posting <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            )}

            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="jobTitle">Job title</Label>
                <Input
                  id="jobTitle"
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  placeholder="Principal Software Engineer"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Glide"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jobDescription">Job description</Label>
                <Textarea
                  id="jobDescription"
                  rows={9}
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder="Paste the job description here or let the application fill it in."
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ask AI about this job</p>
                <h2 className="mt-1 text-base font-semibold">Interview questions</h2>
              </div>
              <Sparkles className="h-5 w-5 text-primary" />
            </div>

            <div className="space-y-3">
              <Textarea
                rows={6}
                value={questionsDraft}
                onChange={(event) => setQuestionsDraft(event.target.value)}
                placeholder={"One question per line, e.g.:\nWhy do you feel interested in this role?\nTell me about a technical challenge you solved."}
              />
              <p className="text-xs text-muted-foreground">
                Add as many as you like, one per line — each gets its own answer (up to {MAX_QUESTIONS_PER_BATCH} at a time).
              </p>

              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => appendQuickPrompt(prompt)}
                    className="rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <Button className="w-full" onClick={handleAskAll} disabled={isAsking}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                {isAsking ? "Thinking..." : "Ask AI"}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Answers</p>
                <h2 className="mt-1 text-base font-semibold">Strong interview responses</h2>
              </div>
              {results.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setResults([])}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Clear all
                </Button>
              )}
            </div>

            {results.length > 0 ? (
              <div className="space-y-4">
                {results.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-border/80 bg-muted/25 p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{entry.question}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 text-xs"
                        onClick={() => handleCopy(entry)}
                        disabled={!entry.answer.trim()}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        {copiedId === entry.id ? "Copied" : "Copy"}
                      </Button>
                    </div>

                    {entry.loading ? (
                      <p className="text-sm text-muted-foreground">Thinking...</p>
                    ) : entry.error ? (
                      <p className="text-sm text-destructive">{entry.error}</p>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{entry.answer}</p>

                        <div className="mt-3 rounded-lg border border-dashed border-border/70 bg-background p-3">
                          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            <Wand2 className="h-3.5 w-3.5" />
                            Refine this answer
                          </div>
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {refinePrompts.map((prompt) => (
                              <button
                                key={prompt}
                                type="button"
                                onClick={() => handleRefine(entry, prompt)}
                                disabled={entry.refining}
                                className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                              >
                                {prompt}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={entry.refineDraft}
                              onChange={(event) =>
                                setResults((current) =>
                                  current.map((item) => (item.id === entry.id ? { ...item, refineDraft: event.target.value } : item)),
                                )
                              }
                              placeholder="Or type your own tweak..."
                              className="h-8 text-xs"
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  handleRefine(entry);
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 shrink-0"
                              onClick={() => handleRefine(entry)}
                              disabled={entry.refining || !entry.refineDraft.trim()}
                            >
                              {entry.refining ? "Refining..." : "Refine"}
                            </Button>
                          </div>
                        </div>

                        {entry.keyPoints.length > 0 && (
                          <div className="mt-3 rounded-lg border border-border/70 bg-background p-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key points</h3>
                            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                              {entry.keyPoints.map((point) => (
                                <li key={point} className="flex gap-2">
                                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {entry.followUps.length > 0 && (
                          <div className="mt-3 rounded-lg border border-border/70 bg-background p-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Likely follow-ups</h3>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {entry.followUps.map((item) => (
                                <span
                                  key={item}
                                  className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground"
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-sm text-muted-foreground">
                Ask one or more questions and we&apos;ll generate a polished answer for each, grounded in your latest resume and the job context.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
            <p className="font-medium text-foreground">How to get the best answer</p>
            <ul className="mt-3 space-y-2">
              <li>• Open this page from an application to preload the job context automatically.</li>
              <li>• Ask specific questions like “Why do you want this role?” or “Tell me about a technical challenge.”</li>
              <li>• Paste a whole list of interview questions at once, one per line, to get answers for all of them together.</li>
              <li>• Keep the job description current so the answer stays relevant and ATS-aligned.</li>
            </ul>
          </div>

          {applicationLoading && (
            <p className="text-xs text-muted-foreground">Loading application context...</p>
          )}
        </div>
      </div>
    </div>
  );
}
