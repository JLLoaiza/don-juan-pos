import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@don-juan/ui";
import type { CashSession } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { useAuth } from "../auth/useAuth";
import { useCashRegisters } from "./useCashRegisters";
import { CashRegisterCard } from "./CashRegisterCard";
import "./CashPage.css";

function errorVariant(error: unknown): "network" | "forbidden" | "server" {
  if (error instanceof ApiRequestError) {
    if (error.kind === "network") return "network";
    if (error.status === 403) return "forbidden";
  }
  return "server";
}

export function CashPage() {
  const auth = useAuth();
  const { status, cashRegisters, error, api, reload } = useCashRegisters();
  const permissions = auth.context?.permissions ?? [];
  // Held here, not inside CashRegisterCard: reload() flips `status` above to
  // "loading", which unmounts every card while the list refetches — state
  // kept locally in a card would vanish before the user ever saw it.
  const [lastClosedByRegister, setLastClosedByRegister] = useState<Record<string, CashSession>>({});

  if (status === "loading") {
    return <LoadingState label="Cargando caja…" />;
  }

  if (status === "error" || !cashRegisters) {
    const variant = errorVariant(error);
    return (
      <ErrorState
        variant={variant}
        {...(variant === "forbidden" ? { description: "Tu usuario no tiene el permiso de vista de caja (cash.view)." } : {})}
        onRetry={reload}
      />
    );
  }

  return (
    <section className="dj-cash" aria-labelledby="cash-title">
      <h1 id="cash-title">Caja</h1>

      {cashRegisters.length === 0 ? (
        <EmptyState title="Sin cajas" description="Esta sucursal todavía no tiene cajas registradoras configuradas." />
      ) : (
        <div className="dj-cash__grid">
          {cashRegisters.map((register) => (
            <CashRegisterCard
              key={register.id}
              register={register}
              permissions={permissions}
              api={api}
              onChanged={reload}
              lastClosed={lastClosedByRegister[register.id] ?? null}
              onClosed={(result) => setLastClosedByRegister((prev) => ({ ...prev, [register.id]: result }))}
              onOpened={() =>
                setLastClosedByRegister((prev) => {
                  if (!(register.id in prev)) return prev;
                  const { [register.id]: _removed, ...rest } = prev;
                  return rest;
                })
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
