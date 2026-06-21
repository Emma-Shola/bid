import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ResumeExportModel } from "../exporter";
import { Bullet } from "./Bullet";
import { SectionHeading } from "./SectionHeading";
import { resumePdfStyles as styles } from "./styles";

type EducationSectionProps = Pick<ResumeExportModel, "education">;

export function EducationSection({ education }: EducationSectionProps) {
  if (education.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <SectionHeading>Education</SectionHeading>
      <View style={styles.sectionBody}>
        {education.map((item, index) => (
          <View key={`${item.school}-${index}`} style={styles.entry}>
            <View style={styles.entryRow}>
              <View style={styles.entryLeft}>
                <Text style={styles.entryRole}>{item.degree}</Text>
              </View>
              <View style={styles.entryRight}>
                {item.duration ? <Text style={styles.entryDate}>{item.duration}</Text> : <Text style={styles.entryDate}> </Text>}
              </View>
            </View>
            <View style={styles.entryRow}>
              <View style={styles.entryLeft}>
                <Text style={styles.entryCompany}>{item.school}</Text>
              </View>
              <View style={styles.entryRight}>
                {item.location ? <Text style={styles.entryLocation}>{item.location}</Text> : <Text style={styles.entryLocation}> </Text>}
              </View>
            </View>
            <View style={styles.educationDetails}>
              {item.details.map((detail, detailIndex) => (
                <Bullet key={`${item.school}-${index}-${detailIndex}`}>{detail}</Bullet>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}



