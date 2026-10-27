import React from "react";
import ReactDOM from "react-dom/client";
import { PinBar } from "./PinBar";
import "../global.css";
import "./pinbar.css";

if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}

const id = Number(new URLSearchParams(location.search).get("id"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PinBar id={id} />
  </React.StrictMode>,
);
