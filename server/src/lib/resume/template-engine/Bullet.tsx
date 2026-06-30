import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { resumePdfStyles as s } from "./styles";

/**
 * Bullet with a proper hanging indent.
 *
 * paddingLeft on the row sets the indent depth.
 * marginLeft: -indent on the mark pulls the bullet symbol back into the indent
 * zone so it hangs to the left of the text column.
 * Wrapped lines align flush at the indent position.
 */
export function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletMark}>{"•"}</Text>
      <Text style={s.bulletText} widows={2} orphans={2}>
        {children}
      </Text>
    </View>
  );
}
