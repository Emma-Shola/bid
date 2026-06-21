import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ResumeExportModel } from "../exporter";
import { SectionHeading } from "./SectionHeading";
import { resumePdfStyles as styles } from "./styles";

type SkillsSectionProps = Pick<ResumeExportModel, "skillCategories" | "skills">;

export function SkillsSection({ skillCategories, skills }: SkillsSectionProps) {
  const normalizedCategories = skillCategories
    .map((category) => ({
      category: category.category,
      skills: category.skills.filter((skill) => skill.trim())
    }))
    .filter((category) => category.skills.length > 0);
  const normalizedSkills = skills.filter((skill) => skill.trim());
  const renderedCategories =
    normalizedCategories.length > 0
      ? normalizedCategories
      : normalizedSkills.length > 0
        ? [{ category: "Skills", skills: normalizedSkills }]
        : [];

  if (renderedCategories.length === 0) {
    return null;
  }

  return (
    <View style={styles.section} minPresenceAhead={28}>
      <SectionHeading>Technical Skills</SectionHeading>
      <View style={styles.sectionBody}>
        {renderedCategories.map((category, index) => {
          const skillText = category.skills.join(", ");
          if (!skillText) {
            return null;
          }

          return (
            <View key={`${category.category}-${index}`} style={styles.skillRow} wrap={false}>
              <Text style={styles.skillLabel} widows={2} orphans={2}>
                {category.category}:
              </Text>
              <Text style={styles.skillText} widows={2} orphans={2}>
                {skillText}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}



