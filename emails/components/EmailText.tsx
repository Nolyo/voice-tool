import { Text } from "@react-email/components";
import type { ReactNode } from "react";
import { colors } from "./tokens";

interface EmailTextProps {
  children: ReactNode;
  variant?: "default" | "muted";
}

export function EmailText({ children, variant = "default" }: EmailTextProps) {
  const isMuted = variant === "muted";
  return (
    <Text
      style={{
        color: isMuted ? colors.textMuted : colors.text,
        fontSize: isMuted ? "14px" : "16px",
        lineHeight: isMuted ? "22px" : "26px",
        margin: "0 0 16px 0",
      }}
    >
      {children}
    </Text>
  );
}
