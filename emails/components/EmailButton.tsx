import { Button } from "@react-email/components";
import type { ReactNode } from "react";
import { colors } from "./tokens";

interface EmailButtonProps {
  href: string;
  children: ReactNode;
}

export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: colors.signalGreen,
        color: "#FFFFFF",
        padding: "14px 28px",
        borderRadius: "8px",
        fontSize: "16px",
        fontWeight: 500,
        textDecoration: "none",
        display: "inline-block",
      }}
    >
      {children}
    </Button>
  );
}
