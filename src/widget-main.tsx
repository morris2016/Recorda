import React from "react";
import ReactDOM from "react-dom/client";
import { RecordingWidget } from "./components/RecordingWidget";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RecordingWidget />
  </React.StrictMode>,
);
