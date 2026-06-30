import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ResumeExportModel } from "../exporter";
import { preventOrphanAmpersand } from "../shared";
import { resumePdfStyles as s } from "./styles";

export function Header({ model }: { model: ResumeExportModel }) {
  const extraLinks = model.linksLine?.trim() || "";

  return (
    <View style={s.header} wrap={false}>
      {/* Row: Name (left) | Title (right) */}
      <View style={s.headerNameRow}>
        <View style={s.headerNameCol}>
          <Text style={s.headerName}>{model.name || "Resume"}</Text>
        </View>
        {model.title ? (
          <View style={s.headerTitleCol}>
            <Text style={s.headerTitle}>{preventOrphanAmpersand(model.title)}</Text>
          </View>
        ) : null}
      </View>

      {/* Full-width rule */}
      <View style={s.headerRule} />

      {/* Contact: email · phone · linkedin · location */}
      {model.contactLine ? (
        <Text style={s.headerContact}>{model.contactLine}</Text>
      ) : null}

      {/* Extra links (github / website) */}
      {extraLinks ? (
        <Text style={s.headerLinks}>{extraLinks}</Text>
      ) : null}
    </View>
  );
}
