import React from "react";
import { Document, Font, Page, View } from "@react-pdf/renderer";
import type { ResumeExportModel } from "../exporter";
import { Header } from "./Header";
import { DocumentFlow } from "./DocumentFlow";
import { resumePdfStyles as styles } from "./styles";

type ResumePdfDocumentProps = {
  model: ResumeExportModel;
};

Font.registerHyphenationCallback((word) => [word]);

export function ResumePdfDocument({ model }: ResumePdfDocumentProps) {
  return (
    <Document title={`${model.name || "Resume"} Resume`} author={model.name || "Topbrass"} producer="Topbrass">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.document}>
          <Header model={model} />
          <DocumentFlow model={model} />
        </View>
      </Page>
    </Document>
  );
}




