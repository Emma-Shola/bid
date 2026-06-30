import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ResumeExportModel } from "../exporter";
import { preventOrphanAmpersand } from "../shared";
import { Bullet } from "./Bullet";
import { SectionHeading } from "./SectionHeading";
import { resumePdfStyles as s } from "./styles";

// ── Section wrapper ────────────────────────────────────────────────────────
// Every section uses section.marginTop for consistent inter-section spacing.

function Section({
  heading,
  minAhead,
  children,
}: {
  heading: string;
  minAhead: number;
  children: ReactNode;
}) {
  return (
    <View style={s.section} minPresenceAhead={minAhead}>
      <SectionHeading>{heading}</SectionHeading>
      {children}
    </View>
  );
}

// ── Experience entry ───────────────────────────────────────────────────────
// Layout per entry:
//   Row: [Role title (bold, flex)]  [Date (right, 90pt)]
//        [Company – Location (italic, full width)]
//        Bullets (hanging indent)

function ExpEntry({ item }: { item: ResumeExportModel["experience"][number] }) {
  const companyLine = [item.company, item.location].filter(Boolean).join(" – ");

  return (
    <View style={s.entry} minPresenceAhead={46}>
      {/* Role + Date on one row — wrap=false keeps them together */}
      <View wrap={false}>
        <View style={s.roleDateRow}>
          <View style={s.roleCol}>
            <Text style={s.roleText} widows={2} orphans={2}>
              {preventOrphanAmpersand(item.role)}
            </Text>
          </View>
          <View style={s.dateCol}>
            <Text style={s.dateText}>{item.duration || " "}</Text>
          </View>
        </View>

        {/* Company – Location (italic, no extra gap — lineHeight provides rhythm) */}
        {companyLine ? (
          <Text style={s.companyLine}>{preventOrphanAmpersand(companyLine)}</Text>
        ) : null}
      </View>

      {/* Bullets */}
      {item.bullets.length > 0 ? (
        <View style={s.bulletsWrap}>
          {item.bullets.map((bullet, i) => (
            <Bullet key={i}>{bullet}</Bullet>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ── Education entry ────────────────────────────────────────────────────────
// Layout:
//   Degree (bold)
//   School · Dates (italic)

function EduEntry({ item }: { item: ResumeExportModel["education"][number] }) {
  const schoolLine = [item.school, item.duration].filter(Boolean).join(" · ");

  return (
    <View style={s.eduEntry} wrap={false}>
      <Text style={s.eduDegree} widows={2} orphans={2}>
        {item.degree}
      </Text>
      {schoolLine ? (
        <Text style={s.eduSchoolLine}>{schoolLine}</Text>
      ) : null}
      {item.details.length > 0 ? (
        <View style={s.eduDetailsWrap}>
          {item.details.map((d, i) => (
            <Bullet key={i}>{d}</Bullet>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ── Document body ──────────────────────────────────────────────────────────

export function DocumentFlow({ model }: { model: ResumeExportModel }) {
  // Normalise skill categories
  const skillCategories = model.skillCategories
    .map((c) => ({ category: c.category, skills: c.skills.filter((sk) => sk.trim()) }))
    .filter((c) => c.skills.length > 0);

  const skills =
    skillCategories.length > 0
      ? skillCategories
      : model.skills.filter((sk) => sk.trim()).length > 0
        ? [{ category: "Skills", skills: model.skills.filter((sk) => sk.trim()) }]
        : [];

  const certs = model.certificates.filter((c) => c.trim());

  return (
    <View>
      {/* Summary ────────────────────────────────────────────────── */}
      {model.summary ? (
        <Section heading="Summary" minAhead={34}>
          <Text style={s.summaryText} widows={2} orphans={2}>
            {model.summary}
          </Text>
        </Section>
      ) : null}

      {/* Experience ─────────────────────────────────────────────── */}
      {model.experience.length > 0 ? (
        <Section heading="Experience" minAhead={60}>
          {model.experience.map((item, i) => (
            <ExpEntry key={`${item.company}-${i}`} item={item} />
          ))}
        </Section>
      ) : null}

      {/* Skills ─────────────────────────────────────────────────── */}
      {skills.length > 0 ? (
        <Section heading="Skills" minAhead={30}>
          {skills.map((cat, i) => (
            <View key={`${cat.category}-${i}`} style={s.skillRow} wrap={false}>
              <Text style={s.skillLabel} widows={2} orphans={2}>
                {cat.category}:
              </Text>
              <Text style={s.skillText} widows={2} orphans={2}>
                {cat.skills.join(", ")}
              </Text>
            </View>
          ))}
        </Section>
      ) : null}

      {/* Certifications ─────────────────────────────────────────── */}
      {certs.length > 0 ? (
        <Section heading="Certifications" minAhead={24}>
          {certs.map((cert, i) => (
            <Bullet key={i}>{cert}</Bullet>
          ))}
        </Section>
      ) : null}

      {/* Education ──────────────────────────────────────────────── */}
      {model.education.length > 0 ? (
        <Section heading="Education" minAhead={40}>
          {model.education.map((item, i) => (
            <EduEntry key={`${item.school}-${i}`} item={item} />
          ))}
        </Section>
      ) : null}
    </View>
  );
}
