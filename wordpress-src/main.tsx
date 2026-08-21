import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthGate } from "../app/auth-gate";
import { KeeperApp } from "../app/keeper-app";
import "../app/globals.css";
import "./wordpress.css";

const root = document.getElementById("keeperlab-root");

if (!root) throw new Error("KeeperLab root element not found");

createRoot(root).render(
  <StrictMode>
    <AuthGate>
      <KeeperApp />
    </AuthGate>
  </StrictMode>,
);
