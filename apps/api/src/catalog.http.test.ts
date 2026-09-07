import { describe, expect, it, vi } from "vitest";
import { buildApi } from "./app.js";
import type { AuthService } from "./auth.js";

const active = { id: "00000000-0000-4000-8000-000000000003", name: "Centro", code: "CENTRO", settings: {} };
const context = { user:{id:"00000000-0000-4000-8000-000000000001",displayName:"Admin"},branches:[active],activeBranch:active,permissions:["products.view","inventory.view","accompaniments.view","inventory.create"] };
const auth: AuthService = { login:async()=>{throw new Error("not used");}, refresh:async()=>{throw new Error("not used");}, context:async()=>context, setActiveBranch:async()=>context };
const catalog = { snapshot: vi.fn(async()=>({inventoryItems:[],accompaniments:[],products:[]})), createInventoryItem:vi.fn(async()=>({id:"00000000-0000-4000-8000-000000000099",name:"Beef",unit:"G",unitCost:"2.500000",currentStock:"0",minimumStock:"0",stockState:"OUT_OF_STOCK",notes:null,active:true,version:1})) };

describe("catalog HTTP authorization",()=>{
  it("requires bearer authentication",async()=>{const app=buildApi({database:{check:async()=>undefined},auth,catalog:catalog as never});const response=await app.inject({method:"GET",url:"/catalog"});await app.close();expect(response.statusCode).toBe(401);});
  it("requires an idempotency key for a catalog command",async()=>{const app=buildApi({database:{check:async()=>undefined},auth,catalog:catalog as never});const response=await app.inject({method:"POST",url:"/catalog/inventory-items",headers:{authorization:"Bearer token"},payload:{name:"Beef",unit:"G",initialStock:"0",initialUnitCost:"0",minimumStock:"0"}});await app.close();expect(response.statusCode).toBe(400);expect(catalog.createInventoryItem).not.toHaveBeenCalled();});
  it("derives the branch from auth and never accepts a client company",async()=>{const app=buildApi({database:{check:async()=>undefined},auth,catalog:catalog as never});const response=await app.inject({method:"POST",url:"/catalog/inventory-items",headers:{authorization:"Bearer token","idempotency-key":"00000000-0000-4000-8000-000000000010"},payload:{name:"Beef",unit:"G",initialStock:"0",initialUnitCost:"0",minimumStock:"0",companyId:"00000000-0000-4000-8000-000000000011"}});await app.close();expect(response.statusCode).toBe(200);expect(catalog.createInventoryItem).toHaveBeenLastCalledWith({userId:context.user.id,branchId:active.id},"00000000-0000-4000-8000-000000000010",expect.objectContaining({name:"Beef"}));});
});
