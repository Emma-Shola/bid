import React from "react";
import { Text, View } from "@react-pdf/renderer";
import { resumePdfStyles as styles } from "./styles";

type SectionHeadingProps = {
  children: string;
};

export function SectionHeading({ children }: SectionHeadingProps) {
  return (
    <View style={styles.sectionHeadingWrap} wrap={false}>
      <Text style={styles.sectionHeading}>{children}</Text>
      <View style={styles.sectionHeadingRule} />
    </View>
  );
}



