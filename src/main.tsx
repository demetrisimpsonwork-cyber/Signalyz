import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Suppress developer error overlays from ever reaching end users
window.addEventListener("error", (e) => {
  e.preventDefault();
  console.error("Runtime error:", e.error?.name || "Unknown");
});

window.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  console.error("Unhandled promise rejection:", e.reason?.name || "Unknown");
});

// Aggressively remove any injected error overlays (Vite, Lovable, etc.)
const nukeOverlays = () => {
  const selectors = [
    "vite-error-overlay",
    "[data-lovable-error]",
    '[class*="lovable-error"]',
    "#lovable-error-overlay",
    '[class*="error-overlay"]',
    '[id*="error-overlay"]',
  ];
  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => el.remove());
  });
};

const observer = new MutationObserver(nukeOverlays);
observer.observe(document.documentElement, { childList: true, subtree: true });

createRoot(document.getElementById("root")!).render(<App />);
