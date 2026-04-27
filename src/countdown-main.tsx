import React from "react";
import ReactDOM from "react-dom/client";
import { CountdownOverlay } from "./components/CountdownOverlay";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CountdownOverlay />
  </React.StrictMode>,
);
