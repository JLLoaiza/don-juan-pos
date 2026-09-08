import { createHash } from "node:crypto";
import type { ConfirmPurchaseRequest, CreateExpenseRequest, CreateSupplierRequest, Expense, Purchase, UpdateSupplierRequest } from "@don-juan/contracts";
import { addDecimals, compareDecimals, divideDecimals, multiplyDecimals, subtractDecimals, uuidv7 } from "@don-juan/domain";
import { one, withTransaction } from "@don-juan/database";
import type { Pool, PoolClient } from "pg";
import { CatalogConflict, CatalogRuleViolation, type CatalogActor } from "./catalog.js";

export interface ProcurementActor extends CatalogActor {}
type Action<T> = (client: PoolClient, companyId: string) => Promise<T>;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const decimal = (value: unknown) => String(value);
const instant = (value: Date | string) => new Date(value).toISOString();

export class ProcurementService {
  constructor(private readonly pool: Pool) {}

  private async command<T>(actor: ProcurementActor, operationId: string, name: string, request: unknown, action: Action<T>): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      const tenant = await one<{company_id:string}>(client, `SELECT b.company_id FROM user_branch_access uba JOIN users u ON u.id=uba.user_id JOIN branches b ON b.id=uba.branch_id AND b.company_id=u.company_id WHERE uba.user_id=$1 AND uba.branch_id=$2 AND b.active FOR SHARE`, [actor.userId,actor.branchId]);
      if (!tenant) throw new CatalogRuleViolation("Active branch access is required");
      const requestHash=hash(request);
      const inserted=await client.query<{id:string}>(`INSERT INTO command_operations(company_id,branch_id,operation_id,command_name,user_id,request_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,operation_id) DO NOTHING RETURNING id`,[tenant.company_id,actor.branchId,operationId,name,actor.userId,requestHash]);
      if(!inserted.rowCount){
        const previous=await one<{command_name:string;request_hash:string;result:T}>(client,"SELECT command_name,request_hash,result FROM command_operations WHERE company_id=$1 AND operation_id=$2 FOR UPDATE",[tenant.company_id,operationId]);
        if(!previous||previous.command_name!==name||previous.request_hash!==requestHash) throw new CatalogConflict("Idempotency key was already used for a different command");
        return previous.result;
      }
      const result=await action(client,tenant.company_id);
      await client.query("UPDATE command_operations SET result=$2,completed_at=NOW() WHERE id=$1",[inserted.rows[0]?.id,result]);
      return result;
    });
  }
  private async audit(client:PoolClient,actor:ProcurementActor,companyId:string,action:string,type:string,id:string,before:unknown,after:unknown){ await client.query("INSERT INTO audit_logs(company_id,branch_id,user_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[companyId,actor.branchId,actor.userId,action,type,id,before,after]); }
  private async outbox(client:PoolClient,actor:ProcurementActor,operationId:string,name:string,type:string,id:string,payload:unknown){ await client.query("INSERT INTO sync_outbox(branch_id,operation_id,command_name,aggregate_type,aggregate_id,payload) VALUES($1,$2,$3,$4,$5,$6)",[actor.branchId,operationId,name,type,id,payload]); }

  async suppliers(actor: ProcurementActor) {
    const rows=(await this.pool.query<any>("SELECT id,name,tax_id,phone,email,address,notes,active FROM suppliers WHERE branch_id=$1 ORDER BY name,id",[actor.branchId])).rows;
    return { suppliers: rows.map(supplier) };
  }
  async createSupplier(actor:ProcurementActor,operationId:string,input:CreateSupplierRequest){
    return this.command(actor,operationId,"suppliers.create",input,async(client,companyId)=>{
      const id=uuidv7();
      const row=await one<any>(client,"INSERT INTO suppliers(id,branch_id,name,tax_id,phone,email,address,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,tax_id,phone,email,address,notes,active",[id,actor.branchId,input.name,input.taxId??null,input.phone??null,input.email??null,input.address??null,input.notes??null]);
      if(!row) throw new Error("Supplier insert did not return a row"); const result=supplier(row);
      await this.audit(client,actor,companyId,"supplier.created","supplier",id,null,result); await this.outbox(client,actor,operationId,"suppliers.create","supplier",id,result); return result;
    });
  }
  async updateSupplier(actor:ProcurementActor,operationId:string,id:string,input:UpdateSupplierRequest){
    return this.command(actor,operationId,"suppliers.update",{id,...input},async(client,companyId)=>{
      const before=await one<any>(client,"SELECT id,name,tax_id,phone,email,address,notes,active FROM suppliers WHERE id=$1 AND branch_id=$2 FOR UPDATE",[id,actor.branchId]);
      if(!before) throw new CatalogRuleViolation("Supplier was not found in the current branch");
      const row=await one<any>(client,"UPDATE suppliers SET name=$3,tax_id=$4,phone=$5,email=$6,address=$7,notes=$8,active=$9 WHERE id=$1 AND branch_id=$2 RETURNING id,name,tax_id,phone,email,address,notes,active",[id,actor.branchId,input.name,input.taxId??null,input.phone??null,input.email??null,input.address??null,input.notes??null,input.active]);
      if(!row) throw new Error("Supplier update did not return a row"); const result=supplier(row);
      await this.audit(client,actor,companyId,"supplier.updated","supplier",id,supplier(before),result); await this.outbox(client,actor,operationId,"suppliers.update","supplier",id,result); return result;
    });
  }

  async purchases(actor:ProcurementActor):Promise<{purchases:Purchase[]}> {
    const rows=(await this.pool.query<any>("SELECT p.*,pm.type payment_method_type FROM purchases p LEFT JOIN payment_methods pm ON pm.id=p.payment_method_id WHERE p.branch_id=$1 ORDER BY p.purchase_date DESC,p.id DESC",[actor.branchId])).rows;
    const result:Purchase[]=[]; for(const row of rows) result.push(await this.purchase(this.pool,row));
    return {purchases:result};
  }
  async expenses(actor:ProcurementActor):Promise<{expenses:Expense[]}> {
    const rows=(await this.pool.query<any>("SELECT e.*,pm.type payment_method_type FROM expenses e LEFT JOIN payment_methods pm ON pm.id=e.payment_method_id WHERE e.branch_id=$1 ORDER BY e.expense_date DESC,e.id DESC",[actor.branchId])).rows;
    return {expenses:rows.map(expense)};
  }

  async confirmPurchase(actor:ProcurementActor,operationId:string,input:ConfirmPurchaseRequest):Promise<Purchase> {
    return this.command(actor,operationId,"purchases.confirm",input,async(client,companyId)=>{
      if(input.supplierId){ const supplierRow=await one<any>(client,"SELECT id FROM suppliers WHERE id=$1 AND branch_id=$2 AND active FOR SHARE",[input.supplierId,actor.branchId]); if(!supplierRow) throw new CatalogRuleViolation("Supplier must be active and belong to the current branch"); }
      const method=await this.paymentMethod(client,actor,input.paymentMethodId??null,input.cashSessionId??null);
      const id=uuidv7();
      const purchaseDate=input.purchaseDate??new Date().toISOString();
      const totals=await one<{subtotal:string}>(client,"SELECT COALESCE(SUM(ROUND(q*c,2)),0)::text subtotal FROM unnest($1::numeric[],$2::numeric[]) AS x(q,c)",[input.items.map(item=>item.quantity),input.items.map(item=>item.unitCost)]);
      const subtotal=totals?.subtotal??"0"; const total=subtractDecimals(addDecimals(subtotal,input.taxTotal??"0"),input.discountTotal??"0"); if(compareDecimals(total,"0")<0) throw new CatalogRuleViolation("Purchase discount cannot exceed subtotal plus taxes");
      await client.query("INSERT INTO purchases(id,branch_id,supplier_id,document_number,purchase_date,subtotal,tax_total,discount_total,total,payment_method_id,cash_session_id,notes,created_by_user_id,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",[id,actor.branchId,input.supplierId??null,input.documentNumber??null,purchaseDate,subtotal,input.taxTotal??"0",input.discountTotal??"0",total,method?.id??null,input.cashSessionId??null,input.notes??null,actor.userId,operationId]);
      const lockedIds=[...new Set(input.items.map(item=>item.inventoryItemId))].sort();
      const inventory=(await client.query<any>("SELECT id,current_stock,unit_cost FROM inventory_items WHERE branch_id=$1 AND active AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",[actor.branchId,lockedIds])).rows;
      if(inventory.length!==lockedIds.length) throw new CatalogRuleViolation("Every purchase item must be an active inventory item from the current branch");
      const inventoryById=new Map(inventory.map(item=>[item.id,item]));
      for(const line of input.items){
        const item=inventoryById.get(line.inventoryItemId)!;
        const purchaseItemId=uuidv7();
        const lineRow=await one<any>(client,"INSERT INTO purchase_items(id,purchase_id,inventory_item_id,quantity,unit_cost,subtotal) VALUES($1,$2,$3,$4,$5,ROUND($4::numeric*$5::numeric,2)) RETURNING id,quantity,unit_cost,subtotal",[purchaseItemId,id,line.inventoryItemId,line.quantity,line.unitCost]);
        if(!lineRow) throw new Error("Purchase item insert did not return a row");
        const oldStock=decimal(item.current_stock), oldCost=decimal(item.unit_cost), newStock=addDecimals(oldStock,line.quantity);
        const nextCost=compareDecimals(oldStock,"0")<=0 ? line.unitCost : divideDecimals(addDecimals(multiplyDecimals(oldStock,oldCost),multiplyDecimals(line.quantity,line.unitCost)),newStock,6);
        await client.query("UPDATE inventory_items SET current_stock=$3,unit_cost=$4 WHERE id=$1 AND branch_id=$2",[item.id,actor.branchId,newStock,nextCost]);
        await client.query("INSERT INTO inventory_movements(id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,stock_before,stock_after,source_type,source_id,purchase_item_id,reason,metadata,created_by_user_id) VALUES($1,$2,$3,'PURCHASE',$4,$5,$6,$7,'PURCHASE',$8,$9,'Confirmed purchase',$10,$11)",[uuidv7(),actor.branchId,item.id,line.quantity,line.unitCost,oldStock,newStock,id,purchaseItemId,{unit_cost_before:oldCost,purchase_unit_cost:line.unitCost,unit_cost_after:nextCost,inventory_value_before:multiplyDecimals(oldStock,oldCost),purchase_value:multiplyDecimals(line.quantity,line.unitCost)},actor.userId]);
        item.current_stock=newStock; item.unit_cost=nextCost;
      }
      await this.recalculateAffectedProducts(client,lockedIds);
      if(method?.type==="CASH") await client.query("INSERT INTO cash_movements(id,cash_session_id,movement_type,amount,purchase_id,description,created_by_user_id,operation_id) VALUES($1,$2,'PURCHASE',$3,$4,$5,$6,$7)",[uuidv7(),input.cashSessionId,total,id,`Purchase ${id}`,actor.userId,operationId]);
      const row=await one<any>(client,"SELECT p.*,pm.type payment_method_type FROM purchases p LEFT JOIN payment_methods pm ON pm.id=p.payment_method_id WHERE p.id=$1",[id]);
      if(!row) throw new Error("Purchase was not found after insert"); const result=await this.purchase(client,row);
      await this.audit(client,actor,companyId,"purchase.confirmed","purchase",id,null,result); await this.outbox(client,actor,operationId,"purchases.confirm","purchase",id,result); return result;
    });
  }

  async createExpense(actor:ProcurementActor,operationId:string,input:CreateExpenseRequest):Promise<Expense> {
    return this.command(actor,operationId,"expenses.create",input,async(client,companyId)=>{
      if(input.supplierId){const existing=await one(client,"SELECT id FROM suppliers WHERE id=$1 AND branch_id=$2 AND active FOR SHARE",[input.supplierId,actor.branchId]);if(!existing) throw new CatalogRuleViolation("Supplier must be active and belong to the current branch");}
      const method=await this.paymentMethod(client,actor,input.paymentMethodId??null,input.cashSessionId??null);
      const id=uuidv7(); const date=input.expenseDate??new Date().toISOString();
      const row=await one<any>(client,"INSERT INTO expenses(id,branch_id,supplier_id,concept,amount,expense_date,payment_method_id,cash_session_id,notes,created_by_user_id,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",[id,actor.branchId,input.supplierId??null,input.concept,input.amount,date,method?.id??null,input.cashSessionId??null,input.notes??null,actor.userId,operationId]);
      if(!row) throw new Error("Expense insert did not return a row");
      if(method?.type==="CASH") await client.query("INSERT INTO cash_movements(id,cash_session_id,movement_type,amount,expense_id,description,created_by_user_id,operation_id) VALUES($1,$2,'EXPENSE',$3,$4,$5,$6,$7)",[uuidv7(),input.cashSessionId,input.amount,id,`Expense ${id}`,actor.userId,operationId]);
      const result=expense({...row,payment_method_type:method?.type??null});
      await this.audit(client,actor,companyId,"expense.created","expense",id,null,result); await this.outbox(client,actor,operationId,"expenses.create","expense",id,result); return result;
    });
  }

  async voidPurchase(actor:ProcurementActor,operationId:string,id:string,input:{reason:string}):Promise<Purchase> {
    return this.command(actor,operationId,"purchases.void",{id,...input},async(client,companyId)=>{
      const purchaseRow=await one<any>(client,"SELECT p.*,pm.type payment_method_type FROM purchases p LEFT JOIN payment_methods pm ON pm.id=p.payment_method_id WHERE p.id=$1 AND p.branch_id=$2 FOR UPDATE OF p",[id,actor.branchId]);
      if(!purchaseRow||purchaseRow.status!=="CONFIRMED") throw new CatalogRuleViolation("Only a confirmed purchase in the current branch can be voided");
      const lines=(await client.query<any>("SELECT pi.id purchase_item_id,pi.inventory_item_id,pi.quantity,pi.unit_cost,m.id movement_id,m.created_at,m.stock_before,m.stock_after,m.metadata FROM purchase_items pi JOIN inventory_movements m ON m.purchase_item_id=pi.id WHERE pi.purchase_id=$1 ORDER BY m.created_at DESC,m.id DESC FOR UPDATE",[id])).rows;
      if(!lines.length) throw new CatalogRuleViolation("Purchase has no inventory movements to reverse");
      const purchaseItemIds=lines.map(line=>line.purchase_item_id);
      for(const line of lines){const later=await one(client,"SELECT id FROM inventory_movements WHERE inventory_item_id=$1 AND created_at>$2 AND (purchase_item_id IS NULL OR NOT (purchase_item_id=ANY($3::uuid[]))) LIMIT 1 FOR SHARE",[line.inventory_item_id,line.created_at,purchaseItemIds]);if(later)throw new CatalogRuleViolation("Purchase cannot be directly voided after later inventory activity");}
      for(const inventoryId of [...new Set(lines.map(line=>line.inventory_item_id))].sort()) await client.query("SELECT id FROM inventory_items WHERE id=$1 AND branch_id=$2 FOR UPDATE",[inventoryId,actor.branchId]);
      for(const line of lines){const beforeCost=decimal(line.metadata.unit_cost_before);await client.query("UPDATE inventory_items SET current_stock=$3,unit_cost=$4 WHERE id=$1 AND branch_id=$2",[line.inventory_item_id,actor.branchId,line.stock_before,beforeCost]);await client.query("INSERT INTO inventory_movements(id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,stock_before,stock_after,source_type,source_id,reason,metadata,created_by_user_id) VALUES($1,$2,$3,'CORRECTION',$4,$5,$6,$7,'PURCHASE_VOID',$8,$9,$10,$11)",[uuidv7(),actor.branchId,line.inventory_item_id,"-"+decimal(line.quantity),decimal(line.unit_cost),decimal(line.stock_after),decimal(line.stock_before),id,input.reason,{reverses_movement_id:line.movement_id,restored_unit_cost:beforeCost},actor.userId]);}
      await this.recalculateAffectedProducts(client,[...new Set(lines.map(line=>line.inventory_item_id))]);
      if(purchaseRow.payment_method_type==="CASH"){const session=await one(client,"SELECT cs.id FROM cash_sessions cs JOIN cash_registers cr ON cr.id=cs.cash_register_id WHERE cs.id=$1 AND cr.branch_id=$2 AND cs.status='OPEN' FOR UPDATE",[purchaseRow.cash_session_id,actor.branchId]);if(!session)throw new CatalogRuleViolation("A purchase paid in cash can only be voided while its cash session is open");await client.query("INSERT INTO cash_movements(id,cash_session_id,movement_type,amount,purchase_void_id,description,created_by_user_id,operation_id) VALUES($1,$2,'DEPOSIT',$3,$4,$5,$6,$7)",[uuidv7(),purchaseRow.cash_session_id,purchaseRow.total,id,"Purchase void "+id,actor.userId,operationId]);}
      await client.query("UPDATE purchases SET status='VOID',voided_at=NOW(),voided_by_user_id=$2,void_reason=$3 WHERE id=$1",[id,actor.userId,input.reason]);
      const updated=await one<any>(client,"SELECT p.*,pm.type payment_method_type FROM purchases p LEFT JOIN payment_methods pm ON pm.id=p.payment_method_id WHERE p.id=$1",[id]);if(!updated)throw new Error("Voided purchase was not found");const result=await this.purchase(client,updated);await this.audit(client,actor,companyId,"purchase.voided","purchase",id,purchaseRow,result);await this.outbox(client,actor,operationId,"purchases.void","purchase",id,result);return result;
    });
  }
  async voidExpense(actor:ProcurementActor,operationId:string,id:string,input:{reason:string}):Promise<Expense> {
    return this.command(actor,operationId,"expenses.void",{id,...input},async(client,companyId)=>{
      const expenseRow=await one<any>(client,"SELECT e.*,pm.type payment_method_type FROM expenses e LEFT JOIN payment_methods pm ON pm.id=e.payment_method_id WHERE e.id=$1 AND e.branch_id=$2 FOR UPDATE OF e",[id,actor.branchId]);
      if(!expenseRow||expenseRow.status!=="CONFIRMED") throw new CatalogRuleViolation("Only a confirmed expense in the current branch can be voided");
      if(expenseRow.payment_method_type==="CASH"){const session=await one(client,"SELECT cs.id FROM cash_sessions cs JOIN cash_registers cr ON cr.id=cs.cash_register_id WHERE cs.id=$1 AND cr.branch_id=$2 AND cs.status='OPEN' FOR UPDATE",[expenseRow.cash_session_id,actor.branchId]);if(!session)throw new CatalogRuleViolation("A cash expense can only be voided while its cash session is open");await client.query("INSERT INTO cash_movements(id,cash_session_id,movement_type,amount,expense_id,description,created_by_user_id,operation_id) VALUES($1,$2,'DEPOSIT',$3,$4,$5,$6,$7)",[uuidv7(),expenseRow.cash_session_id,expenseRow.amount,id,"Expense void "+id,actor.userId,operationId]);}
      const updated=await one<any>(client,"UPDATE expenses SET status='VOID',voided_at=NOW(),voided_by_user_id=$2,void_reason=$3 WHERE id=$1 RETURNING *",[id,actor.userId,input.reason]);if(!updated)throw new Error("Voided expense was not found");const result=expense({...updated,payment_method_type:expenseRow.payment_method_type??null});await this.audit(client,actor,companyId,"expense.voided","expense",id,expenseRow,result);await this.outbox(client,actor,operationId,"expenses.void","expense",id,result);return result;
    });
  }

  private async paymentMethod(client:PoolClient,actor:ProcurementActor,paymentMethodId:string|null,cashSessionId:string|null){
    if(!paymentMethodId){ if(cashSessionId) throw new CatalogRuleViolation("A cash session requires a CASH payment method"); return null; }
    const method=await one<any>(client,"SELECT id,type FROM payment_methods WHERE id=$1 AND branch_id=$2 AND active FOR SHARE",[paymentMethodId,actor.branchId]);
    if(!method) throw new CatalogRuleViolation("Payment method must be active and belong to the current branch");
    if(method.type==="CASH"){
      if(!cashSessionId) throw new CatalogRuleViolation("Cash payment requires an open cash session");
      const session=await one(client,"SELECT cs.id FROM cash_sessions cs JOIN cash_registers cr ON cr.id=cs.cash_register_id WHERE cs.id=$1 AND cr.branch_id=$2 AND cs.status='OPEN' FOR UPDATE",[cashSessionId,actor.branchId]);
      if(!session) throw new CatalogRuleViolation("Cash session must be open in the current branch");
    } else if(cashSessionId) throw new CatalogRuleViolation("Only CASH payment methods may use a cash session");
    return method;
  }
  private async recalculateAffectedProducts(client:PoolClient,inventoryIds:string[]){
    await client.query(`UPDATE products p SET calculated_cost=COALESCE((SELECT SUM(CASE WHEN pc.component_type='INVENTORY_ITEM' THEN pc.quantity*i.unit_cost ELSE pc.quantity*COALESCE((SELECT SUM(ac.quantity*ai.unit_cost) FROM accompaniment_components ac JOIN inventory_items ai ON ai.id=ac.inventory_item_id WHERE ac.accompaniment_id=pc.accompaniment_id),0) END) FROM product_components pc LEFT JOIN inventory_items i ON i.id=pc.inventory_item_id WHERE pc.product_id=p.id),0) WHERE p.branch_id=(SELECT branch_id FROM inventory_items WHERE id=$1) AND (EXISTS(SELECT 1 FROM product_components pc WHERE pc.product_id=p.id AND pc.inventory_item_id=ANY($2::uuid[])) OR EXISTS(SELECT 1 FROM product_components pc JOIN accompaniment_components ac ON ac.accompaniment_id=pc.accompaniment_id WHERE pc.product_id=p.id AND ac.inventory_item_id=ANY($2::uuid[])))`,[inventoryIds[0],inventoryIds]);
  }
  private async purchase(queryable:Pool|PoolClient,row:any):Promise<Purchase>{
    const items=(await queryable.query<any>("SELECT id,inventory_item_id,quantity,unit_cost,subtotal FROM purchase_items WHERE purchase_id=$1 ORDER BY created_at,id",[row.id])).rows.map((item)=>({id:item.id,inventoryItemId:item.inventory_item_id,quantity:decimal(item.quantity),unitCost:decimal(item.unit_cost),subtotal:decimal(item.subtotal)}));
    return {id:row.id,supplierId:row.supplier_id??null,documentNumber:row.document_number??null,purchaseDate:instant(row.purchase_date),subtotal:decimal(row.subtotal),taxTotal:decimal(row.tax_total),discountTotal:decimal(row.discount_total),total:decimal(row.total),paymentMethodId:row.payment_method_id??null,paymentMethodType:row.payment_method_type??null,cashSessionId:row.cash_session_id??null,status:row.status,notes:row.notes??null,createdByUserId:row.created_by_user_id,createdAt:instant(row.created_at),items};
  }
}
function supplier(row:any){return{id:row.id,name:row.name,taxId:row.tax_id??null,phone:row.phone??null,email:row.email??null,address:row.address??null,notes:row.notes??null,active:row.active};}
function expense(row:any):Expense{return{id:row.id,supplierId:row.supplier_id??null,concept:row.concept,amount:decimal(row.amount),expenseDate:instant(row.expense_date),paymentMethodId:row.payment_method_id??null,paymentMethodType:row.payment_method_type??null,cashSessionId:row.cash_session_id??null,status:row.status,notes:row.notes??null,createdByUserId:row.created_by_user_id,createdAt:instant(row.created_at)};}
