import { Body, Container, Font, Head, Html, Preview } from "@react-email/components";
import type { ReactNode } from "react";
import { colors, fontStack } from "./tokens";

interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.bg,
          fontFamily: fontStack,
          margin: 0,
          padding: "32px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: colors.card,
            borderRadius: "12px",
            maxWidth: "560px",
            margin: "0 auto",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
          }}
        >
          {children}
        </Container>
      </Body>
    </Html>
  );
}
