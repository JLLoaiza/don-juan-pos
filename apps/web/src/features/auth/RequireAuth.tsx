import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingState } from "@don-juan/ui";
import { useAuth } from "./useAuth";

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "bootstrapping") {
    return <LoadingState label="Cargando sesión…" />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
