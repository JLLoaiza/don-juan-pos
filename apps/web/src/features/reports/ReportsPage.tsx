import { useEffect, useState } from "react";
import { Banner, Button, EmptyState, ErrorState, LoadingState, type ErrorStateVariant } from "@don-juan/ui";
import type { ReportFreshnessSchema, ReportPageSchema } from "@don-juan/contracts";
import type { z } from "zod";
import { formatMoney, formatQuantity } from "../catalog/format";
import { formatDateTime, formatFreshnessTime, formatPercent } from "./format";
import { ApiRequestError } from "../../lib/api/httpClient";
import { DateRangeFilter, initialDateRange, type DateRangeValue } from "./DateRangeFilter";
import { useDashboardReport, type UseDashboardReportResult } from "./useDashboardReport";
import { useSalesReport } from "./useSalesReport";
import { useProductsReport } from "./useProductsReport";
import { useExportSalesCsv } from "./useExportSalesCsv";
import "./ReportsPage.css";

const PAGE_SIZE = 50;
const PAYMENT_METHOD_LABEL: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", QR: "QR" };

type Freshness = z.infer<typeof ReportFreshnessSchema>;
type ReportPage = z.infer<typeof ReportPageSchema>;

function errorVariant(error: unknown): ErrorStateVariant {
  if (error instanceof ApiRequestError) {
    if (error.kind === "network") return "network";
    if (error.status === 401) return "unauthenticated";
    if (error.status === 403) return "forbidden";
  }
  return "server";
}

// apps/api/src/reports.ts rejects every /reports/* route with 422 on an Edge
// deployment (reports only exist against a Cloud's confirmed replicas).
function isReportsUnavailableHere(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 422;
}

function csvErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.kind === "network") return "No se pudo contactar el servidor.";
    if (error.status === 401) return "Tu sesión expiró. Inicia sesión de nuevo.";
    if (error.status === 403) return "Tu usuario no tiene el permiso de exportación (reports.export).";
  }
  return "Ocurrió un error al generar el archivo.";
}

export function ReportsPage() {
  const [range, setRange] = useState<DateRangeValue>(initialDateRange);
  const dashboard = useDashboardReport(range.from, range.to);

  if (isReportsUnavailableHere(dashboard.error)) {
    return (
      <section className="dj-reports" aria-labelledby="reports-title">
        <h1 id="reports-title">Reportes</h1>
        <EmptyState
          title="Los reportes sólo existen en la nube"
          description="Este servidor es una sede local (Edge). Los reportes se consultan desde la administración cloud, sobre la réplica ya confirmada de esta sede."
        />
      </section>
    );
  }

  return (
    <section className="dj-reports" aria-labelledby="reports-title">
      <h1 id="reports-title">Reportes</h1>
      <DateRangeFilter value={range} onChange={setRange} />
      <DashboardSection result={dashboard} />
      {dashboard.status !== "loading" ? (
        <>
          <SalesSection from={range.from} to={range.to} />
          <ProductsSection from={range.from} to={range.to} />
        </>
      ) : null}
    </section>
  );
}

function FreshnessNote({ freshness }: { freshness: Freshness }) {
  return (
    <p className="dj-reports__freshness">
      Réplica confirmada en la nube (<code>{freshness.source}</code>) · última sincronización: {formatFreshnessTime(freshness.lastReceivedAt)}
    </p>
  );
}

function StaleBanner({ freshness }: { freshness: Freshness }) {
  if (!freshness.stale) return null;
  return (
    <Banner
      tone="warning"
      title="Datos posiblemente desactualizados"
      description={`Última sincronización: ${formatFreshnessTime(freshness.lastReceivedAt)}. Esta sede puede estar sin conexión a la nube.`}
    />
  );
}

function DashboardSection({ result }: { result: UseDashboardReportResult }) {
  if (result.status === "loading") return <LoadingState label="Cargando panel…" />;
  if (result.status === "error" || !result.data) {
    return <ErrorState variant={errorVariant(result.error)} onRetry={result.reload} />;
  }

  const { data } = result;
  const hasCosts = data.profitability.historicalCost !== undefined;

  return (
    <div className="dj-reports__panel">
      <StaleBanner freshness={data.freshness} />
      <dl className="dj-reports__facts">
        <div>
          <dt>Ventas cobradas</dt>
          <dd>{formatMoney(data.sales.collected)}</dd>
        </div>
        <div>
          <dt>Pagos</dt>
          <dd>{data.sales.payments}</dd>
        </div>
        <div>
          <dt>Ticket promedio</dt>
          <dd>{formatMoney(data.sales.averageTicket)}</dd>
        </div>
        <div>
          <dt>Cuentas abiertas</dt>
          <dd>{data.operations.openAccounts}</dd>
        </div>
        <div>
          <dt>Mesas ocupadas</dt>
          <dd>{data.operations.occupiedTables}</dd>
        </div>
        {hasCosts ? (
          <>
            <div>
              <dt>Costo histórico</dt>
              <dd>{formatMoney(data.profitability.historicalCost ?? "0")}</dd>
            </div>
            <div>
              <dt>Utilidad bruta</dt>
              <dd>{formatMoney(data.profitability.grossProfit ?? "0")}</dd>
            </div>
            <div>
              <dt>Margen bruto</dt>
              <dd>{formatPercent(data.profitability.grossMarginPercent ?? "0")}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <FreshnessNote freshness={data.freshness} />
    </div>
  );
}

function Pagination({ page, onPageChange }: { page: ReportPage; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="dj-reports__pagination">
      <Button variant="secondary" onClick={() => onPageChange(page.page - 1)} disabled={page.page <= 1}>
        Anterior
      </Button>
      <span>
        Página {page.page} de {totalPages} ({page.total} en total)
      </span>
      <Button variant="secondary" onClick={() => onPageChange(page.page + 1)} disabled={page.page >= totalPages}>
        Siguiente
      </Button>
    </div>
  );
}

function SalesSection({ from, to }: { from: string | undefined; to: string | undefined }) {
  const [page, setPage] = useState(1);
  const sales = useSalesReport(from, to, page, PAGE_SIZE);
  const csv = useExportSalesCsv();

  useEffect(() => {
    setPage(1);
  }, [from, to]);

  return (
    <div className="dj-reports__section">
      <div className="dj-reports__section-header">
        <h2>Ventas</h2>
        <Button
          variant="secondary"
          onClick={() => csv.exportCsv({ from, to, page, pageSize: PAGE_SIZE })}
          disabled={csv.exporting || sales.status !== "ready"}
        >
          {csv.exporting ? "Exportando…" : "Exportar CSV"}
        </Button>
      </div>
      {csv.error ? <Banner tone="warning" title="No se pudo exportar" description={csvErrorMessage(csv.error)} /> : null}

      {sales.status === "loading" ? <LoadingState label="Cargando ventas…" /> : null}
      {sales.status === "error" ? <ErrorState variant={errorVariant(sales.error)} onRetry={sales.reload} /> : null}
      {sales.status === "ready" && sales.data ? (
        sales.data.rows.length === 0 ? (
          <EmptyState title="Sin pagos en este rango" description="No hay pagos registrados para el filtro de fechas elegido." />
        ) : (
          <>
            <StaleBanner freshness={sales.data.freshness} />
            <p className="dj-reports__hint">
              {sales.data.totals.payments} pagos · {formatMoney(sales.data.totals.collected)} cobrado
            </p>
            <div className="dj-reports__table-wrap">
              <table className="dj-reports__table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cuenta</th>
                    <th>Método</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.data.rows.map((row) => (
                    <tr key={row.paymentId}>
                      <td>{formatDateTime(row.receivedAt)}</td>
                      <td>
                        <code title={row.accountId}>{row.accountId.slice(0, 8)}…</code>
                      </td>
                      <td>
                        {row.paymentMethodName} ({PAYMENT_METHOD_LABEL[row.paymentMethodType] ?? row.paymentMethodType})
                      </td>
                      <td>{formatMoney(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={sales.data.page} onPageChange={setPage} />
            <FreshnessNote freshness={sales.data.freshness} />
          </>
        )
      ) : null}
    </div>
  );
}

function ProductsSection({ from, to }: { from: string | undefined; to: string | undefined }) {
  const [page, setPage] = useState(1);
  const products = useProductsReport(from, to, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [from, to]);

  return (
    <div className="dj-reports__section">
      <h2>Productos</h2>
      {products.status === "loading" ? <LoadingState label="Cargando productos…" /> : null}
      {products.status === "error" ? <ErrorState variant={errorVariant(products.error)} onRetry={products.reload} /> : null}
      {products.status === "ready" && products.data ? (
        products.data.rows.length === 0 ? (
          <EmptyState title="Sin ventas de producto en este rango" description="No hay consumo confirmado para el filtro de fechas elegido." />
        ) : (
          <>
            <StaleBanner freshness={products.data.freshness} />
            <div className="dj-reports__table-wrap">
              <table className="dj-reports__table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Ingresos</th>
                    {products.data.totals.historicalCost !== undefined ? (
                      <>
                        <th>Costo histórico</th>
                        <th>Utilidad bruta</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {products.data.rows.map((row) => (
                    <tr key={row.productId}>
                      <td>{row.productName}</td>
                      <td>{formatQuantity(row.quantity)}</td>
                      <td>{formatMoney(row.revenue)}</td>
                      {row.historicalCost !== undefined ? (
                        <>
                          <td>{formatMoney(row.historicalCost)}</td>
                          <td>{formatMoney(row.grossProfit ?? "0")}</td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={products.data.page} onPageChange={setPage} />
            <FreshnessNote freshness={products.data.freshness} />
          </>
        )
      ) : null}
    </div>
  );
}
