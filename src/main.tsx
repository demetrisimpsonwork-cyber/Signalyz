import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Suppress unhandled errors from surfacing developer overlays
window.addEventListener("error", (e) => {
  e.preventDefault();
  console.error("Runtime error:", e.error?.name || "Unknown");
});

window.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  console.error("Unhandled promise rejection:", e.reason?.name || "Unknown");
});

createRoot(document.getElementById("root")!).render(<App />);
