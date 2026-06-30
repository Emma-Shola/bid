import React from "react";
import { Text, View } from "@react-pdf/renderer";
import { resumePdfStyles as s } from "./styles";

export function SectionHeading({ children }: { children: string }) {
  return (
    <View style={s.sectionHeadWrap} wrap={false}>
      <Text style={s.sectionHead}>{children}</Text>
      <View style={s.sectionRule} />
    </View>
  );
}
