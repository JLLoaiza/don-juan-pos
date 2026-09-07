import { Link } from "react-router-dom";
import { ErrorState } from "@don-juan/ui";

export function NotFoundPage() {
  return (
    <div>
      <ErrorState variant="not-found" description="La ruta solicitada no existe." />
      <p>
        <Link to="/">Volver al inicio</Link>
      </p>
    </div>
  );
}
