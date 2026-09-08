import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { ProcurementService } from "./procurement.js";

const databaseUrl=process.env.DATABASE_URL_TEST;
const describeIntegration=databaseUrl?describe:describe.skip;

describeIntegration("procurement transaction",()=>{
  let pool:Pool;let service:ProcurementService;
  const companyId=randomUUID(),branchId=randomUUID(),foreignBranchId=randomUUID(),userId=randomUUID();
  const actor={userId,branchId};let inventoryId="",foreignInventoryId="",supplierId="",cashMethodId="",sessionId="",purchaseId="";
  beforeAll(async()=>{
    pool=new Pool({connectionString:databaseUrl});service=new ProcurementService(pool);
    await pool.query("INSERT INTO companies(id,name,currency,timezone) VALUES($1,$2,'COP','America/Bogota')",[companyId,`Procurement ${companyId}`]);
    await pool.query("INSERT INTO branches(id,company_id,name,code) VALUES($1,$2,'Procurement',$3),($4,$2,'Foreign',$5)",[branchId,companyId,`P-${companyId}`,foreignBranchId,`X-${companyId}`]);
    await pool.query("INSERT INTO users(id,company_id,username,password_hash,display_name) VALUES($1,$2,$3,crypt('x',gen_salt('bf',4)),'Procurement')",[userId,companyId,`procurement-${companyId}`]);
    await pool.query("INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2)",[userId,branchId]);
    inventoryId=randomUUID();foreignInventoryId=randomUUID();
    await pool.query("INSERT INTO inventory_items(id,branch_id,name,unit,unit_cost,current_stock,minimum_stock) VALUES($1,$2,'Rice','G',10,10,0),($3,$4,'Foreign rice','G',1,1,0)",[inventoryId,branchId,foreignInventoryId,foreignBranchId]);
    const productId=randomUUID();await pool.query("INSERT INTO products(id,branch_id,name,sale_price,calculated_cost) VALUES($1,$2,'Rice bowl',20,10)",[productId,branchId]);await pool.query("INSERT INTO product_components(id,product_id,component_type,inventory_item_id,quantity) VALUES($1,$2,'INVENTORY_ITEM',$3,1)",[randomUUID(),productId,inventoryId]);
    supplierId=(await service.createSupplier(actor,randomUUID(),{name:"Rice supplier"})).id;
    const registerId=randomUUID();cashMethodId=randomUUID();await pool.query("INSERT INTO cash_registers(id,branch_id,name) VALUES($1,$2,'Principal')",[registerId,branchId]);await pool.query("INSERT INTO payment_methods(id,branch_id,name,type) VALUES($1,$2,'Cash','CASH')",[cashMethodId,branchId]);sessionId=randomUUID();await pool.query("INSERT INTO cash_sessions(id,cash_register_id,opened_by_user_id,opening_amount) VALUES($1,$2,$3,100)",[sessionId,registerId,userId]);
  });
  it("confirms one purchase atomically: Kardex, weighted cost, derived cost and cash movement",async()=>{
    const operationId=randomUUID();const input={supplierId,documentNumber:"P-1",paymentMethodId:cashMethodId,cashSessionId:sessionId,items:[{inventoryItemId:inventoryId,quantity:"5",unitCost:"20"}]};
    const result=await service.confirmPurchase(actor,operationId,input);const replay=await service.confirmPurchase(actor,operationId,input);purchaseId=result.id;expect(replay).toEqual(result);expect(result).toMatchObject({subtotal:"100.00",total:"100.00",paymentMethodType:"CASH"});
    const state=await pool.query("SELECT (SELECT current_stock::text FROM inventory_items WHERE id=$1) stock,(SELECT unit_cost::text FROM inventory_items WHERE id=$1) cost,(SELECT calculated_cost::text FROM products WHERE branch_id=$2) product_cost,(SELECT count(*)::int FROM inventory_movements WHERE purchase_item_id=$3) kardex,(SELECT amount::text FROM cash_movements WHERE purchase_id=$4) cash",[inventoryId,branchId,result.items[0]!.id,result.id]);
    expect(state.rows[0]).toEqual({stock:"15.000000",cost:"13.333333",product_cost:"13.333333",kardex:1,cash:"100.00"});
  });
  it("records cash expenses without changing inventory and blocks a foreign inventory item",async()=>{
    const before=await pool.query<{current_stock:string}>("SELECT current_stock::text FROM inventory_items WHERE id=$1",[inventoryId]);
    const expense=await service.createExpense(actor,randomUUID(),{concept:"Electricity",amount:"25",paymentMethodId:cashMethodId,cashSessionId:sessionId});
    const after=await pool.query<{current_stock:string}>("SELECT current_stock::text FROM inventory_items WHERE id=$1",[inventoryId]);
    expect(after.rows[0]?.current_stock).toBe(before.rows[0]?.current_stock);expect(expense.status).toBe("CONFIRMED");const voidedExpense=await service.voidExpense(actor,randomUUID(),expense.id,{reason:"Duplicate"});const voidedPurchase=await service.voidPurchase(actor,randomUUID(),purchaseId,{reason:"Supplier cancelled"});expect(voidedExpense.status).toBe("VOID");expect(voidedPurchase.status).toBe("VOID");const restored=await pool.query("SELECT current_stock::text stock,unit_cost::text cost FROM inventory_items WHERE id=$1",[inventoryId]);expect(restored.rows[0]).toEqual({stock:"10.000000",cost:"10.000000"});
    await expect(service.confirmPurchase(actor,randomUUID(),{items:[{inventoryItemId:foreignInventoryId,quantity:"1",unitCost:"1"}]})).rejects.toThrow("Every purchase item");
  });
});
