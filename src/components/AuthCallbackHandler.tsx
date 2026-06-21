import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Guards against React StrictMode double-invoke and route re-renders so the
// single-use OAuth code is only exchanged once.
let exchangeStarted = false;

/**
 * Completes the Supabase PKCE OAuth flow after the provider redirects back with
 * a `?code=` (e.g. Google sign-in landing on /auth). Runs app-wide so email
 * confirmation redirects landing on `/` are handled too. Renders nothing.
 */
const AuthCallbackHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorDescription =
      params.get("error_description") || params.get("error");

    const cleanUrl = () =>
      window.history.replaceState({}, "", window.location.pathname);

    if (errorDescription) {
      toast.error(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
      cleanUrl();
      return;
    }

    if (!code || exchangeStarted) return;
    exchangeStarted = true;

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        cleanUrl();
        if (error) {
          exchangeStarted = false;
          toast.error(error.message || "Sign-in failed. Please try again.");
          return;
        }
        navigate("/", { replace: true });
      })
      .catch((err) => {
        exchangeStarted = false;
        cleanUrl();
        toast.error("Sign-in failed. Please try again.");
        console.error(
          "OAuth code exchange failed:",
          err instanceof Error ? err.message : String(err),
        );
      });
  }, [navigate]);

  return null;
};

export default AuthCallbackHandler;
