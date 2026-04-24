import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Role, User } from "@/lib/types";

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

  const managers = useMemo(
    () => data.filter((item) => item.role === "manager"),
    [data]
  );
  const managerResumeSummary = useMemo(() => {
    const map = new Map<string, { count: number; latestUrl: string | null }>();
    for (const resume of resumeTemplates) {
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
            <Select
              value={row.managerId ?? "__none"}
              onValueChange={(value) => {
                const nextValue = value === "__none" ? null : value;
                if (nextValue === row.managerId) return;
                update.mutate({
                  id: row.id,
                  managerId: nextValue
                });
              }}
              disabled={savingUserId === row.id && update.isPending}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Assign manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Unassigned</SelectItem>
                {managers.map((manager) => (
                  <SelectItem key={manager.id} value={manager.id}>
                    {manager.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
