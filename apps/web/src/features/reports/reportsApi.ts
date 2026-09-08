import { z } from "zod";
import { DashboardReportSchema, ProductPerformanceReportSchema, SalesReportSchema, type ReportRangeQuery } from "@don-juan/contracts";
import type { AuthContextValue } from "../auth/AuthProvider";
import type { BlobResult } from "../../lib/api/httpClient";

export type DashboardReport = z.infer<typeof DashboardReportSchema>;
export type SalesReport = z.infer<typeof SalesReportSchema>;
export type ProductPerformanceReport = z.infer<typeof ProductPerformanceReportSchema>;

export type ReportRangeParams = Partial<Pick<ReportRangeQuery, "from" | "to" | "page" | "pageSize">>;

type AuthClient = Pick<AuthContextValue, "authGet" | "authGetBlob">;

function toQueryString(params: ReportRangeParams): string {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface ReportsApi {
  getDashboard(params: ReportRangeParams): Promise<DashboardReport>;
  getSales(params: ReportRangeParams): Promise<SalesReport>;
  getProducts(params: ReportRangeParams): Promise<ProductPerformanceReport>;
  exportSalesCsv(params: ReportRangeParams): Promise<BlobResult>;
}

export function createReportsApi(auth: AuthClient): ReportsApi {
  return {
    getDashboard: (params) => auth.authGet(`/reports/dashboard${toQueryString(params)}`, DashboardReportSchema),
    getSales: (params) => auth.authGet(`/reports/sales${toQueryString(params)}`, SalesReportSchema),
    getProducts: (params) => auth.authGet(`/reports/products${toQueryString(params)}`, ProductPerformanceReportSchema),
    exportSalesCsv: (params) => auth.authGetBlob(`/reports/sales/export.csv${toQueryString(params)}`),
  };
}
