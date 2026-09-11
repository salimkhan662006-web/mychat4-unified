import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import { AppearanceProvider } from "./AppearanceContext.jsx";
import ConfirmDelete from "./ConfirmDelete.jsx";

const isConfirmDeletePage = window.location.pathname === "/confirm-delete";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppearanceProvider>
      {isConfirmDeletePage ? (
        <ConfirmDelete />
      ) : (
        <AuthProvider>
          <App />
        </AuthProvider>
      )}
    </AppearanceProvider>
  </StrictMode>
);