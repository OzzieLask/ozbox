import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initWidgetStorage } from "./widgets/store";
import "./global.css";

// The browser's right-click menu (Reload, Inspect…) is handy in dev, wrong in the app.
if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}

// Load saved widget state first, so nothing renders (or gets typed into) before it.
initWidgetStorage().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
