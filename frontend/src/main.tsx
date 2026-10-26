import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/AppShell";
import { InvestigationsListPage } from "./pages/InvestigationsListPage";
import { InvestigationDetailPage } from "./pages/InvestigationDetailPage";
import { SimulationPage } from "./pages/SimulationPage";
import { AdoptionPage } from "./pages/AdoptionPage";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/investigations" replace />} />
            <Route path="investigations" element={<InvestigationsListPage />} />
            <Route path="investigations/:id" element={<InvestigationDetailPage />} />
            <Route path="simulation" element={<SimulationPage />} />
            <Route path="adoption" element={<AdoptionPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
