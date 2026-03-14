import { Mail, Clock, CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const Contact = () => (
  <main className="container max-w-2xl py-16 space-y-10">
    <section className="space-y-3">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Contact Signalyz Support</h1>
      <p className="text-muted-foreground leading-relaxed">
        Have a question about your subscription, billing, or a technical issue? We're here to help. Reach out and our team will get back to you as quickly as possible.
      </p>
    </section>

    <Card>
      <CardContent className="flex items-start gap-4 p-6">
        <Mail className="mt-1 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Email Support</h2>
          <a href="mailto:Demetri.Simpson.work@gmail.com" className="text-primary hover:underline break-all">
            Demetri.Simpson.work@gmail.com
          </a>
        </div>
      </CardContent>
    </Card>

    <div className="flex items-start gap-3 rounded-lg border bg-accent/40 p-4">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
      <p className="text-sm text-accent-foreground">Support typically responds within <strong>24 hours</strong>.</p>
    </div>

    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">Billing Support</h2>
      </div>
      <p className="text-muted-foreground leading-relaxed">
        All payments are securely processed by <strong>Stripe</strong>. If you have questions about your subscription, charges, or need to update your payment method, contact us at the email above and we'll assist you promptly.
      </p>
    </section>

    <section className="space-y-3 rounded-lg border p-6">
      <h2 className="text-lg font-semibold text-foreground">Frequently Asked</h2>
      <dl className="space-y-4 text-sm">
        <div>
          <dt className="font-medium text-foreground">How do I cancel my subscription?</dt>
          <dd className="mt-1 text-muted-foreground">Email us and we'll process your cancellation immediately. Access continues until the end of your billing period.</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">I'm having trouble logging in.</dt>
          <dd className="mt-1 text-muted-foreground">Try resetting your password from the sign-in page. If the issue persists, reach out to support.</dd>
        </div>
      </dl>
    </section>
  </main>
);

export default Contact;
