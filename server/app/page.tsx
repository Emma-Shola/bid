import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section
        style={{
          width: "min(900px, 100%)",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          borderRadius: 24,
          background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.96))",
          padding: 32,
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)"
        }}
      >
        <p style={{ textTransform: "uppercase", letterSpacing: 2, fontSize: 12, color: "#94a3b8" }}>Topbrass backend</p>
        <h1 style={{ fontSize: 40, margin: "12px 0" }}>Professional job operations console</h1>
        <p style={{ maxWidth: 720, lineHeight: 1.7, color: "#cbd5e1" }}>
          This backend powers role-based access, AI resume generation, notifications, queue monitoring,
          and admin controls for the Topbrass platform.
        </p>
        <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="/admin/jobs"
            style={{
              padding: "12px 18px",
              borderRadius: 999,
              background: "#38bdf8",
              color: "#02111f",
              textDecoration: "none",
              fontWeight: 700
            }}
          >
            Open admin jobs dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
