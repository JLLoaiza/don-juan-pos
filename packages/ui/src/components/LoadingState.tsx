export interface LoadingStateProps {
  readonly label?: string;
}

export function LoadingState({ label = "Cargando…" }: LoadingStateProps) {
  return (
    <div className="dj-state" role="status" aria-live="polite">
      <div className="dj-spinner" aria-hidden="true" />
      <p className="dj-state__description">{label}</p>
    </div>
  );
}
