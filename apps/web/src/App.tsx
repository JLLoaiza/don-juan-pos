import { Route, Routes } from "react-router-dom";
import { AppShell } from "./app-shell/AppShell";
import { HomePage } from "./features/auth/HomePage";
import { FloorPage } from "./features/floor/FloorPage";
import { CatalogPage } from "./features/catalog/CatalogPage";
import { KitchenPage } from "./features/kitchen/KitchenPage";
import { BillingPage } from "./features/billing/BillingPage";
import { CashPage } from "./features/cash/CashPage";
import { ProcurementPage } from "./features/procurement/ProcurementPage";
import { WorkforcePage } from "./features/workforce/WorkforcePage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { SyncPage } from "./features/sync/SyncPage";
import { NotFoundPage } from "./features/shared/NotFoundPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="floor" element={<FloorPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="kitchen" element={<KitchenPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="cash" element={<CashPage />} />
        <Route path="procurement" element={<ProcurementPage />} />
        <Route path="workforce" element={<WorkforcePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="sync" element={<SyncPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
