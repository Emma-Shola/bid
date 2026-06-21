import React from "react";
import { View } from "@react-pdf/renderer";
import type { ResumeExportModel } from "../exporter";
import { Bullet } from "./Bullet";
import { SectionHeading } from "./SectionHeading";
import { resumePdfStyles as styles } from "./styles";

type CertificatesSectionProps = Pick<ResumeExportModel, "certificates">;

export function CertificatesSection({ certificates }: CertificatesSectionProps) {
  if (certificates.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <SectionHeading>Certificates</SectionHeading>
      <View style={styles.sectionBody}>
        {certificates.map((certificate, index) => (
          <Bullet key={`${certificate}-${index}`}>{certificate}</Bullet>
        ))}
      </View>
    </View>
  );
}

