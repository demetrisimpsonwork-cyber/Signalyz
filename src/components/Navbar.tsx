import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";

const Navbar = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-tight text-foreground">
          Resum<span className="text-primary">ix</span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-6 md:flex">
          <Link to="/" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Optimize
          </Link>
          <Link to="/pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Pricing
          </Link>
          {user && (
            <Link to="/dashboard" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Dashboard
            </Link>
          )}
          {loading ? null : user ? (
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          ) : (
            <Button size="sm" onClick={() => navigate("/auth")}>
              Sign in
            </Button>
          )}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t bg-card px-4 pb-4 pt-2 md:hidden">
          <div className="flex flex-col gap-3">
            <Link to="/" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-muted-foreground">Optimize</Link>
            <Link to="/pricing" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-muted-foreground">Pricing</Link>
            {user && <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-muted-foreground">Dashboard</Link>}
            {!loading && (user ? (
              <Button variant="ghost" size="sm" onClick={() => { handleSignOut(); setMobileOpen(false); }}>Sign out</Button>
            ) : (
              <Button size="sm" onClick={() => { navigate("/auth"); setMobileOpen(false); }}>Sign in</Button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
