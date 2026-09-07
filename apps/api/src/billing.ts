import { createHash } from "node:crypto";
import type { ApplyAccountDiscountRequest, BillingSnapshot, CashAdjustmentRequest, CashSession, CloseCashSessionRequest, ConfigureServiceRequest, OpenCashSessionRequest, PaymentSnapshot, RegisterPaymentRequest } from "@don-juan/contracts";
import { addDecimals, compareDecimals, divideDecimals, multiplyDecimals, subtractDecimals, uuidv7 } from "@don-juan/domain";
import { one, withTransaction } from "@don-juan/database";
import type { Pool, PoolClient } from "pg";
import { CatalogConflict, CatalogRuleViolation, type CatalogActor } from "./catalog.js";
import { recalculateAccountTotals } from "./billing-totals.js";

export interface BillingActor extends CatalogActor {}
type CommandAction<T> = (client: PoolClient, companyId: string) => Promise<T>;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const decimal = (value: unknown) => String(value);
const instant = (value: Date | string) => new Date(value).toISOString();

/** Financial commands deliberately keep all monetary state in one transaction. */
export class BillingService {
  constructor(private readonly pool: Pool) {}

  private async command<T>(actor: BillingActor, operationId: string, name: string, request: unknown, action: CommandAction<T>): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      const tenant = await one<{ company_id: string }>(client, `SELECT b.company_id FROM user_branch_access uba JOIN users u ON u.id=uba.user_id
        JOIN branches b ON b.id=uba.branch_id AND b.company_id=u.company_id WHERE uba.user_id=$1 AND uba.branch_id=$2 AND b.active FOR SHARE`, [actor.userId, actor.branchId]);
      if (!tenant) throw new CatalogRuleViolation("Active branch access is required");
      const requestHash = hash(request);
      const inserted = await client.query<{ id:string }>(`INSERT INTO command_operations(company_id,branch_id,operation_id,command_name,user_id,request_hash)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,operation_id) DO NOTHING RETURNING id`, [tenant.company_id,actor.branchId,operationId,name,actor.userId,requestHash]);
      if (!inserted.rowCount) {
        const previous = await one<{command_name:string;request_hash:string;result:T}>(client,"SELECT command_name,request_hash,result FROM command_operations WHERE company_id=$1 AND operation_id=$2 FOR UPDATE",[tenant.company_id,operationId]);
        if (!previous || previous.command_name!==name || previous.request_hash!==requestHash) throw new CatalogConflict("Idempotency key was already used for a different command");
        return previous.result;
      }
      const result=await action(client,tenant.company_id);
      await client.query("UPDATE command_operations SET result=$2,completed_at=NOW() WHERE id=$1",[inserted.rows[0]?.id,result]);
      return result;
    });
  }
  private async audit(client:PoolClient,actor:BillingActor,companyId:string,action:string,entityType:string,entityId:string,before:unknown,after:unknown){await client.query("INSERT INTO audit_logs(company_id,branch_id,user_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[companyId,actor.branchId,actor.userId,action,entityType,entityId,before,after]);}
  private async outbox(client:PoolClient,actor:BillingActor,operationId:string,name:string,type:string,id:string,payload:unknown){await client.query("INSERT INTO sync_outbox(branch_id,operation_id,command_name,aggregate_type,aggregate_id,payload) VALUES($1,$2,$3,$4,$5,$6)",[actor.branchId,operationId,name,type,id,payload]);}

  private async billingSnapshot(queryable: Pool | PoolClient, accountId: string, branchId: string): Promise<BillingSnapshot> {
    const account=await one<any>(queryable,"SELECT * FROM accounts WHERE id=$1 AND branch_id=$2",[accountId,branchId]);
    if(!account) throw new CatalogRuleViolation("Account was not found in the current branch");
    const payments=(await queryable.query<any>(`SELECT p.*,pm.name method_name,pm.type method_type FROM payments p LEFT JOIN payment_methods pm ON pm.id=p.payment_method_id WHERE p.account_id=$1 ORDER BY p.received_at,p.id`,[accountId])).rows;
    const discounts=(await queryable.query<any>("SELECT * FROM account_discounts WHERE account_id=$1 ORDER BY created_at,id",[accountId])).rows;
    const paid=payments.filter((p)=>p.status==="REGISTERED").reduce((sum,p)=>addDecimals(sum,decimal(p.amount)),"0");
    return {accountId,status:account.status,version:Number(account.version),settlementMode:account.settlement_mode,subtotal:decimal(account.subtotal),discountTotal:decimal(account.discount_total),taxTotal:decimal(account.tax_total),servicePercentage:decimal(account.service_percentage),serviceTotal:decimal(account.service_total),total:decimal(account.total),paidTotal:paid,remainingBalance:compareDecimals(decimal(account.total),paid)<0?"0":subtractDecimals(decimal(account.total),paid),hasPayments:payments.some((p)=>p.status==="REGISTERED"),discounts:discounts.map((discount)=>({id:discount.id,name:discount.name_snapshot,type:discount.discount_type,value:decimal(discount.value),appliedAmount:decimal(discount.applied_amount),createdAt:instant(discount.created_at)})),splits:[],payments:payments.map(paymentSnapshot)};
  }

  async billing(actor: BillingActor, accountId: string): Promise<BillingSnapshot> { return this.billingSnapshot(this.pool,accountId,actor.branchId); }

  private async lockedCommercialAccount(client: PoolClient, actor: BillingActor, accountId: string, expectedVersion: number): Promise<any> {
    const account=await one<any>(client,"SELECT * FROM accounts WHERE id=$1 AND branch_id=$2 FOR UPDATE",[accountId,actor.branchId]);
    if(!account) throw new CatalogRuleViolation("Account was not found in the current branch");
    if(account.status!=="OPEN") throw new CatalogRuleViolation("Only an open account can be modified");
    if(Number(account.version)!==expectedVersion) throw new CatalogConflict();
    if(account.settlement_mode!=="DIRECT") throw new CatalogRuleViolation("Commercial changes for split settlement are not available yet");
    const payment=await one(client,"SELECT id FROM payments WHERE account_id=$1 AND status='REGISTERED' LIMIT 1 FOR SHARE",[accountId]);
    if(payment) throw new CatalogRuleViolation("Commercial changes are not allowed after the first payment");
    return account;
  }

  async applyAccountDiscount(actor: BillingActor, operationId: string, accountId: string, input: ApplyAccountDiscountRequest): Promise<BillingSnapshot> {
    return this.command(actor,operationId,"accounts.apply_discount",{accountId,...input},async(client,companyId)=>{
      const account=await this.lockedCommercialAccount(client,actor,accountId,input.expectedVersion);
      const items=(await client.query<{line_subtotal:string;discount_total:string}>("SELECT line_subtotal,discount_total FROM account_items WHERE account_id=$1 AND status='CONFIRMED' ORDER BY id FOR SHARE",[accountId])).rows;
      const existing=(await one<{applied:string}>(client,"SELECT COALESCE(SUM(applied_amount),0)::text applied FROM account_discounts WHERE account_id=$1",[accountId]))?.applied??"0";
      const itemNet=items.reduce((sum,item)=>addDecimals(sum,subtractDecimals(decimal(item.line_subtotal),decimal(item.discount_total))),"0");
      const available=subtractDecimals(itemNet,existing);
      const applied=input.type==="PERCENTAGE"?divideDecimals(multiplyDecimals(available,input.value),"100",2):input.value;
      if(compareDecimals(applied,available)>0) throw new CatalogRuleViolation("Discount amount exceeds the account commercial subtotal");
      const id=uuidv7(); const discount=await one<any>(client,"INSERT INTO account_discounts(id,account_id,name_snapshot,discount_type,value,applied_amount,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[id,accountId,input.name,input.type,input.value,applied,actor.userId]);
      if(!discount) throw new Error("Account discount insert did not return a row");
      await recalculateAccountTotals(client,accountId);
      const result=await this.billingSnapshot(client,accountId,actor.branchId);
      await this.audit(client,actor,companyId,"account.discount_applied","account_discount",id,{accountVersion:Number(account.version)},{discount:{id,name:input.name,type:input.type,value:input.value,appliedAmount:applied},billing:result});
      await this.outbox(client,actor,operationId,"accounts.apply_discount","account",accountId,result); return result;
    });
  }

  async configureService(actor: BillingActor, operationId: string, accountId: string, input: ConfigureServiceRequest): Promise<BillingSnapshot> {
    return this.command(actor,operationId,"accounts.configure_service",{accountId,...input},async(client,companyId)=>{
      const account=await this.lockedCommercialAccount(client,actor,accountId,input.expectedVersion);
      await recalculateAccountTotals(client,accountId,input.percentage);
      const result=await this.billingSnapshot(client,accountId,actor.branchId);
      await this.audit(client,actor,companyId,"account.service_configured","account",accountId,{accountVersion:Number(account.version),servicePercentage:decimal(account.service_percentage)},{servicePercentage:input.percentage,billing:result});
      await this.outbox(client,actor,operationId,"accounts.configure_service","account",accountId,result); return result;
    });
  }
  async openCashSession(actor: BillingActor, operationId: string, input: OpenCashSessionRequest): Promise<CashSession> {
    return this.command(actor,operationId,"cash_sessions.open",input,async(client,companyId)=>{
      const register=await one<{id:string}>(client,"SELECT id FROM cash_registers WHERE id=$1 AND branch_id=$2 AND active FOR UPDATE",[input.cashRegisterId,actor.branchId]);
      if(!register) throw new CatalogRuleViolation("Active cash register was not found in the current branch");
      const existing=await one(client,"SELECT 1 FROM cash_sessions WHERE cash_register_id=$1 AND status='OPEN' FOR UPDATE",[register.id]);
      if(existing) throw new CatalogConflict("The cash register already has an open session");
      const id=uuidv7(); const row=await one<any>(client,"INSERT INTO cash_sessions(id,cash_register_id,opened_by_user_id,opening_amount,notes) VALUES($1,$2,$3,$4,$5) RETURNING *",[id,register.id,actor.userId,input.openingAmount,input.notes??null]);
      if(!row) throw new Error("Cash session insert did not return a row"); const result=cashSessionSnapshot(row);
      await this.audit(client,actor,companyId,"cash_session.opened","cash_session",id,null,result); await this.outbox(client,actor,operationId,"cash_sessions.open","cash_session",id,result); return result;
    });
  }

  async adjustCashSession(actor: BillingActor, operationId: string, sessionId: string, input: CashAdjustmentRequest): Promise<CashSession> {
    return this.command(actor,operationId,"cash_sessions.adjust",{sessionId,...input},async(client,companyId)=>{
      const session=await one<any>(client,"SELECT cs.* FROM cash_sessions cs JOIN cash_registers cr ON cr.id=cs.cash_register_id WHERE cs.id=$1 AND cr.branch_id=$2 FOR UPDATE",[sessionId,actor.branchId]);
      if(!session||session.status!=="OPEN")throw new CatalogRuleViolation("Cash session must be open in the current branch"); if(Number(session.version)!==input.expectedVersion)throw new CatalogConflict();
      const movementId=uuidv7(); await client.query("INSERT INTO cash_movements(id,cash_session_id,movement_type,amount,adjustment_direction,description,created_by_user_id,operation_id) VALUES($1,$2,'ADJUSTMENT',$3,$4,$5,$6,$7)",[movementId,sessionId,input.amount,input.direction,input.reason,actor.userId,operationId]);
      const row=await one<any>(client,"UPDATE cash_sessions SET version=version+1 WHERE id=$1 RETURNING *",[sessionId]); if(!row)throw new Error("Cash session update did not return a row"); const result=cashSessionSnapshot(row);
      await this.audit(client,actor,companyId,"cash_session.adjusted","cash_movement",movementId,null,{direction:input.direction,amount:input.amount,reason:input.reason}); await this.outbox(client,actor,operationId,"cash_sessions.adjust","cash_session",sessionId,{movementId,result}); return result;
    });
  }

  async closeCashSession(actor: BillingActor, operationId: string, sessionId: string, input: CloseCashSessionRequest): Promise<CashSession> {
    return this.command(actor,operationId,"cash_sessions.close",{sessionId,...input},async(client,companyId)=>{
      const session=await one<any>(client,"SELECT cs.*,cr.name register_name FROM cash_sessions cs JOIN cash_registers cr ON cr.id=cs.cash_register_id WHERE cs.id=$1 AND cr.branch_id=$2 FOR UPDATE",[sessionId,actor.branchId]);
      if(!session||session.status!=="OPEN")throw new CatalogRuleViolation("Cash session must be open in the current branch"); if(Number(session.version)!==input.expectedVersion)throw new CatalogConflict();
      const movements=await one<any>(client,`SELECT COALESCE(SUM(CASE WHEN movement_type IN ('SALE','DEPOSIT') THEN amount WHEN movement_type IN ('PURCHASE','EXPENSE','WITHDRAWAL','EMPLOYEE_PAYMENT') THEN -amount WHEN movement_type='ADJUSTMENT' AND adjustment_direction='INCREASE' THEN amount WHEN movement_type='ADJUSTMENT' THEN -amount ELSE 0 END),0)::text net FROM cash_movements WHERE cash_session_id=$1`,[sessionId]);
      const expected=addDecimals(decimal(session.opening_amount),movements?.net??"0"); const difference=subtractDecimals(input.countedCash,expected); const snapshot={cashSessionId:sessionId,cashRegister:session.register_name,openedAt:instant(session.opened_at),closedAt:new Date().toISOString(),openingAmount:decimal(session.opening_amount),expectedCash:expected,countedCash:input.countedCash,difference};
      const row=await one<any>(client,"UPDATE cash_sessions SET status='CLOSED',closed_at=NOW(),closed_by_user_id=$2,expected_cash=$3,counted_cash=$4,difference=$5,notes=COALESCE($6,notes),close_snapshot=$7,version=version+1 WHERE id=$1 RETURNING *",[sessionId,actor.userId,expected,input.countedCash,difference,input.notes??null,snapshot]); if(!row)throw new Error("Cash close update did not return a row"); const result=cashSessionSnapshot(row);
      if(input.printReceipt){const printer=await one<{id:string}>(client,"SELECT id FROM printers WHERE branch_id=$1 AND printer_type='CASH' AND active ORDER BY name LIMIT 1 FOR SHARE",[actor.branchId]);await client.query("INSERT INTO print_jobs(id,branch_id,printer_type,printer_id,document_type,reference_type,reference_id,payload,status,error_message) VALUES($1,$2,'CASH',$3,'DAY_CLOSE','CASH_SESSION',$4,$5,$6,$7)",[uuidv7(),actor.branchId,printer?.id??null,sessionId,snapshot,printer?"PENDING":"FAILED",printer?null:"No active cash printer is configured"]);}
      await this.audit(client,actor,companyId,"cash_session.closed","cash_session",sessionId,null,snapshot); await this.outbox(client,actor,operationId,"cash_sessions.close","cash_session",sessionId,snapshot); return result;
    });
  }
  async registerPayment(actor: BillingActor, operationId: string, accountId: string, input: RegisterPaymentRequest): Promise<PaymentSnapshot> {
    return this.command(actor,operationId,"payments.register",{accountId,...input},async(client,companyId)=>{
      if(input.accountSplitId) throw new CatalogRuleViolation("Split payments will be enabled after split finalization is implemented");
      const account=await one<any>(client,"SELECT * FROM accounts WHERE id=$1 AND branch_id=$2 FOR UPDATE",[accountId,actor.branchId]);
      if(!account) throw new CatalogRuleViolation("Account was not found in the current branch");
      if(account.status!=="OPEN") throw new CatalogRuleViolation("Only an open account can receive payments");
      if(Number(account.version)!==input.expectedVersion) throw new CatalogConflict();
      if(account.settlement_mode!=="DIRECT") throw new CatalogRuleViolation("Direct payments are not allowed for split settlement");
      const method=await one<any>(client,"SELECT id,name,type FROM payment_methods WHERE id=$1 AND branch_id=$2 AND active FOR SHARE",[input.paymentMethodId,actor.branchId]);
      if(!method) throw new CatalogRuleViolation("Active payment method was not found in the current branch");
      // Lock individual registered payments before summing them. PostgreSQL does not
      // permit FOR UPDATE on an aggregate query, and this keeps the balance check
      // explicit should this lock ever be relied on independently of the account lock.
      await client.query("SELECT id FROM payments WHERE account_id=$1 AND status='REGISTERED' FOR UPDATE",[accountId]);
      const prior=await one<{paid:string}>(client,"SELECT COALESCE(SUM(amount),0)::text paid FROM payments WHERE account_id=$1 AND status='REGISTERED'",[accountId]);
      const remaining=subtractDecimals(decimal(account.total),prior?.paid??"0");
      if(compareDecimals(input.amountApplied,remaining)>0) throw new CatalogRuleViolation("Payment amount exceeds the remaining balance");
      if(method.type!=="CASH" && input.cashReceived!==undefined) throw new CatalogRuleViolation("cashReceived is only valid for CASH payments");
      if(method.type==="CASH" && (!input.cashSessionId || !input.cashReceived || compareDecimals(input.cashReceived,input.amountApplied)<0)) throw new CatalogRuleViolation("Cash payment requires an open session and sufficient cash received");
      let session: any=null; if(input.cashSessionId){session=await one<any>(client,`SELECT cs.* FROM cash_sessions cs JOIN cash_registers cr ON cr.id=cs.cash_register_id WHERE cs.id=$1 AND cr.branch_id=$2 FOR UPDATE`,[input.cashSessionId,actor.branchId]);if(!session||session.status!=="OPEN")throw new CatalogRuleViolation("Cash session must be open in the current branch");}
      const id=uuidv7(); const cashReceived=method.type==="CASH"?input.cashReceived!:null; const change=cashReceived?subtractDecimals(cashReceived,input.amountApplied):"0";
      const payment=await one<any>(client,`INSERT INTO payments(id,account_id,payment_method_id,amount,reference,received_by_user_id,notes,payment_method_name_snapshot,payment_method_type_snapshot,cash_session_id,cash_received,change_amount,operation_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[id,accountId,method.id,input.amountApplied,input.reference??null,actor.userId,input.notes??null,method.name,method.type,session?.id??null,cashReceived,change,operationId]);
      if(!payment) throw new Error("Payment insert did not return a row");
      if(method.type==="CASH") await client.query("INSERT INTO cash_movements(id,cash_session_id,movement_type,amount,payment_id,description,created_by_user_id,operation_id) VALUES($1,$2,'SALE',$3,$4,$5,$6,$7)",[uuidv7(),session.id,input.amountApplied,id,`Payment ${id}`,actor.userId,operationId]);
      const after=subtractDecimals(remaining,input.amountApplied); if(compareDecimals(after,"0")===0){await client.query("UPDATE accounts SET status='PAID',closed_at=NOW() WHERE id=$1",[accountId]);if(account.table_id)await client.query("UPDATE restaurant_tables SET status='AVAILABLE' WHERE id=$1",[account.table_id]);}else await client.query("UPDATE accounts SET updated_at=NOW() WHERE id=$1",[accountId]);
      const result=paymentSnapshot({...payment,method_name:method.name,method_type:method.type});
      if(input.printReceipt){const printer=await one<{id:string}>(client,"SELECT id FROM printers WHERE branch_id=$1 AND printer_type='PAYMENT' AND active ORDER BY name LIMIT 1 FOR SHARE",[actor.branchId]);await client.query("INSERT INTO print_jobs(id,branch_id,printer_type,printer_id,document_type,reference_type,reference_id,payload,status,error_message) VALUES($1,$2,'PAYMENT',$3,'PAYMENT_RECEIPT','PAYMENT',$4,$5,$6,$7)",[uuidv7(),actor.branchId,printer?.id??null,id,{payment:result,accountId},printer?"PENDING":"FAILED",printer?null:"No active payment printer is configured"]);}
      await this.audit(client,actor,companyId,"payment.registered","payment",id,{remainingBefore:remaining},{payment:result,remainingAfter:after}); await this.outbox(client,actor,operationId,"payments.register","payment",id,{payment:result,remainingAfter:after}); return result;
    });
  }
}

function paymentSnapshot(row:any):PaymentSnapshot{return{id:row.id,accountId:row.account_id,accountSplitId:row.account_split_id??null,paymentMethodId:row.payment_method_id,paymentMethodName:row.payment_method_name_snapshot||row.method_name,paymentMethodType:row.payment_method_type_snapshot||row.method_type,status:row.status,amountApplied:decimal(row.amount),cashReceived:row.cash_received===null?null:decimal(row.cash_received),changeAmount:decimal(row.change_amount),reference:row.reference,notes:row.notes,cashSessionId:row.cash_session_id??null,receivedByUserId:row.received_by_user_id,receivedAt:instant(row.received_at)};}
function cashSessionSnapshot(row:any):CashSession{return{id:row.id,cashRegisterId:row.cash_register_id,status:row.status,openingAmount:decimal(row.opening_amount),expectedCash:row.expected_cash===null?null:decimal(row.expected_cash),countedCash:row.counted_cash===null?null:decimal(row.counted_cash),difference:row.difference===null?null:decimal(row.difference),openedByUserId:row.opened_by_user_id,openedAt:instant(row.opened_at),closedAt:row.closed_at?instant(row.closed_at):null,version:Number(row.version)};}
