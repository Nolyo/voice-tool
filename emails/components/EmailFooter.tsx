import { Hr, Section, Text } from "@react-email/components";
import { colors } from "./tokens";

interface EmailFooterProps {
  contextLine: string;
}

export function EmailFooter({ contextLine }: EmailFooterProps) {
  return (
    <Section style={{ padding: "0 40px 32px 40px" }}>
      <Hr style={{ borderColor: colors.border, margin: "32px 0 24px 0" }} />
      <Text
        style={{
          color: colors.textMuted,
          fontSize: "12px",
          lineHeight: "18px",
          margin: 0,
        }}
      >
        Lexena · lexena.app
      </Text>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: "12px",
          lineHeight: "18px",
          margin: "8px 0 0 0",
        }}
      >
        {contextLine}
      </Text>
    </Section>
  );
}
