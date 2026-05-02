import { Section } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailHeader } from "../components/EmailHeader";
import { EmailFooter } from "../components/EmailFooter";
import { EmailHeading } from "../components/EmailHeading";
import { EmailText } from "../components/EmailText";
import { EmailButton } from "../components/EmailButton";
import { EmailSecurityNote } from "../components/EmailSecurityNote";

export const subject = "Confirm your Lexena email address";

export default function SignupConfirmation() {
  return (
    <EmailLayout preview="Confirm your Lexena email to finalize your account">
      <EmailHeader />
      <Section style={{ padding: "40px" }}>
        <EmailHeading>Welcome to Lexena</EmailHeading>
        <EmailText>
          To finalize your account creation, please confirm your email address.
        </EmailText>
        <Section style={{ textAlign: "center", margin: "32px 0" }}>
          <EmailButton href="{{ .ConfirmationURL }}">Confirm my email</EmailButton>
        </Section>
        <EmailText variant="muted">This link is valid for 24 hours.</EmailText>
        <EmailSecurityNote>
          Didn't create a Lexena account? You can safely ignore this message.
        </EmailSecurityNote>
        <EmailText variant="muted">— The Lexena team</EmailText>
        <EmailFooter contextLine="You received this email because someone signed up to Lexena with this address." />
      </Section>
    </EmailLayout>
  );
}
