import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerBuiltinComponents } from "@mpp/components";
import { App } from "./App";
import "./styles.css";

registerBuiltinComponents();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
