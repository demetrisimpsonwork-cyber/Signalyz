const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-xl font-semibold text-foreground">{title}</h2>
    <div className="text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </section>
);

const Privacy = () => (
  <main className="container max-w-2xl py-16 space-y-10">
    <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
    <p className="text-sm text-muted-foreground">Last updated: March 2026</p>

    <Section title="1. Information Collected">
      <ul className="list-disc pl-5 space-y-1">
        <li>Email address and account credentials</li>
        <li>Resume and job description content uploaded for analysis</li>
        <li>Usage data such as feature interactions and session information</li>
      </ul>
    </Section>

    <Section title="2. How Information Is Used">
      <p>Your data is used solely to provide resume analysis, optimization, and role-alignment services. We may also use aggregated, anonymized data to improve platform performance and features.</p>
    </Section>

    <Section title="3. Payment Processing">
      <p>All payments are securely handled by <strong>Stripe</strong>. Resumix does not store, process, or have access to your credit card information.</p>
    </Section>

    <Section title="4. Data Protection">
      <p>We implement reasonable security measures — including encryption in transit and at rest — to protect your personal data from unauthorized access, alteration, or disclosure.</p>
    </Section>

    <Section title="5. Data Sharing">
      <p>We do not sell or share your personal data with third parties, except with necessary service providers (such as Stripe for payment processing) required to operate the platform.</p>
    </Section>

    <Section title="6. Contact">
      <p>
        For privacy-related inquiries, contact us at{" "}
        <a href="mailto:Demetri.Simpson.work@gmail.com" className="text-primary hover:underline">Demetri.Simpson.work@gmail.com</a>.
      </p>
    </Section>
  </main>
);

export default Privacy;
