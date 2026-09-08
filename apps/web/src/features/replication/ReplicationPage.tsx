import { useCallback, useState } from "react";
import { Banner, EmptyState, ErrorState, LoadingState, type ErrorStateVariant } from "@don-juan/ui";
import type { AuthContext } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { useAuth } from "../auth/useAuth";
import { useReplicationStatus } from "./useReplicationStatus";
import { useReplicationEntities, type UseReplicationEntitiesResult } from "./useReplicationEntities";
import type { CloudReplicationStatus, CloudReplicaEntity, EdgeReplicationStatus } from "./replicationApi";
import "./ReplicationPage.css";

function errorVariant(error: unknown): ErrorStateVariant {
  if (error instanceof ApiRequestError) {
    if (error.kind === "network") return "network";
    if (error.status === 401) return "unauthenticated";
    if (error.status === 403) return "forbidden";
  }
  return "server";
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Nunca";
}

function groupByType(entities: readonly CloudReplicaEntity[]): Map<string, CloudReplicaEntity[]> {
  const groups = new Map<string, CloudReplicaEntity[]>();
  for (const entity of entities) {
    const list = groups.get(entity.entityType);
    if (list) list.push(entity);
    else groups.set(entity.entityType, [entity]);
  }
  return groups;
}

export function ReplicationPage() {
  const { status, data, error, reload } = useReplicationStatus();

  if (status === "loading") return <LoadingState label="Cargando estado de réplica…" />;

  if (status === "error" || !data) {
    const variant = errorVariant(error);
    return (
      <ErrorState
        variant={variant}
        {...(variant === "forbidden"
          ? { description: "Tu usuario no tiene el permiso de vista de réplica (replication.status.view)." }
          : {})}
        onRetry={reload}
      />
    );
  }

  return (
    <section className="dj-replication" aria-labelledby="replication-title">
      <h1 id="replication-title">Réplica</h1>
      {data.deploymentMode === "edge" ? (
        <EdgeReplicationView status={data} />
      ) : (
        <CloudReplicationView status={data} onBranchChanged={reload} />
      )}
    </section>
  );
}

function EdgeReplicationView({ status }: { status: EdgeReplicationStatus }) {
  const auth = useAuth();
  const branchName = auth.context?.activeBranch?.name ?? status.branchId;

  return (
    <div className="dj-replication__panel">
      <p className="dj-replication__hint">
        Este servidor opera la sede localmente (arquitectura local-first). La sede queda derivada del servidor: no hay
        selector de sede en este modo.
      </p>
      <dl className="dj-replication__facts">
        <div>
          <dt>Sede</dt>
          <dd>{branchName}</dd>
        </div>
        <div>
          <dt>ID de servidor Edge</dt>
          <dd className="dj-replication__id">{status.edgeServerId}</dd>
        </div>
        <div>
          <dt>Pendientes de réplica</dt>
          <dd>{status.outbox.pending}</dd>
        </div>
        <div>
          <dt>Con error</dt>
          <dd>{status.outbox.failed}</dd>
        </div>
        <div>
          <dt>Replicados</dt>
          <dd>{status.outbox.delivered}</dd>
        </div>
        <div>
          <dt>Última réplica enviada</dt>
          <dd>{formatDateTime(status.outbox.lastDeliveredAt)}</dd>
        </div>
      </dl>
      {status.outbox.failed > 0 ? (
        <Banner
          tone="warning"
          title="Hay operaciones de réplica con error"
          description={status.outbox.lastError ?? "Revisa el worker de réplica de este servidor."}
        />
      ) : null}
    </div>
  );
}

function CloudReplicationView({
  status,
  onBranchChanged,
}: {
  status: CloudReplicationStatus;
  onBranchChanged: () => void;
}) {
  const auth = useAuth();
  const branches = auth.context?.branches ?? [];
  const activeBranch = auth.context?.activeBranch ?? null;
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const entities = useReplicationEntities(true);

  // Shared by the <select> and the consolidated table below: both switch the
  // session's active branch via the same real endpoint (POST /me/active-branch),
  // now allowed as a read-context change on a cloud deployment.
  const selectBranch = useCallback(
    (branchId: string) => {
      if (!branchId || branchId === activeBranch?.id) return;
      setSwitching(true);
      setSwitchError(null);
      auth
        .setActiveBranch(branchId)
        .then(onBranchChanged)
        .catch((cause: unknown) => {
          setSwitchError(
            cause instanceof ApiRequestError && cause.status === 403
              ? "No tienes acceso a esa sede, o tu acceso cambió. Vuelve a intentarlo o contacta a un administrador."
              : "No se pudo cambiar de sede.",
          );
        })
        .finally(() => setSwitching(false));
    },
    [auth, activeBranch, onBranchChanged],
  );

  return (
    <div className="dj-replication__panel">
      <label className="dj-replication__selector">
        <span>Sede</span>
        <select
          value={activeBranch?.id ?? ""}
          onChange={(event) => selectBranch(event.target.value)}
          disabled={switching || branches.length <= 1}
        >
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </label>
      {switchError ? <Banner tone="warning" title="No se pudo cambiar de sede" description={switchError} /> : null}

      <dl className="dj-replication__facts">
        <div>
          <dt>Sede</dt>
          <dd>{activeBranch?.name ?? status.branchId}</dd>
        </div>
        <div>
          <dt>Servidor Edge</dt>
          <dd>{status.edgeServerName ?? "Sin servidor enrolado"}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{status.edgeActive ? "Activo" : "Inactivo"}</dd>
        </div>
        <div>
          <dt>Última sincronización</dt>
          <dd>{formatDateTime(status.lastReceivedAt)}</dd>
        </div>
        <div>
          <dt>Eventos replicados</dt>
          <dd>{status.replicatedEvents}</dd>
        </div>
      </dl>

      {status.stale ? (
        <Banner
          tone="warning"
          title="Datos posiblemente desactualizados"
          description={`Última sincronización: ${formatDateTime(status.lastReceivedAt)}. Esta sede puede estar sin conexión a la nube.`}
        />
      ) : null}
      {!status.edgeServerId ? (
        <Banner
          tone="danger"
          title="Sin servidor Edge enrolado"
          description="Esta sede todavía no tiene un servidor local enrolado; no hay réplica que consultar."
        />
      ) : null}

      <ReplicationEntitiesSection entities={entities} />
      <ConsolidatedDashboard
        branches={branches}
        activeBranch={activeBranch}
        status={status}
        switching={switching}
        onSelectBranch={selectBranch}
      />
    </div>
  );
}

function ReplicationEntitiesSection({ entities }: { entities: UseReplicationEntitiesResult }) {
  const [filter, setFilter] = useState("");

  return (
    <div className="dj-replication__entities">
      <h2>Réplica de la sede</h2>
      {entities.status === "loading" ? <LoadingState label="Cargando réplica de la sede…" /> : null}
      {entities.status === "error" ? (
        <ErrorState variant={errorVariant(entities.error)} onRetry={entities.reload} />
      ) : null}
      {entities.status === "ready" && entities.data ? (
        entities.data.entities.length === 0 ? (
          <EmptyState
            title="Sin datos replicados"
            description="Esta sede todavía no ha enviado ninguna réplica a la nube."
          />
        ) : (
          <>
            <p className="dj-replication__hint">
              Mostrando hasta 500 registros más recientes replicados por esta sede, agrupados por tipo.
            </p>
            <input
              type="search"
              className="dj-replication__filter"
              placeholder="Filtrar por tipo de dato…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filtrar por tipo de dato"
            />
            <EntityGroups entities={entities.data.entities} filter={filter} />
          </>
        )
      ) : null}
    </div>
  );
}

function EntityGroups({ entities, filter }: { entities: readonly CloudReplicaEntity[]; filter: string }) {
  const groups = groupByType(entities);
  const types = [...groups.keys()].sort();
  const needle = filter.trim().toLowerCase();
  const visible = needle ? types.filter((type) => type.toLowerCase().includes(needle)) : types;

  if (visible.length === 0) {
    return <EmptyState title="Sin coincidencias" description="Ningún tipo de dato replicado coincide con el filtro." />;
  }

  return (
    <div className="dj-replication__groups">
      {visible.map((type) => {
        const items = groups.get(type) ?? [];
        return (
          <details key={type} className="dj-replication__group">
            <summary>
              {type} <span className="dj-replication__count">({items.length})</span>
            </summary>
            <ul>
              {items.map((entity) => (
                <li key={entity.entityId}>
                  <details>
                    <summary>
                      <code title={entity.entityId}>{entity.entityId.slice(0, 8)}…</code>
                      {" · v"}
                      {entity.entityVersion ?? "—"}
                      {" · "}
                      {formatDateTime(entity.replicatedAt)}
                    </summary>
                    <pre className="dj-replication__payload">{JSON.stringify(entity.payload, null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

type Branch = AuthContext["branches"][number];

function ConsolidatedDashboard({
  branches,
  activeBranch,
  status,
  switching,
  onSelectBranch,
}: {
  branches: readonly Branch[];
  activeBranch: Branch | null;
  status: CloudReplicationStatus;
  switching: boolean;
  onSelectBranch: (branchId: string) => void;
}) {
  if (branches.length <= 1) return null;

  return (
    <div className="dj-replication__dashboard">
      <h2>Sedes autorizadas</h2>
      <p className="dj-replication__hint">
        Elige una sede para ver su estado y réplica arriba. El contrato expone el estado de una sede a la vez (la
        activa de la sesión); no hay una consulta que traiga el estado de todas simultáneamente.
      </p>
      <table className="dj-replication__table">
        <thead>
          <tr>
            <th>Sede</th>
            <th>Estado de réplica</th>
          </tr>
        </thead>
        <tbody>
          {branches.map((branch) => {
            const isActive = branch.id === activeBranch?.id;
            return (
              <tr key={branch.id} className={isActive ? "dj-replication__row--active" : undefined}>
                <td>
                  {isActive ? (
                    branch.name
                  ) : (
                    <button
                      type="button"
                      className="dj-replication__row-button"
                      onClick={() => onSelectBranch(branch.id)}
                      disabled={switching}
                    >
                      {branch.name}
                    </button>
                  )}
                </td>
                <td>
                  {isActive ? (
                    <>
                      {status.edgeActive ? "Activo" : "Inactivo"} · última sincronización{" "}
                      {formatDateTime(status.lastReceivedAt)}
                    </>
                  ) : (
                    "Selecciona esta sede para ver su estado."
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
