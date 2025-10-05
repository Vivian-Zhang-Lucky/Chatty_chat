import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";
import {initKyberLib} from "./lib/kybercrypto.js";

const root = createRoot(document.getElementById("root"));
(async() => {
    try {
        await initKyberLib();
        console.log("Kyber initialized successfully");

        root.render(
            <StrictMode>
                <BrowserRouter>
                    <App/>
                </BrowserRouter>
            </StrictMode>
        );
    } catch (err) {
        console.error("Failed to initialize Kyber:", err);
    }
})();
