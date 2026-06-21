import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { resumePdfStyles as styles } from "./styles";

type BulletProps = {
  children: ReactNode;
};

export function Bullet({ children }: BulletProps) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletMark}>{"\u2022"}</Text>
      <Text style={styles.bulletText} widows={2} orphans={2}>
        {children}
      </Text>
    </View>
  );
}



