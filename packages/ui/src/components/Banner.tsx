export type BannerTone = "info" | "warning" | "danger";

export interface BannerProps {
  readonly tone: BannerTone;
  readonly title: string;
  readonly description?: string;
}

export function Banner({ tone, title, description }: BannerProps) {
  return (
    <div className={`dj-banner dj-banner--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <span className="dj-banner__title">{title}</span>
      {description ? <span className="dj-banner__description">{description}</span> : null}
    </div>
  );
}
