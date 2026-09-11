import { describe, expect, it } from "vitest";
import { ChangeRestaurantTableStatusRequestSchema, RestaurantTableSchema } from "./floor.js";

describe("restaurant table status contracts", () => {
  const table = {
    id: "00000000-0000-4000-8000-000000000001",
    diningAreaId: "00000000-0000-4000-8000-000000000002",
    name: "Mesa 1", capacity: 4, status: "OCCUPIED", active: true, openAccountId: null,
    version: 3, canMarkAvailable: true, availabilityBlocker: null,
  };

  it("accepts the additive read model", () => {
    expect(RestaurantTableSchema.parse(table)).toEqual(table);
  });

  it("validates a versioned status intent and strips tenant-controlled fields", () => {
    expect(ChangeRestaurantTableStatusRequestSchema.parse({ targetStatus: "AVAILABLE", expectedVersion: 3, companyId: table.id, branchId: table.id, userId: table.id }))
      .toEqual({ targetStatus: "AVAILABLE", expectedVersion: 3 });
    expect(() => ChangeRestaurantTableStatusRequestSchema.parse({ targetStatus: "RESERVED", expectedVersion: 3 })).toThrow();
    expect(() => ChangeRestaurantTableStatusRequestSchema.parse({ targetStatus: "AVAILABLE", expectedVersion: 0 })).toThrow();
  });
});
