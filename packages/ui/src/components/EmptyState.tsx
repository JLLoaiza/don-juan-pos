import type { ReactNode } from "react";

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="dj-state">
      <div className="dj-empty-icon" aria-hidden="true" />
      <p className="dj-state__title">{title}</p>
      {description ? <p className="dj-state__description">{description}</p> : null}
      {action}
    </div>
  );
}
