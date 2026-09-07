import { useState } from "react";
import { Banner, Button } from "@don-juan/ui";
import type { CashSession } from "@don-juan/contracts";
import { formatMoney } from "../catalog/format";
import { hasPermission } from "../catalog/permissions";
import type { CashApi, CashRegisterContext } from "./cashApi";
import { OpenSessionForm } from "./OpenSessionForm";
import { AdjustmentForm } from "./AdjustmentForm";
import { CloseSessionForm } from "./CloseSessionForm";

export interface CashRegisterCardProps {
  readonly register: CashRegisterContext;
  readonly permissions: ReadonlyArray<string>;
  readonly api: CashApi;
  readonly onChanged: () => void;
  // Held by the parent (CashPage), not here: reloading flips CashPage's own
  // status to "loading", which unmounts this card while the list refetches —
  // any state kept locally here would vanish before the user saw it.
  readonly lastClosed: CashSession | null;
  readonly onClosed: (result: CashSession) => void;
  readonly onOpened: () => void;
}

export function CashRegisterCard({ register, permissions, api, onChanged, lastClosed, onClosed, onOpened }: CashRegisterCardProps) {
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);

  const canOpen = hasPermission(permissions, "cash.open");
  const canAdjust = hasPermission(permissions, "cash.adjust");
  const canClose = hasPermission(permissions, "cash.close");
  const session = register.openSession;

  const handleOpen = (input: Parameters<CashApi["openCashSession"]>[0]) =>
    api.openCashSession(input).then(() => {
      setShowOpenForm(false);
      onOpened();
      onChanged();
    });

  const handleAdjust = (input: Parameters<CashApi["adjustCashSession"]>[1]) => {
    if (!session) return Promise.reject(new Error("No open session"));
    return api.adjustCashSession(session.id, input).then(() => {
      setShowAdjustForm(false);
      onChanged();
    });
  };

  const handleClose = (input: Parameters<CashApi["closeCashSession"]>[1]) => {
    if (!session) return Promise.reject(new Error("No open session"));
    return api.closeCashSession(session.id, input).then((result) => {
      setShowCloseForm(false);
      onClosed(result);
      onChanged();
    });
  };

  return (
    <div className="dj-cash-register">
      <div className="dj-cash-register__header">
        <h2>{register.name}</h2>
        <span className={`dj-pill dj-pill--${session ? "warning" : "neutral"}`}>
          <span className="dj-pill__dot" aria-hidden="true" />
          {session ? "Abierta" : "Cerrada"}
        </span>
      </div>

      {lastClosed ? (
        <Banner
          tone="info"
          title="Caja cerrada"
          description={`Esperado ${formatMoney(lastClosed.expectedCash)} · Contado ${formatMoney(lastClosed.countedCash)} · Diferencia ${formatMoney(lastClosed.difference)}`}
        />
      ) : null}

      {session ? (
        <div className="dj-cash-register__session">
          <p className="dj-catalog-form__hint">
            Abierta el {new Date(session.openedAt).toLocaleString()} · Monto inicial {formatMoney(session.openingAmount)}
          </p>
          <div className="dj-catalog-form__actions">
            {canAdjust && !showAdjustForm ? (
              <Button variant="secondary" onClick={() => setShowAdjustForm(true)}>
                Ajustar efectivo
              </Button>
            ) : null}
            {canClose && !showCloseForm ? (
              <Button variant="secondary" onClick={() => setShowCloseForm(true)}>
                Cerrar caja
              </Button>
            ) : null}
          </div>
          {showAdjustForm ? (
            <AdjustmentForm expectedVersion={session.version} onSubmit={handleAdjust} onCancel={() => setShowAdjustForm(false)} onConflict={onChanged} />
          ) : null}
          {showCloseForm ? (
            <CloseSessionForm expectedVersion={session.version} onSubmit={handleClose} onCancel={() => setShowCloseForm(false)} onConflict={onChanged} />
          ) : null}
        </div>
      ) : (
        <div className="dj-cash-register__session">
          <p className="dj-catalog-form__hint">Sin sesión abierta.</p>
          {canOpen ? (
            showOpenForm ? (
              <OpenSessionForm cashRegisterId={register.id} onSubmit={handleOpen} onCancel={() => setShowOpenForm(false)} />
            ) : (
              <Button variant="secondary" onClick={() => setShowOpenForm(true)}>
                Abrir caja
              </Button>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
