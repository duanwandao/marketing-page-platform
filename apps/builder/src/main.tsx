import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerBuiltinComponents } from "@mpp/components";
import { App } from "./App";
import "./styles/global.css";

registerBuiltinComponents();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
