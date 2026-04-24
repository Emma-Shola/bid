import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Payment } from "@/lib/types";

export default function Payments() {
  const qc = useQueryClient();
  const { data: payments = [] } = useQuery({ queryKey: ["payments"], queryFn: api.listPayments });
  const { data: report } = useQuery({ queryKey: ["payments-report"], queryFn: api.paymentsReport });
  const { data: bidders = [] } = useQuery({ queryKey: ["manager-bidders"], queryFn: api.listBidders });

  const [form, setForm] = useState({
    bidderId: "",
    amount: "",
    paymentDate: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });

  const bidderOptions = useMemo(
    () => bidders.filter((item) => item.role === "bidder"),
    [bidders],
  );

  const createPayment = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      if (!form.bidderId) throw new Error("Select a bidder first");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid payment amount");

      const paymentDateIso = form.paymentDate ? new Date(`${form.paymentDate}T12:00:00.000Z`).toISOString() : undefined;

      return api.createPayment({
        bidderId: form.bidderId,
        amount,
        paymentDate: paymentDateIso,
        notes: form.notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      setForm((current) => ({ ...current, amount: "", notes: "" }));
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payments-report"] });
      qc.invalidateQueries({ queryKey: ["manager-bidders"] });
    },
    onError: (error) => {
      toast.error((error as Error).message || "Could not record payment");
    },
  });

  const columns: Column<Payment>[] = [
    { key: "id", header: "Payment", cell: (row) => <span className="font-mono text-xs">{row.id}</span> },
    { key: "bidder", header: "Bidder", sortable: true, sortValue: (row) => row.bidderName, cell: (row) => <span className="font-medium">{row.bidderName}</span> },
    { key: "amount", header: "Amount", sortable: true, sortValue: (row) => row.amount, cell: (row) => <span className="tabular-nums">${row.amount.toLocaleString()}</span>, className: "text-right" },
    { key: "status", header: "Status", sortable: true, sortValue: (row) => row.status, cell: (row) => <StatusBadge value={row.status} /> },
    { key: "date", header: "Date", sortable: true, sortValue: (row) => row.paymentDate ?? row.createdAt, cell: (row) => <span className="tabular-nums text-muted-foreground">{format(new Date(row.paymentDate ?? row.createdAt), "MMM d, yyyy")}</span> },
    { key: "notes", header: "Notes", cell: (row) => <span className="text-muted-foreground">{row.notes || "-"}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Record bidder payouts and review payment history."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = [
                ["ID", "Bidder", "Amount", "Status", "Date", "Notes"],
                ...payments.map((p) => [
                  p.id,
                  p.bidderName,
                  p.amount.toString(),
                  p.status,
                  p.paymentDate ?? p.createdAt,
                  p.notes ?? "",
                ]),
              ];
              const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "payments-report.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download report
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total paid" value={`$${(report?.total ?? 0).toLocaleString()}`} />
        <StatCard label="Paid" value={`$${(report?.paid ?? 0).toLocaleString()}`} hint="Settled" />
        <StatCard label="Pending" value={`$${(report?.pending ?? 0).toLocaleString()}`} />
        <StatCard label="Failed" value={`$${(report?.failed ?? 0).toLocaleString()}`} />
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold">Record bidder payment</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Use this to mark when a bidder has been paid and how much.
          </p>
        </div>

        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            void createPayment.mutate();
          }}
        >
          <div className="space-y-1.5 xl:col-span-2">
            <Label htmlFor="payment-bidder">Bidder</Label>
            <Select
              value={form.bidderId || undefined}
              onValueChange={(value) => setForm((current) => ({ ...current, bidderId: value }))}
            >
              <SelectTrigger id="payment-bidder">
                <SelectValue placeholder="Select bidder" />
              </SelectTrigger>
              <SelectContent>
                {bidderOptions.map((bidder) => (
                  <SelectItem key={bidder.id} value={bidder.id}>
                    {bidder.name} ({bidder.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">Amount (USD)</Label>
            <Input
              id="payment-amount"
              type="number"
              min={1}
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-date">Payment date</Label>
            <Input
              id="payment-date"
              type="date"
              value={form.paymentDate}
              onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2 xl:col-span-4">
            <Label htmlFor="payment-notes">Notes</Label>
            <Textarea
              id="payment-notes"
              rows={2}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Optional payment note"
            />
          </div>

          <div className="md:col-span-2 xl:col-span-4">
            <Button type="submit" disabled={createPayment.isPending}>
              {createPayment.isPending ? "Saving payment..." : "Record payment"}
            </Button>
          </div>
        </form>
      </section>

      <DataTable
        data={payments}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search payment or bidder..."
        searchKeys={(row) => `${row.id} ${row.bidderName}`}
      />
    </div>
  );
}
