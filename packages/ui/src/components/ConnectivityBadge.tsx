export type ConnectivityState = "ONLINE" | "LOCAL_ONLY" | "DEVICE_ONLY" | "CHECKING";

const LABELS: Record<ConnectivityState, string> = {
  ONLINE: "En línea",
  LOCAL_ONLY: "Solo servidor local",
  DEVICE_ONLY: "Sin conexión al servidor",
  CHECKING: "Comprobando…",
};

const TONES: Record<ConnectivityState, "success" | "warning" | "danger" | "neutral"> = {
  ONLINE: "success",
  LOCAL_ONLY: "warning",
  DEVICE_ONLY: "danger",
  CHECKING: "neutral",
};

export interface ConnectivityBadgeProps {
  readonly state: ConnectivityState;
}

export function ConnectivityBadge({ state }: ConnectivityBadgeProps) {
  const tone = TONES[state];
  return (
    <span className={`dj-pill dj-pill--${tone}`} role="status">
      <span className="dj-pill__dot" aria-hidden="true" />
      {LABELS[state]}
    </span>
  );
}
