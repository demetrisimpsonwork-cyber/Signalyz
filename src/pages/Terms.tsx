const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-xl font-semibold text-foreground">{title}</h2>
    <div className="text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </section>
);

const Terms = () => (
  <main className="container max-w-2xl py-16 space-y-10">
    <h1 className="text-3xl font-bold tracking-tight text-foreground">Terms of Service</h1>
    <p className="text-sm text-muted-foreground">Last updated: March 2026</p>

    <Section title="1. Acceptance of Terms">
      <p>By creating an account or using Signalyz, you agree to be bound by these Terms of Service. If you do not agree, please do not use the platform.</p>
    </Section>

    <Section title="2. Description of Service">
      <p>Signalyz provides AI-powered resume analysis, optimization, and role-alignment tools. The platform analyzes resumes and job descriptions to help users improve their job applications and better match target roles.</p>
    </Section>

    <Section title="3. User Responsibilities">
      <p>You agree to provide accurate information when using the platform. You may not misuse Signalyz, attempt to reverse-engineer its systems, or use it for any unlawful purpose.</p>
    </Section>

    <Section title="4. Subscription & Billing">
      <p>Full Signal Intelligence costs <strong>$19 per month</strong> and provides full access to premium features including calibrated resumes, signal analysis, and LinkedIn optimization. All payments are securely processed by Stripe.</p>
    </Section>

    <Section title="5. Cancellation">
      <p>Subscriptions may be canceled at any time. Upon cancellation, access continues through the end of the current billing period.</p>
    </Section>

    <Section title="6. No Guarantee of Employment">
      <p>Signalyz provides guidance and optimization tools only. The platform does not guarantee job placement, interviews, or hiring outcomes. Employment decisions are made solely by employers.</p>
    </Section>

    <Section title="7. Limitation of Liability">
      <p>Signalyz is not liable for employment results, decisions made by employers, or any indirect damages arising from the use of the platform. The service is provided "as is" without warranties of any kind.</p>
    </Section>

    <Section title="8. Contact">
      <p>
        Questions about these terms? Contact us at{" "}
        <a href="mailto:Demetri.Simpson.work@gmail.com" className="text-primary hover:underline">Demetri.Simpson.work@gmail.com</a>.
      </p>
    </Section>
  </main>
);

export default Terms;
