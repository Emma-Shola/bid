import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Sparkles, Wand2, WandSparkles } from "lucide-react";
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
  const [question, setQuestion] = useState("Why do you feel interested in this role?");
  const [lastAskedQuestion, setLastAskedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");

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
  // previous resume's question/answer bleeds into the next one.
  useEffect(() => {
    setJobTitle(initialJobTitle);
    setCompany(initialCompany);
    setJobDescription(initialJobDescription);
    setQuestion(quickPrompts[0]);
    setLastAskedQuestion("");
    setAnswer("");
    setKeyPoints([]);
    setFollowUpQuestions([]);
    setRefineInstruction("");
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isCopied) return;
    const timer = window.setTimeout(() => setIsCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [isCopied]);

  const ask = useMutation({
    mutationFn: (variables: { question: string; refineInstruction?: string; previousAnswer?: string }) =>
      api.askInterviewQuestion({
        question: variables.question,
        applicationId: applicationId || undefined,
        jobTitle: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
        jobDescription: jobDescription.trim() || undefined,
        refineInstruction: variables.refineInstruction,
        previousAnswer: variables.previousAnswer,
      }),
    onSuccess: (result, variables) => {
      setAnswer(result.answer);
      setKeyPoints(result.keyPoints || []);
      setFollowUpQuestions(result.followUpQuestions || []);
      setLastAskedQuestion(variables.question);
      toast.success(variables.refineInstruction ? "Answer refined" : "Answer ready");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to generate answer");
    },
  });

  const isRefining = ask.isPending && Boolean(ask.variables?.refineInstruction);
  const isAsking = ask.isPending && !isRefining;

  async function handleCopy() {
    if (!answer.trim()) return;
    await navigator.clipboard.writeText(answer);
    setIsCopied(true);
    toast.success("Answer copied");
  }

  function handleAsk() {
    if (!question.trim()) {
      toast.error("Ask a question first.");
      return;
    }

    if (!hasContext) {
      toast.error("Add job context or open a specific application first.");
      return;
    }

    ask.mutate({ question: question.trim() });
    setQuestion("");
  }

  function handleRefine(instruction?: string) {
    const text = (instruction ?? refineInstruction).trim();
    if (!text) {
      toast.error("Tell the coach what to change first.");
      return;
    }

    if (!answer.trim() || !lastAskedQuestion.trim()) {
      toast.error("Ask a question first before refining the answer.");
      return;
    }

    ask.mutate({ question: lastAskedQuestion, refineInstruction: text, previousAnswer: answer });
    setRefineInstruction("");
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
                <h2 className="mt-1 text-base font-semibold">Interview question</h2>
              </div>
              <WandSparkles className="h-5 w-5 text-primary" />
            </div>

            <div className="space-y-3">
              <Textarea
                rows={5}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Why do you feel interested in this role?"
              />

              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setQuestion(prompt)}
                    className="rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <Button className="w-full" onClick={handleAsk} disabled={ask.isPending}>
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
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Answer</p>
                <h2 className="mt-1 text-base font-semibold">Strong interview response</h2>
              </div>
              <Button variant="outline" size="sm" onClick={handleCopy} disabled={!answer.trim()}>
                <Copy className="mr-1.5 h-4 w-4" />
                {isCopied ? "Copied" : "Copy"}
              </Button>
            </div>

            {answer ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border/80 bg-muted/25 p-4">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{answer}</p>
                </div>

                <div className="rounded-lg border border-dashed border-border/70 bg-background p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Wand2 className="h-3.5 w-3.5" />
                    Refine this answer
                  </div>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {refinePrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleRefine(prompt)}
                        disabled={ask.isPending}
                        className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={refineInstruction}
                      onChange={(event) => setRefineInstruction(event.target.value)}
                      placeholder="Or type your own tweak..."
                      className="h-8 text-xs"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleRefine();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={() => handleRefine()}
                      disabled={ask.isPending || !refineInstruction.trim()}
                    >
                      {isRefining ? "Refining..." : "Refine"}
                    </Button>
                  </div>
                </div>

                {keyPoints.length > 0 && (
                  <div className="rounded-lg border border-border/70 bg-background p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key points</h3>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {keyPoints.map((point) => (
                        <li key={point} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {followUpQuestions.length > 0 && (
                  <div className="rounded-lg border border-border/70 bg-background p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Likely follow-ups
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {followUpQuestions.map((item) => (
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
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-sm text-muted-foreground">
                Ask a question and we&apos;ll generate a polished answer grounded in your latest resume and the job context.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
            <p className="font-medium text-foreground">How to get the best answer</p>
            <ul className="mt-3 space-y-2">
              <li>• Open this page from an application to preload the job context automatically.</li>
              <li>• Ask specific questions like “Why do you want this role?” or “Tell me about a technical challenge.”</li>
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
