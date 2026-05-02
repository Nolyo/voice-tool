import { Img, Section } from "@react-email/components";
import { colors, logoUrl } from "./tokens";

export function EmailHeader() {
  return (
    <Section
      style={{
        backgroundColor: colors.navy,
        padding: "32px 0",
        textAlign: "center",
      }}
    >
      <Img
        src={logoUrl}
        alt="Lexena"
        width="56"
        height="56"
        style={{
          margin: "0 auto",
          display: "block",
          borderRadius: "8px",
        }}
      />
    </Section>
  );
}
