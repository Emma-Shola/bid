import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ResumeExportModel } from "../exporter";
import { Bullet } from "./Bullet";
import { SectionHeading } from "./SectionHeading";
import { resumePdfStyles as s } from "./styles";

export function EducationSection({ education }: Pick<ResumeExportModel, "education">) {
  if (education.length === 0) return null;

  return (
    <View style={s.section}>
      <SectionHeading>Education</SectionHeading>
      {education.map((item, i) => {
        const schoolLine = [item.school, item.duration].filter(Boolean).join(" · ");
        return (
          <View key={`${item.school}-${i}`} style={s.eduEntry} wrap={false}>
            <Text style={s.eduDegree}>{item.degree}</Text>
            {schoolLine ? (
              <Text style={s.eduSchoolLine}>{schoolLine}</Text>
            ) : null}
            {item.details.length > 0 ? (
              <View style={s.eduDetailsWrap}>
                {item.details.map((d, j) => (
                  <Bullet key={j}>{d}</Bullet>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
