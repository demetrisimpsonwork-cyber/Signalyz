import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Menu, X, User } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const Navbar = () => {
  const { user, loading } = useAuth();
  const { isPro } = useSubscription();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "U";

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-tight text-foreground">
          Resum<span className="text-primary">ix</span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-6 md:flex">
          <Link to="/" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Align</Link>
          <Link to="/position" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Position</Link>
          <Link to="/history" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">History</Link>
          <Link to="/pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Pricing</Link>
          {user && (
            <Link to="/dashboard" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Dashboard</Link>
          )}
          {loading ? null : user ? (
            <div className="flex items-center gap-3">
              {isPro && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "hsl(38, 92%, 50%, 0.15)", color: "hsl(38, 92%, 50%)" }}>
                  ✦ Pro
                </span>
              )}
              <Avatar className="h-8 w-8 cursor-pointer" onClick={() => navigate("/dashboard")}>
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
              </Avatar>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />Sign out
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => navigate("/auth")}>
              <User className="mr-2 h-4 w-4" />Sign in
            </Button>
          )}
        </div>

        {/* Mobile toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <button onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t bg-card px-4 pb-4 pt-2 md:hidden">
          <div className="flex flex-col gap-3">
            <Link to="/" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-muted-foreground">Align</Link>
            <Link to="/position" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-muted-foreground">Position</Link>
            <Link to="/history" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-muted-foreground">History</Link>
            <Link to="/pricing" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-muted-foreground">Pricing</Link>
            {!loading && !user && (
              <>
                <Button variant="ghost" size="sm" onClick={() => { navigate("/auth"); setMobileOpen(false); }}>Sign in</Button>
                <Button size="sm" className="w-full" onClick={() => { navigate("/auth"); setMobileOpen(false); }}>Get Started</Button>
              </>
            )}
            {!loading && user && (
              <>
                {isPro && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "hsl(38, 92%, 50%, 0.15)", color: "hsl(38, 92%, 50%)" }}>
                    ✦ Pro
                  </span>
                )}
                <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-muted-foreground">Dashboard</Link>
                <Button variant="ghost" size="sm" onClick={() => { handleSignOut(); setMobileOpen(false); }}>Sign out</Button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
