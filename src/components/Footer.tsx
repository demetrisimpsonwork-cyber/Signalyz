import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="border-t bg-card/60">
    <div className="container flex flex-col items-center gap-4 py-8 text-center md:flex-row md:justify-between md:text-left">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">
          Resum<span className="text-primary">ix</span>
        </p>
        <p className="text-xs text-muted-foreground">AI-powered resume optimization and role-alignment platform.</p>
      </div>

      <nav className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
        <Link to="/refund-policy" className="hover:text-foreground transition-colors">Refund Policy</Link>
        <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
        <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
      </nav>

      <p className="text-xs text-muted-foreground">© 2026 Resumix</p>
    </div>
  </footer>
);

export default Footer;
