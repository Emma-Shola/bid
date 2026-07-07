import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Download, X, Plus, Users2 } from "lucide-react";
import { api } from "@/lib/api";
import { downloadFromUrl } from "@/lib/download";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AppliedCompanyEntry, BidderClient, Role, User } from "@/lib/types";

function ClientsDialog({
  bidder,
  managers,
  onClose,
  onAssigned,
}: {
  bidder: User | null;
  managers: User[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const qc = useQueryClient();
  const [addManagerId, setAddManagerId] = useState("");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["admin-bidder-clients", bidder?.id],
    queryFn: () => api.adminGetBidderClients(bidder!.id),
    enabled: !!bidder,
    refetchOnMount: "always",
  });

  const assign = useMutation({
    mutationFn: (managerId: string) => api.adminAssignClient(bidder!.id, managerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-bidder-clients", bidder?.id] });
      setAddManagerId("");
      onAssigned();
      toast.success("Client assigned");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to assign client"),
  });

  const remove = useMutation({
    mutationFn: (managerId: string) => api.adminRemoveClient(bidder!.id, managerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-bidder-clients", bidder?.id] });
      onAssigned();
      toast.success("Client removed");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to remove client"),
  });

  const assignedIds = new Set(clients.map((c) => c.managerId));
  const available = managers.filter((m) => !assignedIds.has(m.id));

  return (
    <Dialog open={!!bidder} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Clients — {bidder?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Current assignments */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Assigned Clients
            </p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clients assigned yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {clients.map((client: BidderClient) => (
                  <li
                    key={client.managerId}
                    className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{client.managerName}</span>
                      {client.isActive && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-2xs font-medium text-green-700">
                          Active
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(client.managerId)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add new client */}
          {available.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Add Client
              </p>
              <div className="flex gap-2">
                <Select value={addManagerId} onValueChange={setAddManagerId}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder="Select a manager…" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  disabled={!addManagerId || assign.isPending}
                  onClick={() => addManagerId && assign.mutate(addManagerId)}
                  className="gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Assign
                </Button>
              </div>
            </div>
          )}

          {available.length === 0 && clients.length > 0 && (
            <p className="text-xs text-muted-foreground">All managers are already assigned to this bidder.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManagerRulesDialog({
  manager,
  onClose,
}: {
  manager: User | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [minAtsScore, setMinAtsScore] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("");
  const [filenameIncludesCandidateName, setFilenameIncludesCandidateName] = useState(false);
  const [groupDownloadsByCompanyFolder, setGroupDownloadsByCompanyFolder] = useState(false);
  const [duplicateCompanyCooldownDays, setDuplicateCompanyCooldownDays] = useState("");

  useEffect(() => {
    if (!manager) return;
    const rules = manager.generationRules ?? {};
    setMinAtsScore(typeof rules.minAtsScore === "number" ? String(rules.minAtsScore) : "");
    setMaxAttempts(typeof rules.maxGenerationAttempts === "number" ? String(rules.maxGenerationAttempts) : "");
    setFilenameIncludesCandidateName(Boolean(rules.filenameIncludesCandidateName));
    setGroupDownloadsByCompanyFolder(Boolean(rules.groupDownloadsByCompanyFolder));
    setDuplicateCompanyCooldownDays(
      typeof rules.duplicateCompanyCooldownDays === "number" ? String(rules.duplicateCompanyCooldownDays) : "",
    );
  }, [manager]);

  const save = useMutation({
    mutationFn: () =>
      api.updateManagerRules(manager!.id, {
        minAtsScore: minAtsScore.trim() ? Number(minAtsScore) : undefined,
        maxGenerationAttempts: maxAttempts.trim() ? Number(maxAttempts) : undefined,
        filenameIncludesCandidateName,
        groupDownloadsByCompanyFolder,
        duplicateCompanyCooldownDays: duplicateCompanyCooldownDays.trim()
          ? Number(duplicateCompanyCooldownDays)
          : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Generation rules saved");
      onClose();
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to save generation rules");
    },
  });

  return (
    <Dialog open={!!manager} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generation rules — {manager?.name}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="rules">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="applied">Applied companies</TabsTrigger>
          </TabsList>

          <TabsContent value="rules">
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="minAtsScore">Minimum ATS score (%)</Label>
            <Input
              id="minAtsScore"
              type="number"
              min="0"
              max="100"
              placeholder="No minimum"
              value={minAtsScore}
              onChange={(e) => setMinAtsScore(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Resumes below this score auto-regenerate before falling back to QA review.
            </p>
          </div>

          {minAtsScore.trim() && (
            <div className="space-y-1.5">
              <Label htmlFor="maxAttempts">Max regeneration attempts</Label>
              <Input
                id="maxAttempts"
                type="number"
                min="1"
                max="5"
                placeholder="3"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="duplicateCompanyCooldownDays">Block reapplying to the same company for (days)</Label>
            <Input
              id="duplicateCompanyCooldownDays"
              type="number"
              min="1"
              max="365"
              placeholder="No restriction"
              value={duplicateCompanyCooldownDays}
              onChange={(e) => setDuplicateCompanyCooldownDays(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A bidder can't generate a resume for a company they already targeted within this window.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={filenameIncludesCandidateName}
              onChange={(e) => setFilenameIncludesCandidateName(e.target.checked)}
            />
            <span>Name downloaded files after the candidate</span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={groupDownloadsByCompanyFolder}
              onChange={(e) => setGroupDownloadsByCompanyFolder(e.target.checked)}
            />
            <span>
              Save auto-downloads into a folder named after the target company
              <span className="block text-xs text-muted-foreground">
                Only applies to auto-saved downloads, not manual re-downloads from the queue.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving..." : "Save rules"}
            </Button>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="applied">
            <AppliedCompaniesTab manager={manager} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function AppliedCompaniesTab({ manager }: { manager: User | null }) {
  const qc = useQueryClient();
  const [bulkInput, setBulkInput] = useState("");

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["manager-applied-companies", manager?.id],
    queryFn: () => api.getManagerAppliedCompanies(manager!.id),
    enabled: !!manager,
  });

  const add = useMutation({
    mutationFn: (names: string[]) => api.addManagerAppliedCompanies(manager!.id, names),
    onSuccess: (updated) => {
      qc.setQueryData(["manager-applied-companies", manager?.id], updated);
      setBulkInput("");
      toast.success("Companies added");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to add companies");
    },
  });

  const remove = useMutation({
    mutationFn: (company: string) => api.removeManagerAppliedCompany(manager!.id, company),
    onSuccess: (updated) => {
      qc.setQueryData(["manager-applied-companies", manager?.id], updated);
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to remove company");
    },
  });

  function handleAdd() {
    const names = Array.from(
      new Set(
        bulkInput
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    );
    if (names.length === 0) {
      toast.error("Paste at least one company name");
      return;
    }
    add.mutate(names);
  }

  return (
    <div className="space-y-4 pt-2">
      {!manager?.generationRules?.duplicateCompanyCooldownDays && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Set "Block reapplying to the same company for (days)" on the Rules tab first — this list only takes
          effect once that's set.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="bulkCompanies">Paste companies already applied to (one per line)</Label>
        <Textarea
          id="bulkCompanies"
          rows={8}
          placeholder={"Acme Corp\nGlobex Inc\n..."}
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Each one gets today's date as its applied date and stays blocked for the cooldown window above.
        </p>
        <Button type="button" size="sm" disabled={add.isPending} onClick={handleAdd}>
          {add.isPending ? "Adding..." : "Add companies"}
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label>Currently blocked ({companies.length})</Label>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No companies added yet.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-md border">
            <ul className="divide-y">
              {companies.map((entry: AppliedCompanyEntry) => (
                <li key={entry.company} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <div>
                    <span className="font-medium">{entry.company}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      applied {format(new Date(entry.appliedAt), "MMM d, yyyy")}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(entry.company)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Users() {
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const enabled = !loading && user?.role === "admin";
  const { data = [] } = useQuery({
    queryKey: ["users"],
    queryFn: api.listUsers,
    enabled,
    refetchOnMount: "always",
    retry: false
  });
  const { data: resumeTemplates = [] } = useQuery({
    queryKey: ["resumes", "admin"],
    queryFn: () => api.listResumes(),
    enabled
  });

  const [managerForm, setManagerForm] = useState({
    username: "",
    password: "",
    fullName: "",
    email: "",
    template: null as File | null
  });
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [uploadingTemplateManagerId, setUploadingTemplateManagerId] = useState<string | null>(null);
  const [clientsDialogBidder, setClientsDialogBidder] = useState<User | null>(null);
  const [rulesDialogManager, setRulesDialogManager] = useState<User | null>(null);

  const managers = useMemo(
    () => data.filter((item) => item.role === "manager"),
    [data]
  );
    const managerResumeSummary = useMemo(() => {
      const map = new Map<string, { count: number; latestUrl: string | null }>();
      for (const resume of resumeTemplates) {
        if (resume.id.startsWith("legacy-template-")) {
          continue;
        }
        const current = map.get(resume.managerId) ?? { count: 0, latestUrl: null };
        map.set(resume.managerId, {
          count: current.count + 1,
          latestUrl: current.latestUrl ?? resume.openUrl ?? resume.fileUrl ?? null
        });
    }
    return map;
  }, [resumeTemplates]);

  const update = useMutation({
    mutationFn: ({
      id,
      role,
      isApproved,
      managerId
    }: {
      id: string;
      role?: Role;
      isApproved?: boolean;
      managerId?: string | null;
    }) => api.updateUser(id, { role, isApproved, managerId }),
    onMutate: async (variables) => {
      setSavingUserId(variables.id);
      await qc.cancelQueries({ queryKey: ["users"] });
      const previous = qc.getQueryData<User[]>(["users"]) ?? [];
      const managerName =
        typeof variables.managerId === "string"
          ? managers.find((manager) => manager.id === variables.managerId)?.name ?? null
          : undefined;

      qc.setQueryData<User[]>(["users"], (current = []) =>
        current.map((item) => {
          if (item.id !== variables.id) return item;
          return {
            ...item,
            role: variables.role ?? item.role,
            isApproved: typeof variables.isApproved === "boolean" ? variables.isApproved : item.isApproved,
            status:
              typeof variables.isApproved === "boolean"
                ? variables.isApproved
                  ? "active"
                  : "pending"
                : item.status,
            managerId: typeof variables.managerId === "undefined" ? item.managerId : variables.managerId,
            managerName:
              typeof managerName !== "undefined"
                ? managerName
                : typeof variables.managerId === "undefined"
                  ? item.managerName
                  : null
          };
        })
      );

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData(["users"], context.previous);
      }
      toast.error((error as Error).message || "Failed to update user");
    },
    onSuccess: (updatedUser) => {
      qc.setQueryData<User[]>(["users"], (current = []) =>
        current.map((item) => (item.id === updatedUser.id ? updatedUser : item))
      );
      toast.success("User updated");
    },
    onSettled: () => {
      setSavingUserId(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    }
  });

  const createManager = useMutation({
    mutationFn: () => {
      if (!managerForm.template) {
        throw new Error("Please upload the client CV template");
      }

      return api.createManager({
        username: managerForm.username.trim(),
        password: managerForm.password,
        fullName: managerForm.fullName.trim(),
        email: managerForm.email.trim(),
        template: managerForm.template,
        isApproved: true
      });
    },
    onSuccess: () => {
      setManagerForm({
        username: "",
        password: "",
        fullName: "",
        email: "",
        template: null
      });
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Manager account created");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to create manager");
    }
  });

  const uploadManagerTemplate = useMutation({
    mutationFn: async ({ managerId, file }: { managerId: string; file: File }) => {
      setUploadingTemplateManagerId(managerId);
      return api.uploadResumeTemplate({
        managerId,
        title: file.name.replace(/\.[^.]+$/, "") || "Manager Resume Template",
        file
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Manager resume template updated");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to update manager template");
    },
    onSettled: () => {
      setUploadingTemplateManagerId(null);
    }
  });

  const deleteManagerTemplate = useMutation({
    mutationFn: async (managerId: string) => {
      setUploadingTemplateManagerId(managerId);
      await api.deleteLatestManagerResume(managerId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Manager resume template deleted");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to delete manager template");
    },
    onSettled: () => {
      setUploadingTemplateManagerId(null);
    }
  });

  function pickManagerTemplate(managerId: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg,image/webp";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      uploadManagerTemplate.mutate({ managerId, file });
    };
    input.click();
  }

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      sortValue: (row) => row.name,
      cell: (row) => <span className="font-medium">{row.name}</span>
    },
    {
      key: "email",
      header: "Email",
      cell: (row) => <span className="text-muted-foreground">{row.email}</span>
    },
    { key: "role", header: "Role", cell: (row) => <StatusBadge value={row.role} /> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
    {
      key: "manager",
      header: "Assigned Manager",
      cell: (row) =>
        row.role === "bidder" ? (
          <span className="text-muted-foreground">{row.managerName ?? "Unassigned"}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )
    },
    {
      key: "cv",
      header: "Manager CV",
      cell: (row) => {
        if (row.role !== "manager") {
          return <span className="text-muted-foreground">-</span>;
        }

        const summary = managerResumeSummary.get(row.id);
        if (!summary || summary.count === 0) {
          return <span className="text-amber-600">Not uploaded</span>;
        }

        return (
          <div className="text-xs">
            <span className="font-medium text-emerald-600">Uploaded ({summary.count})</span>
            {summary.latestUrl ? (
              <a
                href={summary.latestUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-2 underline underline-offset-2"
              >
                Open latest
              </a>
            ) : null}
          </div>
        );
      }
    },
    {
      key: "joined",
      header: "Joined",
      sortable: true,
      sortValue: (row) => row.createdAt,
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {format(new Date(row.createdAt), "MMM d, yyyy")}
        </span>
      )
    },
    {
      key: "actions",
      header: "",
      width: "1%",
      cell: (row) => (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select
            value={row.role}
            onValueChange={(value) => {
              if (value === row.role) return;
              update.mutate({ id: row.id, role: value as Role });
            }}
            disabled={savingUserId === row.id && update.isPending}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bidder">Bidder</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>

          {row.role === "bidder" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setClientsDialogBidder(row)}
            >
              <Users2 className="h-3.5 w-3.5" />
              Clients
            </Button>
          )}

          {row.role === "manager" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadManagerTemplate.isPending && uploadingTemplateManagerId === row.id}
                onClick={() => pickManagerTemplate(row.id)}
              >
                {uploadManagerTemplate.isPending && uploadingTemplateManagerId === row.id
                  ? "Uploading CV..."
                  : "Upload CV"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  (deleteManagerTemplate.isPending && uploadingTemplateManagerId === row.id) ||
                  !managerResumeSummary.get(row.id)?.count
                }
                onClick={() => deleteManagerTemplate.mutate(row.id)}
              >
                {deleteManagerTemplate.isPending && uploadingTemplateManagerId === row.id
                  ? "Deleting..."
                  : "Delete CV"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRulesDialogManager(row)}
              >
                Rules
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadFromUrl(api.getManagerResumeReportUrl(row.id))}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export resumes
              </Button>
            </>
          )}

          <Button
            variant={row.isApproved ? "outline" : "default"}
            size="sm"
            disabled={savingUserId === row.id && update.isPending}
            onClick={() => update.mutate({ id: row.id, isApproved: !row.isApproved })}
          >
            {row.isApproved ? "Revoke" : "Approve"}
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Create managers, assign bidders, and control account permissions." />

      <ClientsDialog
        bidder={clientsDialogBidder}
        managers={managers}
        onClose={() => setClientsDialogBidder(null)}
        onAssigned={() => {
          qc.invalidateQueries({ queryKey: ["users"] });
        }}
      />

      <ManagerRulesDialog manager={rulesDialogManager} onClose={() => setRulesDialogManager(null)} />

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold">Create Manager Account</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Create the manager and upload the client CV template in one step.
          </p>
        </div>

        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            void createManager.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="manager-full-name">Full Name</Label>
            <Input
              id="manager-full-name"
              value={managerForm.fullName}
              onChange={(event) =>
                setManagerForm((current) => ({ ...current, fullName: event.target.value }))
              }
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manager-username">Username</Label>
            <Input
              id="manager-username"
              value={managerForm.username}
              onChange={(event) =>
                setManagerForm((current) => ({ ...current, username: event.target.value }))
              }
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manager-email">Email</Label>
            <Input
              id="manager-email"
              type="email"
              value={managerForm.email}
              onChange={(event) =>
                setManagerForm((current) => ({ ...current, email: event.target.value }))
              }
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manager-password">Password</Label>
            <Input
              id="manager-password"
              type="password"
              minLength={8}
              value={managerForm.password}
              onChange={(event) =>
                setManagerForm((current) => ({ ...current, password: event.target.value }))
              }
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manager-template">Client CV Template</Label>
            <Input
              id="manager-template"
              type="file"
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg,image/webp"
              onChange={(event) =>
                setManagerForm((current) => ({
                  ...current,
                  template: event.target.files?.[0] ?? null
                }))
              }
              required
            />
          </div>

          <div className="md:col-span-2 xl:col-span-5">
            <Button type="submit" disabled={createManager.isPending}>
              {createManager.isPending ? "Creating manager..." : "Create manager and attach CV template"}
            </Button>
          </div>
        </form>
      </section>

      <DataTable
        data={data}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search user..."
        searchKeys={(row) => `${row.name} ${row.email} ${row.role} ${row.managerName ?? ""}`}
      />
    </div>
  );
}
