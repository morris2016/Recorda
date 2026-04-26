import React from "react";
import ReactDOM from "react-dom/client";
import { RegionOverlay } from "./components/RegionOverlay";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RegionOverlay />
  </React.StrictMode>,
);
