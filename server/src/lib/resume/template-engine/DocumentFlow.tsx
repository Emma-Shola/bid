import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ResumeExportModel } from "../exporter";
import { Bullet } from "./Bullet";
import { SectionHeading } from "./SectionHeading";
import { resumePdfStyles as styles } from "./styles";

type DocumentFlowProps = {
  model: ResumeExportModel;
};

function SectionBody({ children }: { children: ReactNode }) {
  return <View style={styles.sectionBody}>{children}</View>;
}

function SectionGroup({
  heading,
  minPresenceAhead,
  children
}: {
  heading: string;
  minPresenceAhead: number;
  children: ReactNode;
}) {
  return (
    <View style={styles.section} minPresenceAhead={minPresenceAhead}>
      <SectionHeading>{heading}</SectionHeading>
      <SectionBody>{children}</SectionBody>
    </View>
  );
}

function ExperienceEntry({ item, index }: { item: ResumeExportModel["experience"][number]; index: number }) {
  return (
    <View key={`${item.company}-${item.role}-${index}`} style={styles.entry} minPresenceAhead={46}>
      <View style={styles.entryHeader} wrap={false}>
        <View style={styles.entryRow}>
          <View style={styles.entryLeft}>
            <Text style={styles.entryRole} widows={2} orphans={2}>
              {item.role}
            </Text>
          </View>
          <View style={styles.entryRight}>
            {item.duration ? <Text style={styles.entryDate}>{item.duration}</Text> : <Text style={styles.entryDate}> </Text>}
          </View>
        </View>
        <View style={styles.entryRow}>
          <View style={styles.entryLeft}>
            <Text style={styles.entryCompany} widows={2} orphans={2}>
              {item.company}
            </Text>
          </View>
          <View style={styles.entryRight}>
            {item.location ? <Text style={styles.entryLocation}>{item.location}</Text> : <Text style={styles.entryLocation}> </Text>}
          </View>
        </View>
      </View>
      <View style={styles.entryBody}>
        {item.bullets.map((bullet, bulletIndex) => (
          <Bullet key={`${item.company}-${index}-bullet-${bulletIndex}`}>{bullet}</Bullet>
        ))}
      </View>
    </View>
  );
}

function EducationEntry({ item, index }: { item: ResumeExportModel["education"][number]; index: number }) {
  return (
    <View key={`${item.school}-${index}`} style={styles.entry} minPresenceAhead={30}>
      <View style={styles.entryHeader} wrap={false}>
        <View style={styles.entryRow}>
          <View style={styles.entryLeft}>
            <Text style={styles.entryRole} widows={2} orphans={2}>
              {item.school}
            </Text>
          </View>
          <View style={styles.entryRight}>
            {item.duration ? <Text style={styles.entryDate}>{item.duration}</Text> : <Text style={styles.entryDate}> </Text>}
          </View>
        </View>
        <View style={styles.entryRow}>
          <View style={styles.entryLeft}>
            <Text style={styles.entryCompany} widows={2} orphans={2}>
              {item.degree}
            </Text>
          </View>
          <View style={styles.entryRight}>
            {item.location ? <Text style={styles.entryLocation}>{item.location}</Text> : <Text style={styles.entryLocation}> </Text>}
          </View>
        </View>
      </View>
      <View style={styles.educationDetails}>
        {item.details.map((detail, detailIndex) => (
          <Bullet key={`${item.school}-${index}-${detailIndex}`}>{detail}</Bullet>
        ))}
      </View>
    </View>
  );
}

export function DocumentFlow({ model }: DocumentFlowProps) {
  const normalizedSkillCategories = model.skillCategories
    .map((category) => ({
      category: category.category,
      skills: category.skills.filter((skill) => skill.trim())
    }))
    .filter((category) => category.skills.length > 0 || category.category.trim());
  const renderedSkills =
    normalizedSkillCategories.length > 0
      ? normalizedSkillCategories
      : model.skills.filter((skill) => skill.trim()).length > 0
        ? [{ category: "Skills", skills: model.skills.filter((skill) => skill.trim()) }]
        : [];

  const renderedCertificates = model.certificates.filter((certificate) => certificate.trim());

  return (
    <View>
      {model.summary ? (
        <SectionGroup heading="Professional Summary" minPresenceAhead={34}>
          <Text style={styles.summary} widows={2} orphans={2}>
            {model.summary}
          </Text>
        </SectionGroup>
      ) : null}

      {model.experience.length > 0 ? (
        <SectionGroup heading="Work Experience" minPresenceAhead={60}>
          {model.experience.map((item, index) => (
            <ExperienceEntry key={`${item.company}-${item.role}-${index}`} item={item} index={index} />
          ))}
        </SectionGroup>
      ) : null}

      {model.education.length > 0 ? (
        <SectionGroup heading="Education" minPresenceAhead={46}>
          {model.education.map((item, index) => (
            <EducationEntry key={`${item.school}-${index}`} item={item} index={index} />
          ))}
        </SectionGroup>
      ) : null}

      {renderedCertificates.length > 0 ? (
        <SectionGroup heading="Certificates" minPresenceAhead={24}>
          {renderedCertificates.map((certificate, index) => (
            <Bullet key={`${certificate}-${index}`}>{certificate}</Bullet>
          ))}
        </SectionGroup>
      ) : null}

      {renderedSkills.length > 0 ? (
        <SectionGroup heading="Technical Skills" minPresenceAhead={30}>
          {renderedSkills.map((category, index) => {
            const skillText = category.skills.join(", ");
            if (!skillText) return null;

            return (
              <View key={`${category.category}-${index}`} style={styles.skillRow}>
                <Text style={styles.skillLabel} widows={2} orphans={2}>
                  {category.category}:
                </Text>
                <Text style={styles.skillText} widows={2} orphans={2}>
                  {skillText}
                </Text>
              </View>
            );
          })}
        </SectionGroup>
      ) : null}
    </View>
  );
}



