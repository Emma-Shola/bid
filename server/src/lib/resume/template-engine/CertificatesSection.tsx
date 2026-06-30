import React from "react";
import { View } from "@react-pdf/renderer";
import type { ResumeExportModel } from "../exporter";
import { Bullet } from "./Bullet";
import { SectionHeading } from "./SectionHeading";
import { resumePdfStyles as s } from "./styles";

export function CertificatesSection({ certificates }: Pick<ResumeExportModel, "certificates">) {
  const certs = certificates.filter((c) => c.trim());
  if (certs.length === 0) return null;

  return (
    <View style={s.section}>
      <SectionHeading>Certifications</SectionHeading>
      {certs.map((cert, i) => (
        <Bullet key={i}>{cert}</Bullet>
      ))}
    </View>
  );
}
