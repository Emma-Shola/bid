"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

type JobUser = {
  id: string;
  username: string;
  role: string;
  isApproved: boolean;
};

type BackgroundJob = {
  id: string;
  userId: string;
  type: string;
  status: string;
  attempts: number;
  error?: string | null;
  deadLetterReason?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  failedAt?: string | null;
  deadLetterAt?: string | null;
  user?: JobUser;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

type JobsResponse = {
  data: {
    items: BackgroundJob[];
    meta: {
      page: number;
      limit: number;
      total: number;
      pages: number;
      counts: Record<string, number>;
    };
  };
};

type JobDetailResponse = {
  data: {
    job: BackgroundJob;
  };
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function badgeStyle(status: string): CSSProperties {
  const palette: Record<string, { bg: string; fg: string }> = {
    queued: { bg: "rgba(56, 189, 248, 0.16)", fg: "#7dd3fc" },
    processing: { bg: "rgba(34, 197, 94, 0.16)", fg: "#86efac" },
    retrying: { bg: "rgba(250, 204, 21, 0.16)", fg: "#fde047" },
    completed: { bg: "rgba(34, 197, 94, 0.18)", fg: "#4ade80" },
    failed: { bg: "rgba(248, 113, 113, 0.18)", fg: "#fca5a5" },
    dead_letter: { bg: "rgba(239, 68, 68, 0.22)", fg: "#f87171" }
  };

  const colors = palette[status] ?? { bg: "rgba(148, 163, 184, 0.16)", fg: "#cbd5e1" };
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background: colors.bg,
    color: colors.fg,
    textTransform: "uppercase",
    letterSpacing: 0.8
  };
}

export function AdminJobsClient() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<BackgroundJob[]>([]);
  const [meta, setMeta] = useState<JobsResponse["data"]["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<BackgroundJob | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [bulkRetryBusy, setBulkRetryBusy] = useState(false);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "reconnecting" | "offline">(
    "connecting"
  );
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (query.trim()) params.set("q", query.trim());
    if (status) params.set("status", status);
    return params.toString();
  }, [page, limit, query, status]);

  async function loadJobs(silent = false) {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
      const response = await fetch(`/api/admin/jobs?${queryString}`, {
        cache: "no-store"
      });

      const payload = (await response.json()) as JobsResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load jobs");
      }

      setItems(payload.data.items);
      setMeta(payload.data.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadSelectedJob(jobId: string) {
    try {
      setSelectedLoading(true);
      const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      const payload = (await response.json()) as JobDetailResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load job");
      }
      setSelectedJob(payload.data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job");
    } finally {
      setSelectedLoading(false);
    }
  }

  async function retryJob(jobId: string) {
    try {
      setActionBusyId(jobId);
      const response = await fetch(`/api/admin/jobs/${jobId}/retry`, {
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to retry job");
      }

      await loadJobs(true);
      if (selectedJobId === jobId) {
        await loadSelectedJob(jobId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry job");
    } finally {
      setActionBusyId(null);
    }
  }

  async function retryDeadLetteredResumeJobs() {
    try {
      setBulkRetryBusy(true);
      const response = await fetch("/api/admin/jobs/retry-dead-letter-resume", {
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to retry dead-letter jobs");
      }

      await loadJobs(true);
      if (selectedJobId) {
        await loadSelectedJob(selectedJobId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry dead-letter jobs");
    } finally {
      setBulkRetryBusy(false);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, [queryString]);

  useEffect(() => {
    if (!selectedJobId) return;
    void loadSelectedJob(selectedJobId);
  }, [selectedJobId]);

  useEffect(() => {
    let disposed = false;

    const connect = () => {
      if (disposed) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = socket;
      setSocketStatus((current) => (current === "connected" ? current : "connecting"));

      socket.onopen = () => {
        setSocketStatus("connected");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type?: string;
            data?: { job?: BackgroundJob; jobId?: string };
          };
          if (payload.type !== "background-job.updated") {
            return;
          }

          void loadJobs(true);
          const changedJobId = payload.data?.jobId ?? payload.data?.job?.id;
          if (changedJobId && selectedJobId === changedJobId) {
            void loadSelectedJob(changedJobId);
          }
        } catch {
          // Ignore malformed messages.
        }
      };

      socket.onerror = () => {
        setSocketStatus("offline");
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (disposed) return;
        setSocketStatus("reconnecting");
        reconnectTimerRef.current = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [selectedJobId, queryString]);

  const progressLabel = selectedJob
    ? selectedJob.status === "completed"
      ? "Finished"
      : selectedJob.status === "dead_letter"
        ? "Needs attention"
        : selectedJob.status === "retrying"
          ? "Retrying"
          : "Live"
    : "Select a job";

  return (
    <main style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <p style={{ textTransform: "uppercase", letterSpacing: 2, fontSize: 12, color: "#94a3b8" }}>Admin</p>
          <h1 style={{ fontSize: 36, margin: "8px 0 6px" }}>Background jobs dashboard</h1>
          <p style={{ color: "#cbd5e1", maxWidth: 820, lineHeight: 1.6 }}>
            Watch resume generation in real time, inspect queue health, and retry failed work without leaving
            the console.
          </p>
          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", color: "#94a3b8", fontSize: 13 }}>
            <span style={badgeStyle(socketStatus === "connected" ? "completed" : socketStatus === "reconnecting" ? "retrying" : "queued")}>
              {socketStatus}
            </span>
            <span>Live updates replace polling.</span>
          </div>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 20
          }}
        >
          {Object.entries(meta?.counts ?? {}).map(([key, value]) => (
            <div
              key={key}
              style={{
                padding: 16,
                borderRadius: 18,
                background: "rgba(15, 23, 42, 0.85)",
                border: "1px solid rgba(148, 163, 184, 0.14)"
              }}
            >
              <div style={{ fontSize: 12, textTransform: "uppercase", color: "#94a3b8" }}>{key.replace("_", " ")}</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{value}</div>
            </div>
          ))}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.7fr) minmax(320px, 1fr)",
            gap: 20,
            alignItems: "start"
          }}
        >
          <div style={{ display: "grid", gap: 16 }}>
            <div
              style={{
                padding: 16,
                borderRadius: 20,
                background: "rgba(15, 23, 42, 0.9)",
                border: "1px solid rgba(148, 163, 184, 0.16)"
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12 }}>
                <input
                  value={query}
                  onChange={(event) => {
                    setPage(1);
                    setQuery(event.target.value);
                  }}
                  placeholder="Search by type, status, user, or error"
                  style={inputStyle}
                />
                <select
                  value={status}
                  onChange={(event) => {
                    setPage(1);
                    setStatus(event.target.value);
                  }}
                  style={inputStyle}
                >
                  <option value="">All statuses</option>
                  <option value="queued">Queued</option>
                  <option value="processing">Processing</option>
                  <option value="retrying">Retrying</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="dead_letter">Dead letter</option>
                </select>
                <select
                  value={limit}
                  onChange={(event) => {
                    setPage(1);
                    setLimit(Number(event.target.value));
                  }}
                  style={inputStyle}
                >
                  {[12, 20, 40, 60].map((value) => (
                    <option key={value} value={value}>
                      {value} per page
                    </option>
                  ))}
                </select>
                <button onClick={() => void loadJobs()} style={buttonStyle}>
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => void retryDeadLetteredResumeJobs()} style={ghostButtonStyle} disabled={bulkRetryBusy}>
                  {bulkRetryBusy ? "Retrying dead letters..." : "Retry dead-letter resumes"}
                </button>
              </div>
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 20,
                background: "rgba(15, 23, 42, 0.9)",
                border: "1px solid rgba(148, 163, 184, 0.16)"
              }}
            >
              {loading ? (
                <p style={mutedText}>Loading jobs...</p>
              ) : error ? (
                <p style={{ ...mutedText, color: "#fca5a5" }}>{error}</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Attempts</th>
                        <th style={thStyle}>User</th>
                        <th style={thStyle}>Created</th>
                        <th style={thStyle}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((job) => (
                        <tr key={job.id} style={{ borderTop: "1px solid rgba(148, 163, 184, 0.12)" }}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 700 }}>{job.type}</div>
                            <div style={{ color: "#94a3b8", fontSize: 12 }}>{job.id}</div>
                          </td>
                          <td style={tdStyle}>
                            <span style={badgeStyle(job.status)}>{job.status.replace("_", " ")}</span>
                          </td>
                          <td style={tdStyle}>{job.attempts}</td>
                          <td style={tdStyle}>{job.user?.username ?? "—"}</td>
                          <td style={tdStyle}>{formatDate(job.createdAt)}</td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button onClick={() => setSelectedJobId(job.id)} style={ghostButtonStyle}>
                                Watch
                              </button>
                              {(job.status === "failed" || job.status === "dead_letter") && (
                                <button
                                  onClick={() => void retryJob(job.id)}
                                  disabled={actionBusyId === job.id}
                                  style={ghostButtonStyle}
                                >
                                  {actionBusyId === job.id ? "Retrying..." : "Retry"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#cbd5e1" }}>
              <button
                style={ghostButtonStyle}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
              >
                Prev
              </button>
              <div>
                Page {meta?.page ?? 1} of {meta?.pages ?? 1}
              </div>
              <button
                style={ghostButtonStyle}
                onClick={() => setPage((value) => value + 1)}
                disabled={meta ? page >= meta.pages : false}
              >
                Next
              </button>
            </div>
          </div>

          <aside
            style={{
              padding: 18,
              borderRadius: 20,
              background: "rgba(15, 23, 42, 0.9)",
              border: "1px solid rgba(148, 163, 184, 0.16)",
              position: "sticky",
              top: 24
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>
                  Live monitor
                </p>
                <h2 style={{ margin: "6px 0 0", fontSize: 22 }}>{progressLabel}</h2>
              </div>
              {selectedJob?.status === "dead_letter" && (
                <span style={badgeStyle(selectedJob.status)}>Needs review</span>
              )}
            </div>

            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <input
                value={selectedJobId ?? ""}
                onChange={(event) => setSelectedJobId(event.target.value)}
                placeholder="Paste a job ID to monitor"
                style={inputStyle}
              />

              {selectedLoading ? (
                <p style={mutedText}>Fetching live state...</p>
              ) : selectedJob ? (
                <>
                  <Row label="Job ID" value={selectedJob.id} />
                  <Row label="Type" value={selectedJob.type} />
                  <Row label="Status" value={selectedJob.status} />
                  <Row label="Attempts" value={String(selectedJob.attempts)} />
                  <Row label="Created" value={formatDate(selectedJob.createdAt)} />
                  <Row label="Updated" value={formatDate(selectedJob.updatedAt)} />
                  <Row label="Completed" value={formatDate(selectedJob.completedAt)} />
                  <Row label="Failed" value={formatDate(selectedJob.failedAt)} />
                  <Row label="Dead letter" value={formatDate(selectedJob.deadLetterAt)} />
                  <Row label="Error" value={selectedJob.error ?? selectedJob.deadLetterReason ?? "—"} />
                  {selectedJob.status === "failed" || selectedJob.status === "dead_letter" ? (
                    <button
                      onClick={() => void retryJob(selectedJob.id)}
                      disabled={actionBusyId === selectedJob.id}
                      style={{ ...buttonStyle, width: "100%" }}
                    >
                      {actionBusyId === selectedJob.id ? "Retrying..." : "Retry this job"}
                    </button>
                  ) : null}
                </>
              ) : (
                <p style={mutedText}>Select a job from the table to watch its progress live.</p>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 12,
        alignItems: "start",
        paddingBottom: 10,
        borderBottom: "1px solid rgba(148, 163, 184, 0.1)"
      }}
    >
      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ color: "#e2e8f0", wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(2, 6, 23, 0.85)",
  color: "#e2e8f0",
  outline: "none"
};

const buttonStyle: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "none",
  background: "#38bdf8",
  color: "#02111f",
  cursor: "pointer",
  fontWeight: 700
};

const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "rgba(148, 163, 184, 0.16)",
  color: "#e2e8f0",
  border: "1px solid rgba(148, 163, 184, 0.18)"
};

const thStyle: CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.18)"
};

const tdStyle: CSSProperties = {
  padding: "14px 10px",
  verticalAlign: "top"
};

const mutedText: CSSProperties = {
  color: "#94a3b8",
  margin: 0
};
