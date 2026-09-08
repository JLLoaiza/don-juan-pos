import { describe, expect, it, vi } from "vitest";
import { buildApi } from "./app.js";
import type { AuthService } from "./auth.js";

const branch={id:"00000000-0000-4000-8000-000000000003",name:"Centro",code:"CENTRO",settings:{}};
const context={user:{id:"00000000-0000-4000-8000-000000000001",displayName:"Admin"},branches:[branch],activeBranch:branch,permissions:["suppliers.view","suppliers.create","suppliers.update","purchases.view","purchases.confirm","purchases.void","expenses.view","expenses.create","expenses.void"]};
const auth:AuthService={login:async()=>{throw new Error("not used");},refresh:async()=>{throw new Error("not used");},context:async()=>context,setActiveBranch:async()=>context};
const supplier={id:"00000000-0000-4000-8000-000000000010",name:"Proveedor",taxId:null,phone:null,email:null,address:null,notes:null,active:true};
const purchase={id:"00000000-0000-4000-8000-000000000011",supplierId:null,documentNumber:null,purchaseDate:"2026-09-07T00:00:00.000Z",subtotal:"10.00",taxTotal:"0.00",discountTotal:"0.00",total:"10.00",paymentMethodId:null,paymentMethodType:null,cashSessionId:null,status:"CONFIRMED",notes:null,createdByUserId:context.user.id,createdAt:"2026-09-07T00:00:00.000Z",items:[{id:"00000000-0000-4000-8000-000000000012",inventoryItemId:"00000000-0000-4000-8000-000000000013",quantity:"1",unitCost:"10",subtotal:"10.00"}]};
const expense={id:"00000000-0000-4000-8000-000000000014",supplierId:null,concept:"Internet",amount:"10",expenseDate:"2026-09-07T00:00:00.000Z",paymentMethodId:null,paymentMethodType:null,cashSessionId:null,status:"CONFIRMED",notes:null,createdByUserId:context.user.id,createdAt:"2026-09-07T00:00:00.000Z"};
const procurement={suppliers:vi.fn(async()=>({suppliers:[supplier]})),createSupplier:vi.fn(async()=>supplier),updateSupplier:vi.fn(async()=>supplier),purchases:vi.fn(async()=>({purchases:[purchase]})),confirmPurchase:vi.fn(async()=>purchase),expenses:vi.fn(async()=>({expenses:[expense]})),createExpense:vi.fn(async()=>expense),voidPurchase:vi.fn(async()=>purchase),voidExpense:vi.fn(async()=>expense)};

describe("procurement HTTP contracts",()=>{
  it("derives branch and rejects missing idempotency keys",async()=>{
    const app=buildApi({database:{check:async()=>undefined},auth,procurement:procurement as never});
    const missing=await app.inject({method:"POST",url:"/purchases",headers:{authorization:"Bearer token"},payload:{items:[{inventoryItemId:purchase.items[0]!.inventoryItemId,quantity:"1",unitCost:"10"}]}});
    const response=await app.inject({method:"POST",url:"/purchases",headers:{authorization:"Bearer token","idempotency-key":"00000000-0000-4000-8000-000000000099"},payload:{companyId:"00000000-0000-4000-8000-000000000100",items:[{inventoryItemId:purchase.items[0]!.inventoryItemId,quantity:"1",unitCost:"10"}]}});
    await app.close(); expect(missing.statusCode).toBe(400);expect(response.statusCode).toBe(200);expect(procurement.confirmPurchase).toHaveBeenCalledWith({userId:context.user.id,branchId:branch.id},"00000000-0000-4000-8000-000000000099",expect.not.objectContaining({companyId:expect.anything()}));
  });
  it("keeps suppliers, purchases and expenses behind dedicated permissions",async()=>{
    const app=buildApi({database:{check:async()=>undefined},auth,procurement:procurement as never});
    expect((await app.inject({method:"GET",url:"/suppliers",headers:{authorization:"Bearer token"}})).statusCode).toBe(200);
    expect((await app.inject({method:"GET",url:"/purchases",headers:{authorization:"Bearer token"}})).statusCode).toBe(200);
    expect((await app.inject({method:"GET",url:"/expenses",headers:{authorization:"Bearer token"}})).statusCode).toBe(200);await app.close();
    expect(procurement.suppliers).toHaveBeenCalledWith({userId:context.user.id,branchId:branch.id});
  });
});
