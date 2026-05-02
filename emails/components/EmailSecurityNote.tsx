import { Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { colors } from "./tokens";

interface EmailSecurityNoteProps {
  children: ReactNode;
}

export function EmailSecurityNote({ children }: EmailSecurityNoteProps) {
  return (
    <Section
      style={{
        backgroundColor: colors.noteBg,
        borderLeft: `3px solid ${colors.signalGreen}`,
        borderRadius: "6px",
        padding: "16px",
        margin: "24px 0",
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: "14px",
          lineHeight: "22px",
          fontStyle: "italic",
          margin: 0,
        }}
      >
        {children}
      </Text>
    </Section>
  );
}
