import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="border-t bg-card/60">
    <div className="container flex flex-col items-center gap-6 py-10 text-center">
      {/* Brand */}
      <div className="space-y-2">
        <p className="text-base font-semibold tracking-tight text-foreground">
          Signal<span className="text-primary">yz</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Signal calibration for job seekers who already qualify — and need hiring systems to read them that way.
        </p>
      </div>

      {/* Trust Statement */}
      <div className="max-w-md space-y-1">
        <p className="text-xs text-muted-foreground/80">
          Zero fabrication. Resumix only works with the experience you provide.
        </p>
        <p className="text-xs text-muted-foreground/80">
          Your data is never used to train AI models.
        </p>
      </div>

      {/* Navigation Links */}
      <nav className="flex flex-wrap justify-center gap-5 text-xs text-muted-foreground">
        <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
        <Link to="/refund-policy" className="hover:text-foreground transition-colors">Refund Policy</Link>
        <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
        <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
      </nav>

      {/* Support Contact */}
      <p className="text-[11px] text-muted-foreground/70">
        Support: Demetri.Simpson.work@gmail.com
      </p>

      {/* Copyright */}
      <p className="text-[11px] text-muted-foreground/60">© 2026 Resumix</p>
    </div>
  </footer>
);

export default Footer;
