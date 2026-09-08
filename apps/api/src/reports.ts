import { addDecimals, compareDecimals, divideDecimals, multiplyDecimals, subtractDecimals } from "@don-juan/domain";
import type { ReportRangeQuery } from "@don-juan/contracts";
import type { Pool } from "pg";
import { CatalogRuleViolation, type CatalogActor } from "./catalog.js";

const zero = "0";
type EventRow = { payload: unknown; received_at: Date; aggregate_id: string };
type EntityRow = { payload: unknown; entity_id: string; replicated_at: Date };
const object = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const instant = (value: unknown, fallback: Date) => { const d = new Date(typeof value === "string" ? value : fallback); return Number.isNaN(d.getTime()) ? fallback.toISOString() : d.toISOString(); };
const inRange = (value: string, range: ReportRangeQuery) => (!range.from || value >= range.from) && (!range.to || value < range.to);

export class ReportsService {
  constructor(private readonly pool: Pool, private readonly deploymentMode: "edge" | "cloud") {}
  private cloudOnly() { if (this.deploymentMode !== "cloud") throw new CatalogRuleViolation("Reports are available only from confirmed Cloud replicas"); }
  private async freshness(actor: CatalogActor) {
    this.cloudOnly();
    const result = await this.pool.query<{ last_received_at: Date | null }>("SELECT MAX(last_received_at) last_received_at FROM edge_servers WHERE branch_id=$1 AND active", [actor.branchId]);
    const last = result.rows[0]?.last_received_at ?? null;
    return { branchId: actor.branchId, lastReceivedAt: last?.toISOString() ?? null, stale: !last || Date.now() - last.getTime() > 15 * 60_000, source: "CONFIRMED_CLOUD_REPLICA" as const };
  }
  private async paymentRows(actor: CatalogActor, range: ReportRangeQuery) {
    const result = await this.pool.query<EventRow>("SELECT payload,received_at,aggregate_id FROM cloud_replica_events WHERE branch_id=$1 AND command_name='payments.register' ORDER BY received_at DESC,receipt_cursor DESC", [actor.branchId]);
    return result.rows.map((row) => { const payment=object(object(row.payload).payment); return { payment, receivedAt: instant(payment.receivedAt,row.received_at), id: row.aggregate_id }; }).filter((v) => v.payment.status === "REGISTERED" && inRange(v.receivedAt, range));
  }
  async sales(actor: CatalogActor, range: ReportRangeQuery) {
    const all = await this.paymentRows(actor, range); const total=all.reduce((sum,row)=>addDecimals(sum,String(row.payment.amountApplied ?? zero)),zero);
    const offset=(range.page-1)*range.pageSize;
    return { freshness: await this.freshness(actor), page:{page:range.page,pageSize:range.pageSize,total:all.length}, totals:{payments:all.length,collected:total}, rows:all.slice(offset,offset+range.pageSize).map((row)=>({ paymentId:String(row.payment.id ?? row.id), accountId:String(row.payment.accountId), receivedAt:row.receivedAt, paymentMethodName:String(row.payment.paymentMethodName ?? "Unknown"), paymentMethodType:row.payment.paymentMethodType, amount:String(row.payment.amountApplied) })) };
  }
  async products(actor: CatalogActor, range: ReportRangeQuery, includeCosts: boolean) {
    this.cloudOnly();
    const entities = await this.pool.query<EntityRow>("SELECT payload,entity_id,replicated_at FROM cloud_replica_entities WHERE branch_id=$1 AND entity_type='account' ORDER BY replicated_at DESC",[actor.branchId]);
    const grouped=new Map<string,{productId:string;productName:string;quantity:string;revenue:string;cost:string}>();
    for(const row of entities.rows) { const account=object(row.payload); const eventAt=instant(account.closedAt ?? account.openedAt,row.replicated_at); if(!inRange(eventAt,range)) continue; for(const item of Array.isArray(account.items)?account.items:[]) { const v=object(item); if(v.status!=="CONFIRMED")continue; const id=String(v.productId); const previous=grouped.get(id) ?? {productId:id,productName:String(v.productName),quantity:zero,revenue:zero,cost:zero}; previous.quantity=addDecimals(previous.quantity,String(v.quantity ?? zero)); previous.revenue=addDecimals(previous.revenue,String(v.lineTotal ?? zero)); previous.cost=addDecimals(previous.cost,multiplyDecimals(String(v.unitCost ?? zero),String(v.quantity ?? zero))); grouped.set(id,previous); } }
    const all=[...grouped.values()].sort((a,b)=>b.revenue.localeCompare(a.revenue)); const offset=(range.page-1)*range.pageSize; const rows=all.slice(offset,offset+range.pageSize).map(v=>includeCosts?{...v,historicalCost:v.cost,grossProfit:subtractDecimals(v.revenue,v.cost)}:{productId:v.productId,productName:v.productName,quantity:v.quantity,revenue:v.revenue}); const revenue=all.reduce((s,v)=>addDecimals(s,v.revenue),zero); const cost=all.reduce((s,v)=>addDecimals(s,v.cost),zero);
    return { freshness:await this.freshness(actor),page:{page:range.page,pageSize:range.pageSize,total:all.length},totals:includeCosts?{products:all.length,revenue,historicalCost:cost,grossProfit:subtractDecimals(revenue,cost)}:{products:all.length,revenue},rows };
  }
  async dashboard(actor: CatalogActor, range: ReportRangeQuery, includeCosts: boolean) {
    const sales=await this.sales(actor,{...range,page:1,pageSize:1}); const products=await this.products(actor,{...range,page:1,pageSize:1},includeCosts);
    const accounts=await this.pool.query<EntityRow>("SELECT payload,entity_id,replicated_at FROM cloud_replica_entities WHERE branch_id=$1 AND entity_type='account'",[actor.branchId]);
    const tables=await this.pool.query<EntityRow>("SELECT payload,entity_id,replicated_at FROM cloud_replica_entities WHERE branch_id=$1 AND entity_type='restaurant_table'",[actor.branchId]);
    const openAccounts=accounts.rows.filter(row=>object(row.payload).status==="OPEN").length; const occupiedTables=tables.rows.filter(row=>object(row.payload).status==="OCCUPIED").length;
    const profitability=includeCosts ? (()=>{ const t=products.totals as any; const margin=compareDecimals(t.revenue,zero)===0?zero:multiplyDecimals(divideDecimals(t.grossProfit,t.revenue,4),"100"); return {historicalCost:t.historicalCost,grossProfit:t.grossProfit,grossMarginPercent:margin}; })() : {};
    return { freshness:sales.freshness,sales:{collected:sales.totals.collected,payments:sales.totals.payments,averageTicket:sales.totals.payments?divideDecimals(sales.totals.collected,String(sales.totals.payments),2):zero},profitability,operations:{openAccounts,occupiedTables} };
  }
  csvSales(report: Awaited<ReturnType<ReportsService["sales"]>>) { return ["payment_id,account_id,received_at,payment_method,amount",...report.rows.map(r=>[r.paymentId,r.accountId,r.receivedAt,JSON.stringify(r.paymentMethodName),r.amount].join(","))].join("\n"); }
}
