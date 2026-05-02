import { Section } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailHeader } from "../components/EmailHeader";
import { EmailFooter } from "../components/EmailFooter";
import { EmailHeading } from "../components/EmailHeading";
import { EmailText } from "../components/EmailText";
import { EmailButton } from "../components/EmailButton";
import { EmailSecurityNote } from "../components/EmailSecurityNote";

export const subject = "Reset your Lexena password";

export default function PasswordReset() {
  return (
    <EmailLayout preview="Reset your Lexena password">
      <EmailHeader />
      <Section style={{ padding: "40px" }}>
        <EmailHeading>Reset your password</EmailHeading>
        <EmailText>Click the button below to choose a new password.</EmailText>
        <Section style={{ textAlign: "center", margin: "32px 0" }}>
          <EmailButton href="{{ .ConfirmationURL }}">Reset password</EmailButton>
        </Section>
        <EmailText variant="muted">
          This link is valid for 1 hour and can only be used once.
        </EmailText>
        <EmailSecurityNote>
          If you didn't request this, ignore this message — your current password remains valid. On the next successful login after reset, all your active sessions on other devices will be revoked.
        </EmailSecurityNote>
        <EmailText variant="muted">— The Lexena team</EmailText>
        <EmailFooter contextLine="You received this email because of a password reset request on your Lexena account." />
      </Section>
    </EmailLayout>
  );
}
