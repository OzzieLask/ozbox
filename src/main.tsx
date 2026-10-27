import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initWidgetStorage } from "./widgets/store";
import "./global.css";

// The browser's right-click menu (Reload, Inspect…) is handy in dev, wrong in the app.
if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}

// Nothing outside a drop zone accepts drops: without this, dropping a file anywhere
// would navigate the whole window to it.
for (const type of ["dragover", "drop"] as const) {
  document.addEventListener(type, (e) => {
    if (!e.defaultPrevented) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    }
  });
}

// Load saved widget state first, so nothing renders (or gets typed into) before it.
initWidgetStorage().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
