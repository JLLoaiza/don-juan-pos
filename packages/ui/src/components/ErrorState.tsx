import { Button } from "./Button.js";

export type ErrorStateVariant = "network" | "unauthenticated" | "forbidden" | "not-found" | "server";

const DEFAULTS: Record<ErrorStateVariant, { title: string; description: string }> = {
  network: {
    title: "Sin conexión con el servidor",
    description: "No fue posible contactar la API. Verifica la red o vuelve a intentarlo.",
  },
  unauthenticated: {
    title: "Sesión no iniciada",
    description: "Tu sesión expiró o no es válida. Vuelve a iniciar sesión para continuar.",
  },
  forbidden: {
    title: "Sin permiso para esta acción",
    description: "Tu usuario no tiene el permiso necesario para ver este contenido.",
  },
  "not-found": {
    title: "No encontrado",
    description: "El recurso solicitado no existe o ya no está disponible.",
  },
  server: {
    title: "Ocurrió un error",
    description: "El servidor respondió con un error inesperado. Intenta de nuevo en unos momentos.",
  },
};

export interface ErrorStateProps {
  readonly variant?: ErrorStateVariant;
  readonly title?: string;
  readonly description?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
}

export function ErrorState({ variant = "server", title, description, onRetry, retryLabel = "Reintentar" }: ErrorStateProps) {
  const fallback = DEFAULTS[variant];
  return (
    <div className="dj-state" role="alert">
      <p className="dj-state__title">{title ?? fallback.title}</p>
      <p className="dj-state__description">{description ?? fallback.description}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
