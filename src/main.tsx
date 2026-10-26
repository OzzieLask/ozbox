import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./global.css";

// The browser's right-click menu (Reload, Inspect…) is handy in dev, wrong in the app.
if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
