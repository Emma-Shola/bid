import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ResumeExportModel } from "../exporter";
import { preventOrphanAmpersand } from "../shared";
import { Bullet } from "./Bullet";
import { SectionHeading } from "./SectionHeading";
import { resumePdfStyles as s } from "./styles";

export function ExperienceSection({ experience }: Pick<ResumeExportModel, "experience">) {
  if (experience.length === 0) return null;

  return (
    <View style={s.section}>
      <SectionHeading>Experience</SectionHeading>
      {experience.map((item, i) => {
        const companyLine = [item.company, item.location].filter(Boolean).join(" – ");
        return (
          <View key={`${item.company}-${i}`} style={s.entry}>
            <View wrap={false}>
              <View style={s.roleDateRow}>
                <View style={s.roleCol}>
                  <Text style={s.roleText}>{preventOrphanAmpersand(item.role)}</Text>
                </View>
                <View style={s.dateCol}>
                  <Text style={s.dateText}>{item.duration || " "}</Text>
                </View>
              </View>
              {companyLine ? (
                <Text style={s.companyLine}>{preventOrphanAmpersand(companyLine)}</Text>
              ) : null}
            </View>
            {item.bullets.length > 0 ? (
              <View style={s.bulletsWrap}>
                {item.bullets.map((b, j) => (
                  <Bullet key={j}>{b}</Bullet>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
