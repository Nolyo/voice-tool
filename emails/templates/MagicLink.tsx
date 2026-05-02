import { Section } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailHeader } from "../components/EmailHeader";
import { EmailFooter } from "../components/EmailFooter";
import { EmailHeading } from "../components/EmailHeading";
import { EmailText } from "../components/EmailText";
import { EmailButton } from "../components/EmailButton";
import { EmailSecurityNote } from "../components/EmailSecurityNote";

export const subject = "Sign in to Lexena";

export default function MagicLink() {
  return (
    <EmailLayout preview="Sign in to your Lexena account">
      <EmailHeader />
      <Section style={{ padding: "40px" }}>
        <EmailHeading>Sign in to Lexena</EmailHeading>
        <EmailText>Click the button below to sign in to your account.</EmailText>
        <Section style={{ textAlign: "center", margin: "32px 0" }}>
          <EmailButton href="{{ .ConfirmationURL }}">Sign in</EmailButton>
        </Section>
        <EmailText variant="muted">
          This link is valid for 1 hour and can only be used once.
        </EmailText>
        <EmailSecurityNote>
          Didn't request this sign-in? You can safely ignore this message — your account remains secure.
        </EmailSecurityNote>
        <EmailText variant="muted">— The Lexena team</EmailText>
        <EmailFooter contextLine="You received this email because of a sign-in request on your Lexena account." />
      </Section>
    </EmailLayout>
  );
}
