import { FileText, Plus, RefreshCw, Save, Trash2, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ProfileStatus } from "@/lib/types";

// ─── Local state types ────────────────────────────────────────────────────────

type EmpRow = {
  _id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  location: string;
};

type EduRow = {
  _id: string;
  institution: string;
  degree: string;
  dates: string;
  location: string;
};

type CertRow = { _id: string; value: string };

interface ProfileState {
  personalInfo: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
  };
  employment: EmpRow[];
  education: EduRow[];
  certifications: CertRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function profileToState(profile: unknown): ProfileState | null {
  if (!profile || typeof profile !== "object") return null;
  const p = profile as Record<string, unknown>;
  const pi = (p.personalInfo as Record<string, string> | undefined) ?? {};
  const emp = Array.isArray(p.employmentHistory) ? (p.employmentHistory as Record<string, string>[]) : [];
  const edu = Array.isArray(p.education) ? (p.education as Record<string, string>[]) : [];
  const certs = Array.isArray(p.certifications) ? (p.certifications as string[]) : [];

  return {
    personalInfo: {
      name: pi.name ?? "",
      email: pi.email ?? "",
      phone: pi.phone ?? "",
      location: pi.location ?? "",
      linkedin: pi.linkedin ?? "",
      github: pi.github ?? "",
    },
    employment: emp.map((item) => ({
      _id: uid(),
      company: item.company ?? "",
      role: item.role ?? "",
      startDate: item.startDate ?? "",
      endDate: item.endDate ?? "",
      location: item.location ?? "",
    })),
    education: edu.map((item) => ({
      _id: uid(),
      institution: item.institution ?? "",
      degree: item.degree ?? "",
      dates: item.dates ?? "",
      location: item.location ?? "",
    })),
    certifications: certs.map((cert) => ({
      _id: uid(),
      value: typeof cert === "string" ? cert : "",
    })),
  };
}

function stateToProfile(state: ProfileState): unknown {
  return {
    version: "candidate-profile-v1",
    personalInfo: state.personalInfo,
    employmentHistory: state.employment.map(({ _id: _ignored, ...row }) => ({
      company: row.company,
      role: row.role,
      startDate: row.startDate,
      endDate: row.endDate,
      duration: row.startDate && row.endDate ? `${row.startDate} - ${row.endDate}` : (row.startDate || row.endDate || ""),
      location: row.location,
    })),
    education: state.education.map(({ _id: _ignored, ...row }) => ({
      institution: row.institution,
      degree: row.degree,
      dates: row.dates,
      location: row.location,
      details: [],
    })),
    certifications: state.certifications.map((c) => c.value).filter(Boolean),
    sourceAudit: { textHash: "", textLength: 0, parserVersion: "candidate-profile-v1", confidence: 1 },
  };
}

function emptyEmp(): EmpRow {
  return { _id: uid(), company: "", role: "", startDate: "", endDate: "", location: "" };
}

function emptyEdu(): EduRow {
  return { _id: uid(), institution: "", degree: "", dates: "", location: "" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: ProfileStatus }) {
  if (status === "approved") {
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        Approved
      </span>
    );
  }
  if (status === "converted" || status === "auto_converted") {
    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
        Needs approval
      </span>
    );
  }
  if (status === "conversion_failed") {
    return (
      <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
        Conversion failed
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
      Legacy
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResumeInstructionBuilder() {
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const enabled = !loading && user?.role === "admin";

  const [managerId, setManagerId] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [rulesText, setRulesText] = useState("");

  // ── Data fetching ────────────────────────────────────────────────────────────

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: api.listUsers,
    enabled,
    retry: false,
  });

  const managers = users.filter((item) => item.role === "manager");

  const { data: resumes = [], isFetching: loadingResumes } = useQuery({
    queryKey: ["resumes", "admin", managerId],
    queryFn: () => api.listResumes(managerId ? { managerId } : undefined),
    enabled,
  });

  const selectedResume = resumes.find((r) => r.id === resumeId) ?? null;

  const { data: profileData, isFetching: loadingProfile } = useQuery({
    queryKey: ["resume-profile", resumeId],
    queryFn: () => api.getResumeProfile(resumeId),
    enabled: enabled && Boolean(resumeId) && !resumeId.startsWith("legacy-template-"),
    retry: false,
  });

  useEffect(() => {
    if (!profileData?.resume) return;
    setProfileState(profileToState(profileData.resume.candidateProfile));
    setRulesText(profileData.resume.resumeRulesText ?? "");
  }, [profileData]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const uploadResume = useMutation({
    mutationFn: async () => {
      if (!managerId) throw new Error("Select a manager first.");
      if (!uploadFile) throw new Error("Choose a resume PDF/TXT file first.");
      return api.uploadResumeTemplate({
        managerId,
        title: uploadTitle.trim() || uploadFile.name.replace(/\.[^.]+$/, "") || "Client Resume",
        file: uploadFile,
      });
    },
    onSuccess: (resume) => {
      toast.success("Resume uploaded and converted");
      setUploadFile(null);
      setUploadTitle("");
      setResumeId(resume.id);
      qc.invalidateQueries({ queryKey: ["resumes"] });
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to upload resume");
    },
  });

  const convertResume = useMutation({
    mutationFn: async () => {
      if (!resumeId) throw new Error("Select a resume first.");
      return api.convertResumeProfile(resumeId);
    },
    onSuccess: (result) => {
      setProfileState(profileToState(result.candidateProfile));
      setRulesText(result.resumeRulesText);
      toast.success("Profile draft regenerated — review and approve to save");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to convert resume");
    },
  });

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!resumeId) throw new Error("Select a resume first.");
      if (!profileState) throw new Error("No profile data to save.");
      if (!rulesText.trim()) throw new Error("Resume rules cannot be empty.");
      await api.saveResumeProfile({
        resumeId,
        candidateProfile: stateToProfile(profileState),
        resumeRulesText: rulesText,
      });
    },
    onSuccess: () => {
      toast.success("Profile approved and saved — bidders can now generate resumes");
      qc.invalidateQueries({ queryKey: ["resumes"] });
      qc.invalidateQueries({ queryKey: ["resume-profile", resumeId] });
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to save profile");
    },
  });

  // ── Profile field helpers ────────────────────────────────────────────────────

  function setPersonalField(field: keyof ProfileState["personalInfo"], value: string) {
    setProfileState((prev) =>
      prev ? { ...prev, personalInfo: { ...prev.personalInfo, [field]: value } } : prev
    );
  }

  function updateEmp(id: string, field: keyof Omit<EmpRow, "_id">, value: string) {
    setProfileState((prev) =>
      prev
        ? {
            ...prev,
            employment: prev.employment.map((r) => (r._id === id ? { ...r, [field]: value } : r)),
          }
        : prev
    );
  }

  function removeEmp(id: string) {
    setProfileState((prev) =>
      prev ? { ...prev, employment: prev.employment.filter((r) => r._id !== id) } : prev
    );
  }

  function updateEdu(id: string, field: keyof Omit<EduRow, "_id">, value: string) {
    setProfileState((prev) =>
      prev
        ? {
            ...prev,
            education: prev.education.map((r) => (r._id === id ? { ...r, [field]: value } : r)),
          }
        : prev
    );
  }

  function removeEdu(id: string) {
    setProfileState((prev) =>
      prev ? { ...prev, education: prev.education.filter((r) => r._id !== id) } : prev
    );
  }

  function updateCert(id: string, value: string) {
    setProfileState((prev) =>
      prev
        ? {
            ...prev,
            certifications: prev.certifications.map((c) => (c._id === id ? { ...c, value } : c)),
          }
        : prev
    );
  }

  function removeCert(id: string) {
    setProfileState((prev) =>
      prev ? { ...prev, certifications: prev.certifications.filter((c) => c._id !== id) } : prev
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const isApproved = selectedResume?.profileStatus === "approved";
  const hasProfile = Boolean(profileState);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resume converter"
        description="Upload a PDF, review the extracted profile, then approve it. Bidders can only generate resumes after you approve."
        actions={
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["resumes"] })}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {/* ── Section 1: Manager + Upload ─────────────────────────────────────── */}
      <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">1. Choose manager</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The approved profile belongs to this manager. Their bidders use it for generation.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Manager</Label>
            <Select
              value={managerId}
              onValueChange={(value) => {
                setManagerId(value);
                setResumeId("");
                setProfileState(null);
                setRulesText("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select manager" />
              </SelectTrigger>
              <SelectContent>
                {managers.map((manager) => (
                  <SelectItem key={manager.id} value={manager.id}>
                    {manager.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
            <h3 className="mb-3 text-sm font-semibold">Upload and auto-convert</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="converter-title">Resume title</Label>
                <Input
                  id="converter-title"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Jacob Stovall source resume"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="converter-file">Resume file</Label>
                <Input
                  id="converter-file"
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button
                type="button"
                disabled={uploadResume.isPending || !managerId || !uploadFile}
                onClick={() => uploadResume.mutate()}
              >
                <Wand2 className="h-4 w-4" />
                {uploadResume.isPending ? "Converting..." : "Upload and convert"}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Resume list ──────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">2. Existing resumes</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick a resume to review and approve.
              </p>
            </div>
            {loadingResumes ? <span className="text-xs text-muted-foreground">Loading...</span> : null}
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {resumes
              .filter((r) => !r.id.startsWith("legacy-template-"))
              .map((resume) => (
                <button
                  key={resume.id}
                  type="button"
                  onClick={() => setResumeId(resume.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    resume.id === resumeId
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{resume.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {resume.textLength.toLocaleString()} chars
                      </p>
                    </div>
                    <StatusBadge status={resume.profileStatus} />
                  </div>
                </button>
              ))}

            {!loadingResumes &&
              resumes.filter((r) => !r.id.startsWith("legacy-template-")).length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No uploaded resumes yet.
                </div>
              )}
          </div>
        </div>
      </section>

      {/* ── Section 2: Profile review ────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-sm font-semibold">3. Review and approve</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Fix anything the parser missed, then approve. Approval unlocks generation for bidders.
              </p>
            </div>
            {selectedResume && <StatusBadge status={selectedResume.profileStatus} />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!selectedResume || convertResume.isPending || loadingProfile}
              onClick={() => convertResume.mutate()}
            >
              <Wand2 className="h-4 w-4" />
              {convertResume.isPending ? "Regenerating..." : "Regenerate draft"}
            </Button>
            <Button
              type="button"
              disabled={!selectedResume || saveProfile.isPending || !hasProfile || !rulesText}
              onClick={() => saveProfile.mutate()}
            >
              <Save className="h-4 w-4" />
              {saveProfile.isPending ? "Saving..." : isApproved ? "Save changes" : "Approve and save"}
            </Button>
          </div>
        </div>

        {!selectedResume ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
            <FileText className="h-10 w-10" />
            <p>Select or upload a resume to open the profile editor.</p>
          </div>
        ) : loadingProfile ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            Loading profile...
          </div>
        ) : !hasProfile ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
            <p>No profile extracted yet.</p>
            <Button variant="outline" onClick={() => convertResume.mutate()} disabled={convertResume.isPending}>
              <Wand2 className="h-4 w-4" />
              {convertResume.isPending ? "Generating..." : "Generate profile from PDF"}
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">

            {/* ── Personal Info ──────────────────────────────────────────── */}
            <div className="p-5">
              <h3 className="mb-4 text-sm font-semibold">Personal information</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(
                  [
                    { field: "name", label: "Full name" },
                    { field: "email", label: "Email" },
                    { field: "phone", label: "Phone" },
                    { field: "location", label: "Location" },
                    { field: "linkedin", label: "LinkedIn URL" },
                    { field: "github", label: "GitHub URL" },
                  ] as { field: keyof ProfileState["personalInfo"]; label: string }[]
                ).map(({ field, label }) => (
                  <div key={field} className="space-y-1.5">
                    <Label htmlFor={`pi-${field}`} className="text-xs">
                      {label}
                    </Label>
                    <Input
                      id={`pi-${field}`}
                      value={profileState!.personalInfo[field]}
                      onChange={(e) => setPersonalField(field, e.target.value)}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Employment History ─────────────────────────────────────── */}
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Employment history</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setProfileState((prev) =>
                      prev ? { ...prev, employment: [...prev.employment, emptyEmp()] } : prev
                    )
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add role
                </Button>
              </div>

              {profileState!.employment.length === 0 ? (
                <p className="text-sm text-muted-foreground">No employment history added.</p>
              ) : (
                <div className="space-y-4">
                  {profileState!.employment.map((row) => (
                    <div key={row._id} className="rounded-xl border border-border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">
                          {row.company || row.role || "New role"}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeEmp(row._id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Company</Label>
                          <Input
                            value={row.company}
                            onChange={(e) => updateEmp(row._id, "company", e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Job title</Label>
                          <Input
                            value={row.role}
                            onChange={(e) => updateEmp(row._id, "role", e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Start date</Label>
                          <Input
                            value={row.startDate}
                            onChange={(e) => updateEmp(row._id, "startDate", e.target.value)}
                            placeholder="e.g. Jan 2020"
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">End date</Label>
                          <Input
                            value={row.endDate}
                            onChange={(e) => updateEmp(row._id, "endDate", e.target.value)}
                            placeholder="e.g. Present"
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label className="text-xs">Location</Label>
                          <Input
                            value={row.location}
                            onChange={(e) => updateEmp(row._id, "location", e.target.value)}
                            placeholder="e.g. New York, NY"
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Education ──────────────────────────────────────────────── */}
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Education</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setProfileState((prev) =>
                      prev ? { ...prev, education: [...prev.education, emptyEdu()] } : prev
                    )
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add education
                </Button>
              </div>

              {profileState!.education.length === 0 ? (
                <p className="text-sm text-muted-foreground">No education added.</p>
              ) : (
                <div className="space-y-4">
                  {profileState!.education.map((row) => (
                    <div key={row._id} className="rounded-xl border border-border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">
                          {row.institution || "New entry"}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeEdu(row._id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Institution</Label>
                          <Input
                            value={row.institution}
                            onChange={(e) => updateEdu(row._id, "institution", e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Degree</Label>
                          <Input
                            value={row.degree}
                            onChange={(e) => updateEdu(row._id, "degree", e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Dates</Label>
                          <Input
                            value={row.dates}
                            onChange={(e) => updateEdu(row._id, "dates", e.target.value)}
                            placeholder="e.g. 2015 – 2019"
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Location</Label>
                          <Input
                            value={row.location}
                            onChange={(e) => updateEdu(row._id, "location", e.target.value)}
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Certifications ─────────────────────────────────────────── */}
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Certifications</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setProfileState((prev) =>
                      prev
                        ? { ...prev, certifications: [...prev.certifications, { _id: uid(), value: "" }] }
                        : prev
                    )
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add cert
                </Button>
              </div>

              {profileState!.certifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">No certifications — leave empty if none exist.</p>
              ) : (
                <div className="space-y-2">
                  {profileState!.certifications.map((cert) => (
                    <div key={cert._id} className="flex items-center gap-2">
                      <Input
                        value={cert.value}
                        onChange={(e) => updateCert(cert._id, e.target.value)}
                        placeholder="e.g. AWS Certified Solutions Architect"
                        className="text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeCert(cert._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Resume Rules TXT ───────────────────────────────────────── */}
            <div className="p-5">
              <div className="mb-3">
                <h3 className="text-sm font-semibold">Resume generation rules</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  These instructions are passed directly to the AI on every generation. Auto-generated from the profile above — edit only if needed.
                </p>
              </div>
              <Textarea
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                className="min-h-64 resize-y font-mono text-xs leading-relaxed"
                placeholder="Resume generation rules will appear here after conversion..."
              />
            </div>

          </div>
        )}
      </section>
    </div>
  );
}
