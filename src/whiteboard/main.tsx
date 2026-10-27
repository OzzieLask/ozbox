import React from "react";
import ReactDOM from "react-dom/client";
import { Whiteboard } from "./Whiteboard";
import "../global.css";
import "./whiteboard.css";

if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Whiteboard />
  </React.StrictMode>,
);
