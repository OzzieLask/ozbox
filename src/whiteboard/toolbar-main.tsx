import React from "react";
import ReactDOM from "react-dom/client";
import { Toolbar } from "./Toolbar";
import "../global.css";
import "./toolbar.css";

if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Toolbar />
  </React.StrictMode>,
);
