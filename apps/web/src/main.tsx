import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyStoredTheme } from "./lib/theme";
import "./index.css";

/* Before the first render, and that is the whole reason it is here rather than
   in an effect inside the shell. The dark palette hangs off `data-theme` on the
   document, so a browser that chose dark would otherwise paint the light page
   first and swap it a frame later: a white flash on a screen somebody set to
   dark on purpose. The app opens light when nothing was chosen. */
applyStoredTheme();

const container = document.getElementById("root");

if (!container) {
  throw new Error("Mount point #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
