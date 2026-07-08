import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { clearSessionState, dispatchGoToAlignment } from "@/lib/clearSession";
import { LogOut, Menu, X, User } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import UpgradeModal from "@/components/UpgradeModal";

const Navbar = () => {
  const { user, loading } = useAuth();
  const {
    isPro,
    hasOneTimeCredit,
    hasConsumedOneTimeCredit,
    loading: subLoading,
  } = useSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handleAlignClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setMobileOpen(false);
    if (location.pathname === "/") {
      dispatchGoToAlignment();
    } else {
      navigate("/?tab=alignment");
    }
  };

  const handleSignOut = async () => {
    clearSessionState();
    await supabase.auth.signOut();
    navigate("/?tab=alignment", { replace: true });
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "U";

  const showProBadge = !subLoading && !isPro && !hasOneTimeCredit;

  return (
    <>
      <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight text-foreground">
            Signal<span className="text-primary">yz</span>
          </Link>

          {/* Desktop */}
          <div className="hidden items-center gap-6 md:flex">
            <Link to="/?tab=alignment" onClick={handleAlignClick} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Analyze</Link>
            <Link to="/position" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Report</Link>
            {user && (
              <Link to="/dashboard" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Dashboard</Link>
            )}
            <Link to="/history" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">History</Link>
            <Link to="/pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Pricing</Link>
            {loading ? null : user ? (
              <div className="flex items-center gap-3">
                {showProBadge && (
                  <button
                    onClick={() => setShowUpgrade(true)}
                    className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[#f59e0b]/15 text-[#f59e0b]"
                  >
                    Upgrade
                  </button>
                )}
                {isPro && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-primary/15 text-primary">
                    Paid
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
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
                  <User className="mr-2 h-4 w-4" />Sign in
                </Button>
                <Button size="sm" onClick={() => navigate("/auth")}>Get Started</Button>
              </div>
            )}
          </div>

          {/* Mobile toggle */}
          <div className="flex items-center gap-2 md:hidden">
            {showProBadge && (
              <button
                onClick={() => setShowUpgrade(true)}
                className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[#f59e0b]/15 text-[#f59e0b]"
              >
                Upgrade
              </button>
            )}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="flex h-10 w-10 items-center justify-center -mr-2"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="border-t bg-card px-4 pb-4 pt-2 md:hidden">
            <div className="flex flex-col gap-3">
              <Link to="/?tab=alignment" onClick={handleAlignClick} className="text-sm font-medium text-muted-foreground">Analyze</Link>
              <Link to="/position" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-muted-foreground">Report</Link>
              {!loading && user && (
                <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-muted-foreground">Dashboard</Link>
              )}
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
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-primary/15 text-primary">
                      Paid
                    </span>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { handleSignOut(); setMobileOpen(false); }}>Sign out</Button>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        isAuthenticated={!!user}
        hasConsumedOneTimeCredit={hasConsumedOneTimeCredit}
        hasOneTimeCredit={hasOneTimeCredit}
      />
    </>
  );
};

export default Navbar;
