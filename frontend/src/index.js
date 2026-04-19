import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
// Note: React.StrictMode removed to prevent react-leaflet v4 double-init errors
root.render(<App />);
