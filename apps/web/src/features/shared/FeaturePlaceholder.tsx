import { EmptyState } from "@don-juan/ui";

export interface FeaturePlaceholderProps {
  readonly title: string;
  readonly pendingContract: string;
}

export function FeaturePlaceholder({ title, pendingContract }: FeaturePlaceholderProps) {
  return (
    <section aria-labelledby="feature-placeholder-title">
      <h1 id="feature-placeholder-title">{title}</h1>
      <EmptyState
        title="Aún no implementado"
        description={`Esta pantalla queda pendiente de que backend publique el contrato de ${pendingContract} en packages/contracts. No se han inventado endpoints ni datos para esta vista.`}
      />
    </section>
  );
}
