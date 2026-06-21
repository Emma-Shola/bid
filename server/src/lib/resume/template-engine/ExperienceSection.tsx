import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ResumeExportModel } from "../exporter";
import { Bullet } from "./Bullet";
import { SectionHeading } from "./SectionHeading";
import { resumePdfStyles as styles } from "./styles";

type ExperienceSectionProps = Pick<ResumeExportModel, "experience">;

export function ExperienceSection({ experience }: ExperienceSectionProps) {
  if (experience.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <SectionHeading>Work Experience</SectionHeading>
      <View style={styles.sectionBody}>
        {experience.map((item, index) => (
          <View key={`${item.company}-${item.role}-${index}`} style={styles.entry}>
            <View style={styles.entryRow}>
              <View style={styles.entryLeft}>
                <Text style={styles.entryRole}>{item.role}</Text>
              </View>
              <View style={styles.entryRight}>
                {item.duration ? <Text style={styles.entryDate}>{item.duration}</Text> : <Text style={styles.entryDate}> </Text>}
              </View>
            </View>
            <View style={styles.entryRow}>
              <View style={styles.entryLeft}>
                <Text style={styles.entryCompany}>{item.company}</Text>
              </View>
              <View style={styles.entryRight}>
                {item.location ? <Text style={styles.entryLocation}>{item.location}</Text> : <Text style={styles.entryLocation}> </Text>}
              </View>
            </View>
            <View style={styles.entryBody}>
              {item.bullets.map((bullet, bulletIndex) => (
                <Bullet key={`${item.company}-${index}-${bulletIndex}`}>{bullet}</Bullet>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}



