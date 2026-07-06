const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-xl font-semibold text-foreground">{title}</h2>
    <div className="text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </section>
);

const RefundPolicy = () => (
  <main className="container max-w-2xl py-16 space-y-10">
    <h1 className="text-3xl font-bold tracking-tight text-foreground">Refund &amp; Cancellation Policy</h1>
    <p className="text-sm text-muted-foreground">Last updated: March 2026</p>

    <Section title="Overview">
      <p>Signalyz is a digital SaaS product. Access to premium features is delivered instantly upon subscription activation. By subscribing, you acknowledge the immediate delivery of digital services.</p>
    </Section>

    <Section title="Subscription Billing">
      <p>Active Job Search is billed at <strong>$19 per month</strong>. Your subscription grants full access to unlimited analyses, calibrated resume exports, full Hiring Reports, and saved history. Final Apply Check is billed at <strong>$9 one-time</strong> per resume + job description unlock.</p>
    </Section>

    <Section title="Cancellation">
      <p>You may cancel your subscription at any time. Upon cancellation, you will retain access to Active Job Search features until the end of your current billing period. No further charges will be made after cancellation.</p>
    </Section>

    <Section title="Refund Policy">
      <p>Due to the digital and instant-access nature of Signalyz, refunds are generally not issued once access has been granted. If you believe there are exceptional circumstances, please contact our support team and we will review your case.</p>
    </Section>

    <Section title="Billing Questions">
      <p>
        For any billing-related questions, contact us at{" "}
        <a href="mailto:Demetri.Simpson.work@gmail.com" className="text-primary hover:underline">Demetri.Simpson.work@gmail.com</a>.
      </p>
    </Section>
  </main>
);

export default RefundPolicy;
