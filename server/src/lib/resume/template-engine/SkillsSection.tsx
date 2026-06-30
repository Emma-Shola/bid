import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ResumeExportModel } from "../exporter";
import { SectionHeading } from "./SectionHeading";
import { resumePdfStyles as s } from "./styles";

export function SkillsSection({ skillCategories, skills }: Pick<ResumeExportModel, "skillCategories" | "skills">) {
  const categories = skillCategories
    .map((c) => ({ category: c.category, skills: c.skills.filter((sk) => sk.trim()) }))
    .filter((c) => c.skills.length > 0);

  const rows =
    categories.length > 0
      ? categories
      : skills.filter((sk) => sk.trim()).length > 0
        ? [{ category: "Skills", skills: skills.filter((sk) => sk.trim()) }]
        : [];

  if (rows.length === 0) return null;

  return (
    <View style={s.section} minPresenceAhead={28}>
      <SectionHeading>Skills</SectionHeading>
      {rows.map((cat, i) => (
        <View key={`${cat.category}-${i}`} style={s.skillRow} wrap={false}>
          <Text style={s.skillLabel} widows={2} orphans={2}>
            {cat.category}:
          </Text>
          <Text style={s.skillText} widows={2} orphans={2}>
            {cat.skills.join(", ")}
          </Text>
        </View>
      ))}
    </View>
  );
}
