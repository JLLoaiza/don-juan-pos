import { describe, expect, it, vi } from "vitest";
import { createProcurementApi } from "./procurementApi";

const ID = "11111111-1111-7111-8111-111111111111";
const purchase = { id: ID, supplierId: null, documentNumber: null, purchaseDate: "2026-09-07", subtotal: "10", taxTotal: "0", discountTotal: "0", total: "10", paymentMethodId: null, cashSessionId: null, status: "CONFIRMED" as const, notes: null, createdAt: "2026-09-07T12:00:00.000Z", voidedAt: null };
const supplier = { id: ID, name: "Proveedor", taxId: null, phone: null, email: null, address: null, notes: null, active: true, version: 1 };

describe("procurementApi", () => {
  it("uses real procurement routes and adds an idempotency key without client tenancy fields", async () => {
    const auth = { authGet: vi.fn(), authPost: vi.fn().mockResolvedValue(purchase), authPut: vi.fn().mockResolvedValue(supplier) };
    const api = createProcurementApi(auth as never);
    await api.confirmPurchase({ supplierId: null, documentNumber: null, purchaseDate: "2026-09-07", taxTotal: "0", discountTotal: "0", paymentMethodId: null, cashSessionId: null, notes: null, items: [{ inventoryItemId: ID, quantity: "1", unitCost: "10" }] });
    expect(auth.authPost).toHaveBeenCalledWith("/purchases", expect.anything(), expect.objectContaining({ items: expect.any(Array) }), expect.objectContaining({ "idempotency-key": expect.any(String) }));
    const body = auth.authPost.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(body).not.toHaveProperty("companyId"); expect(body).not.toHaveProperty("branchId");
  });

  it("uses compensating void routes with a separate idempotency key", async () => {
    const auth = { authGet: vi.fn(), authPost: vi.fn().mockResolvedValue(purchase), authPut: vi.fn() };
    const api = createProcurementApi(auth as never);
    await api.voidPurchase(ID, { reason: "Documento duplicado" });
    expect(auth.authPost).toHaveBeenCalledWith(`/purchases/${ID}/void`, expect.anything(), { reason: "Documento duplicado" }, expect.objectContaining({ "idempotency-key": expect.any(String) }));
  });
});
