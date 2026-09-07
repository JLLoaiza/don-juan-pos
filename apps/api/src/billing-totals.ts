import { addDecimals, compareDecimals, divideDecimals, multiplyDecimals, subtractDecimals } from "@don-juan/domain";
import type { PoolClient } from "pg";

const decimal = (value: unknown) => String(value);
const nonNegative = (value: string) => compareDecimals(value, "0") < 0 ? "0" : value;

/**
 * Recalculates the persisted account totals from immutable item snapshots and
 * recorded account-discount snapshots. Item snapshots are never rewritten:
 * account-level discount tax allocation is derived deterministically here.
 */
export async function recalculateAccountTotals(client: PoolClient, accountId: string, requestedServicePercentage?: string): Promise<{ subtotal: string; discountTotal: string; taxTotal: string; serviceTotal: string; total: string }> {
  const accountResult = await client.query<{ service_percentage: string }>("SELECT service_percentage FROM accounts WHERE id=$1 FOR UPDATE", [accountId]);
  const account = accountResult.rows[0];
  if (!account) throw new Error("Account disappeared during totals recalculation");
  const items = (await client.query<{ id: string; line_subtotal: string; discount_total: string; tax_rate_snapshot: string }>(
    "SELECT id,line_subtotal,discount_total,tax_rate_snapshot FROM account_items WHERE account_id=$1 AND status='CONFIRMED' ORDER BY id FOR SHARE", [accountId]
  )).rows;
  const discounts = (await client.query<{ applied_amount: string }>("SELECT applied_amount FROM account_discounts WHERE account_id=$1 ORDER BY created_at,id FOR SHARE", [accountId])).rows;
  const subtotal = items.reduce((sum, item) => addDecimals(sum, decimal(item.line_subtotal)), "0");
  const itemDiscountTotal = items.reduce((sum, item) => addDecimals(sum, decimal(item.discount_total)), "0");
  const accountDiscountTotal = discounts.reduce((sum, discount) => addDecimals(sum, decimal(discount.applied_amount)), "0");
  const discountTotal = addDecimals(itemDiscountTotal, accountDiscountTotal);
  const discountedSubtotal = nonNegative(subtractDecimals(subtotal, discountTotal));
  const itemNetSubtotal = nonNegative(subtractDecimals(subtotal, itemDiscountTotal));
  if (compareDecimals(accountDiscountTotal, itemNetSubtotal) > 0) throw new Error("Account discount snapshots exceed the commercial subtotal");

  let allocated = "0";
  let taxTotal = "0";
  for (const [index, item] of items.entries()) {
    const itemNet = nonNegative(subtractDecimals(decimal(item.line_subtotal), decimal(item.discount_total)));
    const remainingDiscount = subtractDecimals(accountDiscountTotal, allocated);
    const allocation = index === items.length - 1
      ? remainingDiscount
      : compareDecimals(accountDiscountTotal,"0")===0 ? "0" : divideDecimals(multiplyDecimals(accountDiscountTotal, itemNet), itemNetSubtotal, 2);
    const safeAllocation = compareDecimals(allocation, itemNet) > 0 ? itemNet : allocation;
    allocated = addDecimals(allocated, safeAllocation);
    const taxableBase = nonNegative(subtractDecimals(itemNet, safeAllocation));
    taxTotal = addDecimals(taxTotal, divideDecimals(multiplyDecimals(taxableBase, decimal(item.tax_rate_snapshot)), "100", 2));
  }
  const servicePercentage = requestedServicePercentage ?? decimal(account.service_percentage);
  const serviceTotal = divideDecimals(multiplyDecimals(discountedSubtotal, servicePercentage), "100", 2);
  const total = addDecimals(addDecimals(discountedSubtotal, taxTotal), serviceTotal);
  await client.query("UPDATE accounts SET subtotal=$2,discount_total=$3,tax_total=$4,service_total=$5,total=$6,service_percentage=$7 WHERE id=$1", [accountId, subtotal, discountTotal, taxTotal, serviceTotal, total, servicePercentage]);
  return { subtotal, discountTotal, taxTotal, serviceTotal, total };
}
