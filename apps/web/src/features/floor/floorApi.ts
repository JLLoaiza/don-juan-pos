import {
  AccountSnapshotSchema,
  ChangeRestaurantTableStatusResponseSchema,
  ConfirmConsumptionResponseSchema,
  DiningAreaSchema,
  FloorSnapshotSchema,
  RestaurantTableSchema,
  type AccountSnapshot,
  type ChangeRestaurantTableStatusRequest,
  type ConfirmConsumptionRequest,
  type ConfirmConsumptionResponse,
  type CreateDiningAreaRequest,
  type CreateRestaurantTableRequest,
  type DiningArea,
  type FloorSnapshot,
  type OpenAccountRequest,
  type RestaurantTable,
} from "@don-juan/contracts";
import type { AuthContextValue } from "../auth/AuthProvider";

type AuthClient = Pick<AuthContextValue, "authGet" | "authPost">;

function idempotencyHeaders(): Record<string, string> {
  return { "idempotency-key": crypto.randomUUID() };
}

export interface FloorApi {
  getFloor(): Promise<FloorSnapshot>;
  getAccount(id: string): Promise<AccountSnapshot>;
  openAccount(input: OpenAccountRequest): Promise<AccountSnapshot>;
  confirmConsumption(accountId: string, input: ConfirmConsumptionRequest): Promise<ConfirmConsumptionResponse>;
  createDiningArea(input: CreateDiningAreaRequest): Promise<DiningArea>;
  createRestaurantTable(input: CreateRestaurantTableRequest): Promise<RestaurantTable>;
  changeTableStatus(tableId: string, input: ChangeRestaurantTableStatusRequest): Promise<RestaurantTable>;
}

export function createFloorApi(auth: AuthClient): FloorApi {
  return {
    getFloor: () => auth.authGet("/floor", FloorSnapshotSchema),
    getAccount: (id) => auth.authGet(`/accounts/${id}`, AccountSnapshotSchema),
    openAccount: (input) => auth.authPost("/accounts", AccountSnapshotSchema, input, idempotencyHeaders()),
    confirmConsumption: (accountId, input) =>
      auth.authPost(`/accounts/${accountId}/confirm-consumption`, ConfirmConsumptionResponseSchema, input, idempotencyHeaders()),
    createDiningArea: (input) => auth.authPost("/dining-areas", DiningAreaSchema, input, idempotencyHeaders()),
    createRestaurantTable: (input) => auth.authPost("/restaurant-tables", RestaurantTableSchema, input, idempotencyHeaders()),
    changeTableStatus: (tableId, input) =>
      auth.authPost(`/restaurant-tables/${tableId}/status`, ChangeRestaurantTableStatusResponseSchema, input, idempotencyHeaders()),
  };
}
