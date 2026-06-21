import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ResumeExportModel } from "../exporter";
import { resumePdfStyles as styles } from "./styles";

type HeaderProps = {
  model: ResumeExportModel;
};

export function Header({ model }: HeaderProps) {
  return (
    <View style={styles.header} wrap={false}>
      <Text style={styles.headerName}>{model.name || "Resume"}</Text>
      {model.title ? <Text style={styles.headerTitle}>{model.title}</Text> : null}
      {model.contactLine ? <Text style={styles.headerContact}>{model.contactLine}</Text> : null}
      {model.linksLine ? <Text style={styles.headerLinks}>{model.linksLine}</Text> : null}
    </View>
  );
}



