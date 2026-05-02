import { Heading } from "@react-email/components";
import type { ReactNode } from "react";
import { colors } from "./tokens";

interface EmailHeadingProps {
  children: ReactNode;
}

export function EmailHeading({ children }: EmailHeadingProps) {
  return (
    <Heading
      as="h1"
      style={{
        color: colors.navy,
        fontSize: "24px",
        fontWeight: 600,
        lineHeight: "32px",
        margin: "0 0 16px 0",
      }}
    >
      {children}
    </Heading>
  );
}
