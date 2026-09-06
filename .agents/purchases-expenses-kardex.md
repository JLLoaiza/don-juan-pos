# Purchases, Expenses and Inventory Kardex Module

## Purpose

This document defines the business rules, domain model, transactional behavior and expected implementation for:

- Suppliers
- Inventory purchases
- Purchase items
- Purchase confirmation
- Purchase correction and voiding
- Operational expenses
- Expense payments
- Inventory movements
- Inventory Kardex
- Manual inventory adjustments
- Inventory corrections
- Weighted-average inventory costing
- Cash integration
- Audit requirements
- Offline synchronization considerations

This document must be treated as authoritative context when implementing or modifying functionality related to purchasing, expenses or inventory movements.

The inventory and costing rules defined in the Inventory, Catalog and Costing module remain authoritative and must be respected.

Do not reinterpret the domain concepts described here without an explicit requirement change.

---

# 1. Core Domain Separation

Purchases and expenses are different business concepts.

A purchase represents the acquisition of inventory.

An expense represents money spent on something that does not create inventory.

Examples:

```text
PURCHASE

Supplier:
Meat Supplier

Items:
Beef 10000 G
Soda 24 UNIT

Result:
Inventory increases
```

```text
EXPENSE

Concept:
Electricity

Amount:
$350,000

Result:
No inventory change
```

Never model operational expenses as fake inventory purchases.

---

# 2. Supplier

A supplier represents a person or organization from which the business purchases goods or services.

A supplier may be used by:

- Inventory purchases
- Operational expenses

Examples:

```text
Carnes XYZ
CHEC
Internet Provider
Cleaning Supplier
```

A supplier contains at least:

- ID
- Branch
- Name
- Optional tax identifier
- Optional phone
- Optional email
- Optional address
- Notes
- Active/inactive state

---

# 3. Supplier Scope

Suppliers are branch-scoped in the current model.

A purchase from Branch A must not reference a supplier belonging to Branch B.

An expense from Branch A must not reference a supplier belonging to Branch B.

The backend must validate branch consistency.

---

# 4. Supplier Optionality

A purchase may optionally have a supplier when the source is unknown or informal.

An expense may optionally have a supplier.

Examples:

```text
Expense:
Cleaning materials

Supplier:
null
```

This is valid.

Do not require artificial supplier records such as:

```text
Unknown Supplier
Other
Miscellaneous
```

unless the business explicitly wants them later.

---

# 5. Inactive Suppliers

Inactive suppliers:

- Cannot be selected for new purchases.
- Cannot be selected for new expenses.
- Remain visible in historical records.
- Must not be physically deleted when historical references exist.

---

# 6. Purchase

A purchase represents confirmed acquisition of one or more inventory items.

A purchase contains at least:

- ID
- Branch
- Supplier, optional
- External document number, optional
- Purchase date
- Items
- Subtotal
- Taxes
- Discounts
- Total
- Payment method
- Status
- Notes
- User who created the purchase
- Creation timestamp

A purchase must contain at least one purchase item.

---

# 7. Purchase Item

A purchase item represents an inventory item acquired as part of a purchase.

A purchase item contains:

- Inventory item
- Quantity
- Purchase unit cost
- Subtotal

Example:

```text
Inventory item:
Beef

Canonical unit:
G

Quantity:
10000

Purchase unit cost:
35

Subtotal:
350000
```

The purchase quantity must use the inventory item's canonical unit.

---

# 8. Purchase Unit Rule

Inventory quantities must always be persisted using the inventory item's canonical unit.

Example:

```text
Inventory Item:
Onion

Canonical unit:
G
```

Purchase quantity must be stored as:

```text
1000 G
```

not:

```text
1 KG
```

The UI may provide convenience conversions if desired, but the backend and persistence model must operate using canonical units.

Do not introduce an independent unit-conversion domain unless explicitly requested.

---

# 9. Purchase Price vs Current Inventory Cost

These are different values.

Example:

```text
Current inventory cost:
$32 / G

New purchase:
$40 / G
```

The purchase item preserves:

```text
purchase_items.unit_cost = 40
```

The inventory item may end with a different weighted-average cost.

Historical purchase price must never be overwritten when current inventory cost changes.

---

# 10. Purchase Creation Behavior

The initial implementation does not require a persisted purchase draft state.

The frontend may allow the user to build a purchase form before submitting it.

The business operation occurs when the user confirms the purchase.

Conceptual flow:

```text
User builds purchase
↓
Select supplier
↓
Add inventory items
↓
Enter quantities
↓
Enter unit costs
↓
Enter tax/discount information
↓
Review totals
↓
Confirm Purchase
```

Only confirmation creates the inventory and accounting effects.

---

# 11. Confirm Purchase Operation

`CONFIRM_PURCHASE` is a domain operation.

It is not merely a CRUD insert into the `purchases` table.

The operation must be atomic.

Conceptual flow:

```text
Authenticate user
↓
Validate branch
↓
Validate purchase permission
↓
Validate supplier
↓
Validate purchase items
↓
Validate totals
↓
Begin PostgreSQL transaction
↓
Create purchase
↓
Create purchase items
↓
Lock affected inventory rows
↓
Calculate new stock
↓
Calculate new weighted-average costs
↓
Create inventory movements
↓
Update inventory items
↓
Recalculate affected product costs
↓
Create cash movement when applicable
↓
Create audit records
↓
Commit transaction
```

If any step fails:

```text
ROLLBACK
```

There must never be a confirmed purchase without its corresponding inventory changes.

There must never be an inventory increase caused by a purchase that failed to persist.

---

# 12. Purchase Validation

Before confirmation, validate:

1. User has permission.
2. Branch is valid.
3. Supplier belongs to the same branch when supplied.
4. Purchase contains at least one item.
5. Every inventory item belongs to the same branch.
6. Every inventory item is valid for new operations.
7. Every quantity is greater than zero.
8. Every purchase unit cost is greater than or equal to zero.
9. Monetary totals are internally consistent.
10. Payment method is valid and active when provided.
11. Required cash session exists when payment affects physical cash.

The backend must perform these validations even if the frontend already did so.

---

# 13. Duplicate Inventory Items in a Purchase

The same inventory item should not appear multiple times in the same purchase unless there is a specific reason to preserve different costs.

Preferred behavior:

```text
Beef
5000 G
$30 / G

Beef
5000 G
$35 / G
```

may be combined only if the UI and business behavior explicitly want this.

Otherwise, preserve separate purchase lines if the acquisition costs differ.

The weighted-average calculation must use the complete value of all confirmed incoming quantities.

For a single purchase containing multiple lines for the same inventory item, the backend may first aggregate:

```text
total_quantity =
sum(quantity)

total_value =
sum(quantity * unit_cost)

effective_purchase_cost =
total_value / total_quantity
```

and apply one inventory cost update.

The original individual purchase lines remain preserved.

---

# 14. Weighted-Average Cost

For an inventory item with positive current stock:

```text
old_inventory_value =
    old_stock * old_unit_cost

purchase_value =
    purchase_quantity * purchase_unit_cost

new_stock =
    old_stock + purchase_quantity

new_inventory_value =
    old_inventory_value + purchase_value

new_unit_cost =
    new_inventory_value / new_stock
```

Example:

```text
Old stock:
10000 G

Old cost:
30 / G

Purchase:
5000 G

Purchase cost:
36 / G
```

Calculation:

```text
Old inventory value:
300000

Purchase value:
180000

New inventory value:
480000

New stock:
15000 G

New unit cost:
32 / G
```

---

# 15. Purchase With Zero Current Stock

If:

```text
old_stock = 0
```

then weighted averaging is unnecessary.

Use:

```text
new_stock =
purchase_quantity

new_unit_cost =
purchase_unit_cost
```

Example:

```text
Stock:
0

Purchase:
100 UNIT

Purchase cost:
3000
```

Result:

```text
Stock:
100

Cost:
3000
```

---

# 16. Purchase With Negative Current Stock

Negative inventory represents a stock deficit.

Do not use conventional weighted-average costing against negative inventory.

If:

```text
old_stock <= 0
```

then:

```text
new_stock =
old_stock + purchase_quantity

new_unit_cost =
purchase_unit_cost
```

Example:

```text
Old stock:
-5 KG

Purchase:
10 KG

Purchase cost:
40000
```

Result:

```text
New stock:
5 KG

New unit cost:
40000
```

Another example:

```text
Old stock:
-10 KG

Purchase:
5 KG

Purchase cost:
38000
```

Result:

```text
New stock:
-5 KG

New unit cost:
38000
```

Weighted averaging resumes normally once the inventory has a positive stock and a later purchase occurs.

---

# 17. Concurrent Purchases

Purchases affecting the same inventory item may occur concurrently.

The backend must prevent stale weighted-average calculations.

For each affected inventory item:

```text
SELECT ...
FOR UPDATE
```

or equivalent row-level locking must be used within the transaction before calculating stock and cost.

Conceptual sequence:

```text
Lock inventory item
↓
Read stock and cost
↓
Calculate new values
↓
Write inventory movement
↓
Update inventory item
```

Do not calculate weighted-average cost outside the transaction using previously fetched client data.

---

# 18. Purchase Inventory Movement

Every confirmed purchase item must result in one or more immutable inventory movements.

Movement type:

```text
PURCHASE
```

Movement records at minimum:

- Branch
- Inventory item
- Positive quantity
- Purchase unit cost
- Stock before
- Stock after
- Purchase item reference
- Source type
- Source ID
- Responsible user
- Timestamp
- Relevant metadata

Example:

```text
Type:
PURCHASE

Inventory:
Beef

Quantity:
+5000 G

Purchase cost:
35

Stock before:
10000

Stock after:
15000
```

---

# 19. Inventory Movement Cost Metadata

For purchase movements, preserve enough information to explain cost changes.

Recommended `metadata` content:

```json
{
  "unit_cost_before": 30,
  "purchase_unit_cost": 35,
  "unit_cost_after": 31.666667,
  "inventory_value_before": 300000,
  "purchase_value": 175000
}
```

This improves auditability and later troubleshooting.

---

# 20. Inventory Item Update

After purchase confirmation, update:

```text
inventory_items.current_stock
inventory_items.unit_cost
```

These fields represent the current inventory state.

They are not substitutes for the historical Kardex.

Current stock is a current-state optimization.

The Kardex is the historical source of movement information.

---

# 21. Product Cost Recalculation

If purchase confirmation changes an inventory item's `unit_cost`, all dependent products must be recalculated.

Dependency paths:

```text
Inventory Item
↓
Product Component
↓
Product
```

and:

```text
Inventory Item
↓
Accompaniment Component
↓
Accompaniment
↓
Product Component
↓
Product
```

After recalculation:

- Product calculated cost changes.
- Current profit changes.
- Current margin changes.
- Product sale price remains unchanged.
- Historical sales remain unchanged.

---

# 22. Confirmed Purchase Immutability

A confirmed purchase is a historical financial and inventory event.

After confirmation:

- Do not directly edit purchase items.
- Do not directly edit purchase quantities.
- Do not directly edit purchase unit costs.
- Do not delete purchase items.
- Do not delete the purchase.
- Do not rewrite generated inventory movements.

Corrections must use explicit correction or void workflows.

---

# 23. Purchase Void Policy

Purchase voiding must preserve history.

A purchase may only be directly voided if safely reversible without rewriting subsequent inventory history.

Safe direct void conditions:

- The purchase is confirmed.
- No later inventory movement exists for any affected inventory item after the purchase movement being reversed.
- The purchase has not already been voided.
- The user has the required permission.

When these conditions are satisfied:

```text
BEGIN

Validate purchase
Lock affected inventory items
Create compensating inventory movements
Restore previous stock
Restore previous unit cost using stored movement metadata
Mark purchase VOID
Create cash correction if required
Create audit record

COMMIT
```

Do not delete the original purchase or movements.

---

# 24. Unsafe Historical Purchase Correction

If later inventory activity already exists, do not attempt to rewrite historical inventory costing.

Example:

```text
Day 1:
Purchase beef

Day 2:
Sell churrasco

Day 3:
Another purchase

Day 4:
User discovers Day 1 purchase was wrong
```

Do not:

- Delete Day 1 purchase
- Recalculate and rewrite Day 2 historical sale cost
- Rewrite existing Kardex movements

Instead, use explicit corrective inventory movements and financial correction records.

Historical facts remain intact.

Current inventory state may be corrected without changing past sale snapshots.

---

# 25. Purchase Correction Principle

Corrections are new facts.

Original:

```text
Purchase:
+100 UNIT
```

Correction:

```text
Inventory correction:
-10 UNIT
```

Both remain visible.

If the monetary purchase value was also incorrect, preserve the original purchase and record the financial correction according to the accounting behavior supported by the application.

The initial system is an internal operational system, not formal accounting software.

Do not invent full accounting journal-entry behavior.

---

# 26. Expense

An expense represents money spent without increasing inventory.

Examples:

```text
Electricity
Water
Internet
Cleaning
Rent
Repairs
Miscellaneous operating cost
```

An expense contains at least:

- ID
- Branch
- Optional supplier
- Concept
- Amount
- Expense date
- Payment method
- Optional cash session
- Notes
- Responsible user
- Timestamp
- Status

---

# 27. Expense Concept

The initial system does not require expense categories.

Use a human-readable concept.

Example:

```text
Concept:
September electricity bill
```

Do not create mandatory category complexity unless explicitly requested later.

Reports may aggregate by concept, supplier, date or payment method where useful.

---

# 28. Expense Does Not Affect Inventory

Creating an expense must never:

- Create an inventory movement.
- Change inventory stock.
- Change inventory cost.
- Recalculate product cost.

Example:

```text
Expense:
Electricity
$300,000
```

Result:

```text
Inventory:
unchanged
```

---

# 29. Expense Confirmation

A confirmed expense is a domain operation.

Conceptual flow:

```text
Authenticate user
↓
Validate branch
↓
Validate expense permission
↓
Validate supplier if present
↓
Validate payment method
↓
Validate amount
↓
Validate cash session if required
↓
BEGIN
↓
Create expense
↓
Create cash movement when applicable
↓
Create audit event
↓
COMMIT
```

---

# 30. Expense Amount

Expense amount must be:

```text
amount > 0
```

Do not represent refunds or corrections using negative expenses.

Use explicit correction/void behavior instead.

---

# 31. Expense Immutability

Once an expense is confirmed and has affected cash or reporting:

- Do not silently edit its amount.
- Do not silently edit its payment method.
- Do not delete it.

Minor non-financial metadata such as notes may be editable if audited.

Financial corrections should use explicit void/correction behavior.

---

# 32. Expense Void

Voiding an expense:

```text
BEGIN

Validate expense
Validate permission
Validate not already voided
Create compensating cash movement if required
Mark expense VOID
Create audit record

COMMIT
```

The original expense remains visible historically.

The system must not physically delete it.

---

# 33. Payment Methods

Initial payment methods include:

```text
CASH
QR
CARD
```

Payment methods are configurable branch records, but their type controls financial behavior.

Purchases and expenses may reference a payment method.

---

# 34. Cash vs Non-Cash Payment Behavior

Payment method type determines whether the operation affects physical cash.

## CASH

A cash purchase or expense affects the cash register.

It must create an appropriate `cash_movements` record.

An open cash session is required.

## QR

Does not change physical cash in the drawer.

No cash drawer movement is created.

The payment method remains recorded for reporting.

## CARD

Does not change physical cash in the drawer.

No cash drawer movement is created.

The payment method remains recorded for reporting.

---

# 35. Cash Purchase

For a purchase paid with CASH:

```text
Purchase confirmed
↓
Inventory increases
↓
Inventory cost recalculated
↓
Cash decreases
```

The purchase must be associated with the active cash session responsible for the payment.

The cash movement must preserve a reference to the purchase.

---

# 36. Cash Expense

For an expense paid with CASH:

```text
Expense confirmed
↓
Cash decreases
```

The corresponding cash movement references the expense.

---

# 37. Required Open Cash Session

A financial operation using physical cash requires an open cash session.

If:

```text
payment_method.type = CASH
```

and there is no valid open cash session:

```text
Reject operation
```

The system must not create untracked cash outflows.

This rule applies to:

- Cash purchases
- Cash expenses
- Manual cash withdrawals
- Other cash-affecting operations

---

# 38. Cash Movement Direction

`cash_movements.amount` is stored as a positive monetary amount.

Direction is determined by `movement_type`.

Examples:

```text
SALE
+ cash effect
```

```text
DEPOSIT
+ cash effect
```

```text
PURCHASE
- cash effect
```

```text
EXPENSE
- cash effect
```

```text
WITHDRAWAL
- cash effect
```

Do not encode direction by storing negative `amount` values.

This keeps reporting semantics explicit.

---

# 39. Purchase Taxes and Discounts

A purchase may record:

- Subtotal
- Tax total
- Discount total
- Final total

These values represent the purchase document.

Inventory cost calculation must use the actual acquisition cost attributable to each purchase item.

Do not automatically assume:

```text
purchase_items.unit_cost
```

is identical to a displayed gross price if taxes or discounts alter acquisition cost.

The frontend/backend should normalize purchase item cost before applying inventory valuation.

---

# 40. Purchase Item Cost Allocation

If purchase-level discounts or taxes affect item acquisition costs, the application should allocate them deterministically.

Preferred initial approach:

- Allow the user to provide the final effective unit cost per inventory item.
- Preserve document subtotal/tax/discount totals separately.
- Use the effective `purchase_items.unit_cost` for inventory weighted-average costing.

This avoids implementing a complex accounting cost-allocation engine.

---

# 41. Inventory Kardex

The Kardex is the immutable chronological history of inventory movements.

Every physical inventory change must create a Kardex movement.

Examples:

```text
PURCHASE
SALE
MANUAL_ADJUSTMENT
CORRECTION
RETURN
```

Current stock must never change without a corresponding inventory movement.

This is a critical backend invariant.

---

# 42. Kardex Entry

A Kardex movement contains at least:

- ID
- Branch
- Inventory item
- Movement type
- Quantity
- Unit cost
- Stock before
- Stock after
- Source type
- Source ID
- Optional account item
- Optional purchase item
- Reason
- Metadata
- Responsible user
- Timestamp

---

# 43. Kardex Quantity Convention

Movement quantity is signed.

Examples:

```text
Purchase:
+5000 G
```

```text
Sale:
-350 G
```

```text
Manual increase:
+100 G
```

```text
Manual decrease:
-100 G
```

This makes movement arithmetic explicit.

---

# 44. Kardex Stock Consistency

For every movement:

```text
stock_after =
stock_before + quantity
```

This invariant must always hold.

If it does not, the transaction must fail.

---

# 45. Kardex Immutability

Once created:

```text
inventory_movements
```

must not be:

- Updated
- Deleted
- Replaced

Corrections create additional movements.

The PostgreSQL immutability triggers defined in the schema must remain enabled.

Application code must not attempt to bypass them.

---

# 46. Kardex Source References

Movements should preserve their source whenever possible.

Examples:

```text
SALE
source_id = account/account_item
```

```text
PURCHASE
source_id = purchase/purchase_item
```

```text
MANUAL_ADJUSTMENT
source_id = adjustment operation
```

```text
CORRECTION
source_id = original operation where applicable
```

This allows the user to trace:

```text
Why did stock change?
```

from the Kardex.

---

# 47. Kardex UI

The inventory detail view should expose movement history.

Example:

```text
Beef

Current stock:
8500 G

Current cost:
$35 / G

MOVEMENTS

06/09 15:30
SALE
-350 G
Stock: 8850 → 8500
Mesa 5

06/09 10:10
PURCHASE
+5000 G
Stock: 3850 → 8850
Supplier: Carnes XYZ

05/09 21:00
MANUAL ADJUSTMENT
-150 G
Stock: 4000 → 3850
Reason: Physical count
```

---

# 48. Kardex Filtering

Kardex should support filtering by:

- Inventory item
- Branch
- Date range
- Movement type
- Source type
- User

The user should be able to inspect the complete history of an inventory item.

---

# 49. Manual Stock Adjustment

Authorized users may manually adjust inventory.

The UI may support either:

## Delta mode

```text
Add:
+500 G
```

or:

```text
Remove:
-500 G
```

## Physical count mode

```text
Current system stock:
5000 G

Actual physical stock:
4600 G

Calculated adjustment:
-400 G
```

Both modes must ultimately produce a signed inventory movement quantity.

---

# 50. Manual Adjustment Flow

```text
Authenticate user
↓
Validate branch
↓
Require inventory.adjust
↓
Validate inventory item
↓
Require reason
↓
BEGIN
↓
Lock inventory item
↓
Read current stock
↓
Calculate adjustment
↓
Calculate stock_after
↓
Create immutable inventory movement
↓
Update current_stock
↓
Generate stock alert if applicable
↓
Create audit record
↓
COMMIT
```

Manual quantity adjustments do not alter `unit_cost`.

---

# 51. Manual Cost Changes

Normal users must not directly edit current inventory cost as a routine operation.

Current cost is primarily controlled by confirmed purchases.

If an administrative cost correction is ever required, it must be implemented as an explicit audited domain operation, not as a generic edit to:

```text
inventory_items.unit_cost
```

Do not expose a normal editable "cost" field that silently changes current valuation.

---

# 52. Inventory Corrections

A correction represents a new inventory fact created to compensate for a previous incorrect movement.

Example:

```text
Original adjustment:
-500 G

Actual correct adjustment:
-300 G
```

Do not modify the original movement.

Create:

```text
CORRECTION:
+200 G
```

The correction should reference the original operation/movement where possible.

---

# 53. Inventory Movement Responsibility

Different modules trigger inventory changes, but all changes must use the same centralized inventory movement service/domain logic.

Examples:

```text
Purchasing module
→ Inventory service

Sales module
→ Inventory service

Manual adjustment UI
→ Inventory service

Correction workflow
→ Inventory service
```

Do not allow each module to implement its own stock update behavior independently.

---

# 54. Central Inventory Mutation Rule

Never write code equivalent to:

```text
inventory.current_stock -= quantity
```

directly from arbitrary application services.

All inventory mutations must pass through a single domain operation that:

1. Locks inventory state.
2. Determines stock before.
3. Calculates stock after.
4. Creates the immutable movement.
5. Updates current stock.
6. Handles alerts.
7. Preserves source references.
8. Participates in the calling transaction.

---

# 55. Current Stock as Cached State

`inventory_items.current_stock` represents current operational stock.

It exists for efficient application use.

Every change must be backed by an immutable Kardex movement.

Conceptually:

```text
Kardex movements
→ historical source of inventory changes

current_stock
→ optimized current state
```

The two must remain consistent.

---

# 56. Stock Reconciliation

The application may support administrative reconciliation checks.

For an inventory item:

```text
expected_current_stock =
initial/opening stock
+
sum(all movements)
```

This should match:

```text
inventory_items.current_stock
```

If a discrepancy is detected, the system should report it as a technical/data-integrity problem.

Do not silently repair it.

---

# 57. Opening Inventory

Initial inventory may be entered using a manual adjustment.

Example:

```text
Type:
MANUAL_ADJUSTMENT

Reason:
Initial inventory

Quantity:
+10000 G
```

This ensures initial stock is also represented in Kardex.

If an initial unit cost is configured when creating the item, that cost represents the starting valuation.

---

# 58. Reports Integration

This module must provide enough data for reports such as:

## Purchases

- Purchases by date
- Purchases by supplier
- Purchases by inventory item
- Purchase spending
- Purchase unit-cost changes

## Expenses

- Expenses by date
- Expenses by supplier
- Expenses by payment method
- Operational spending

## Inventory

- Kardex
- Current stock
- Current valuation
- Stock adjustments
- Inventory consumption
- Stock movement by type

---

# 59. Current Inventory Valuation

Current inventory valuation may be calculated as:

```text
current_stock * current_unit_cost
```

for positive stock.

For negative inventory, valuation should not be presented as meaningful positive asset value.

Reports should distinguish negative-stock items.

---

# 60. Expenses and Profitability

Expenses are not product costs.

Do not add electricity, water or cleaning directly into:

```text
products.calculated_cost
```

Product calculated cost represents ingredient/inventory cost.

Operational profitability reports may later calculate:

```text
Sales
- Cost of sold products
- Operational expenses
= Estimated operational profit
```

These are separate layers.

---

# 61. Purchases and Profitability

A purchase does not immediately represent product cost-of-goods sold.

Purchases increase inventory.

Product cost is recognized operationally when inventory is consumed by a sale using the sale-time cost snapshot.

Do not calculate historical profit as:

```text
sales - purchases
```

for product profitability.

Use historical sale cost snapshots.

---

# 62. Audit Requirements

Audit at minimum:

## Suppliers

- Create supplier
- Update supplier
- Activate supplier
- Deactivate supplier

## Purchases

- Confirm purchase
- Void purchase
- Correct purchase where applicable

## Expenses

- Confirm expense
- Void expense
- Correct expense where applicable

## Inventory

- Manual adjustment
- Correction
- Initial stock entry
- Cost change caused by purchase

Audit records must preserve relevant before and after state.

---

# 63. Purchase Audit Example

Example:

```json
{
  "action": "PURCHASE_CONFIRMED",
  "entity_type": "purchase",
  "entity_id": "uuid",
  "after_data": {
    "supplier_id": "uuid",
    "total": 500000,
    "items": [
      {
        "inventory_item_id": "uuid",
        "quantity": 10000,
        "unit_cost": 35
      }
    ]
  }
}
```

Detailed stock changes are also represented by inventory movements.

Do not duplicate the entire Kardex unnecessarily inside the audit record.

---

# 64. Expense Audit Example

```json
{
  "action": "EXPENSE_CONFIRMED",
  "entity_type": "expense",
  "entity_id": "uuid",
  "after_data": {
    "concept": "Electricity",
    "amount": 350000,
    "payment_method": "CASH"
  }
}
```

---

# 65. Permissions

Recommended permissions include:

```text
suppliers.view
suppliers.create
suppliers.update
suppliers.activate
suppliers.deactivate

purchases.view
purchases.create
purchases.confirm
purchases.void

expenses.view
expenses.create
expenses.void

inventory.view_movements
inventory.adjust
inventory.correct

inventory.view_cost

reports.purchases
reports.expenses
reports.inventory
```

Exact naming must remain consistent with the centralized authorization module.

---

# 66. Backend Invariants

The backend must enforce all of the following:

1. Purchases and expenses are separate concepts.
2. Purchases affect inventory.
3. Expenses never affect inventory.
4. Every purchase item references an inventory item in the same branch.
5. Purchase quantities are positive.
6. Purchase quantities use canonical inventory units.
7. Purchase unit costs are non-negative.
8. Confirmed purchases create immutable inventory movements.
9. Current inventory stock must never change without an inventory movement.
10. Purchase cost and current weighted-average inventory cost are different concepts.
11. Current inventory cost uses weighted-average costing for positive stock.
12. Negative stock uses the special acquisition rule defined in this document.
13. Purchase confirmation must be transactional.
14. Inventory rows must be locked during cost and stock mutation.
15. Confirmed purchases must not be silently edited.
16. Historical purchase items must preserve their original acquisition costs.
17. Expenses must not create inventory movements.
18. Cash expenses and cash purchases require an open cash session.
19. Non-cash expenses and purchases do not modify physical cash.
20. Inventory movements are immutable.
21. Corrections create new movements.
22. Manual inventory adjustments require a reason.
23. Manual quantity adjustments do not change unit cost.
24. Inventory cost changes caused by purchases must recalculate affected current product costs.
25. Current product sale prices must not change automatically because inventory cost changed.
26. Historical sales must never be rewritten because of later purchases.
27. Supplier and branch relationships must remain consistent.
28. Financial void/correction actions must be audited.

---

# 67. Offline Purchase Behavior

Purchase entry may be supported offline if sufficient catalog information exists locally.

An offline purchase operation must preserve:

- Globally unique purchase ID
- Globally unique operation ID
- Branch
- User
- Device
- Supplier reference if present
- Purchase items
- Quantities
- Purchase costs
- Payment method
- Local timestamp

However, inventory weighted-average cost must be finalized authoritatively by the server during synchronization.

---

# 68. Offline Purchase Cost Conflict

A device operating offline may have stale inventory cost and stock information.

Therefore:

Do not trust locally calculated weighted-average inventory cost as authoritative.

The offline client may display an estimate.

During synchronization:

```text
Server receives purchase
↓
Validate permissions
↓
Validate branch
↓
Lock current inventory rows
↓
Use current authoritative stock/cost
↓
Apply purchase
↓
Calculate authoritative weighted-average cost
↓
Create movements
↓
Return synchronized result
```

---

# 69. Offline Purchase Idempotency

Purchase confirmation must be idempotent.

If the same `operation_id` is synchronized more than once:

```text
Do not create duplicate purchase
Do not increase stock twice
Do not create duplicate cash movement
```

Return the previously processed result.

---

# 70. Offline Expense Behavior

Offline expenses may be queued for synchronization.

However, CASH expenses have additional risk because the authoritative cash session may have changed.

On synchronization:

- Validate the referenced cash session.
- Validate that the session can accept the operation.
- Validate current permissions.
- Reject or flag conflicts instead of silently attaching the expense to another session.

---

# 71. Offline Inventory Adjustments

Manual inventory adjustments are conflict-sensitive.

Example:

```text
Device A offline:
Stock thought to be 100
Sets physical count to 90

Meanwhile server:
Sale reduces stock to 80
```

Do not blindly apply:

```text
stock = 90
```

Physical-count adjustments must synchronize as an operation containing:

- Observed physical count
- Local known stock/version
- Timestamp
- Device
- User

The server must detect stale-state conflicts.

Delta adjustments may be applied more safely if the operation explicitly means:

```text
Add 5 units
```

rather than:

```text
Set stock to 5 units
```

For offline physical counts, conflict detection is mandatory.

---

# 72. Kardex and Offline Synchronization

The client must not independently invent authoritative server Kardex sequence.

Offline actions create domain operations.

The server creates authoritative inventory movements when those operations synchronize successfully.

Local devices may maintain provisional local movements for UX, but authoritative Kardex records come from the server.

---

# 73. Source of Truth

Authoritative purchasing data:

```text
purchases
purchase_items
```

Authoritative expense data:

```text
expenses
```

Authoritative supplier data:

```text
suppliers
```

Authoritative current inventory state:

```text
inventory_items.current_stock
inventory_items.unit_cost
```

Authoritative inventory movement history:

```text
inventory_movements
```

Authoritative historical acquisition cost:

```text
purchase_items.unit_cost
```

Do not reconstruct historical purchase cost from current inventory cost.

---

# 74. Main Use Cases

This module must support at minimum:

```text
Create supplier
View supplier
Update supplier
Activate supplier
Deactivate supplier

Create and confirm purchase
View purchase
View purchase history
Void purchase when safely reversible
Correct purchase operationally

Create expense
View expense
View expense history
Void expense

View Kardex
Filter Kardex
Trace Kardex movement to source

Create manual stock adjustment
Create inventory correction
Enter initial stock

Update current inventory through purchases
Calculate weighted-average cost
Recalculate affected product costs

Record cash purchase
Record cash expense
Record non-cash purchase
Record non-cash expense
```

---

# 75. Integration With Inventory Module

Confirmed purchase:

```text
Purchase
↓
Inventory mutation service
↓
Stock increase
↓
Weighted-average cost
↓
Immutable movement
↓
Product-cost recalculation
```

Manual adjustment:

```text
Adjustment
↓
Inventory mutation service
↓
Stock mutation
↓
Immutable movement
```

The inventory module remains authoritative for stock and cost rules.

---

# 76. Integration With Product Catalog

When an inventory cost changes:

```text
Inventory Item
↓
Dependent products identified
↓
Calculated product costs refreshed
↓
Current profit refreshed
↓
Current margin refreshed
↓
Sale price preserved
```

No historical product-sale records are changed.

---

# 77. Integration With Cash Module

For CASH purchases and expenses:

```text
Financial operation
↓
Active cash session
↓
Cash movement
↓
Cash expected-balance calculation
```

The Cash module owns final cash-session reconciliation rules.

This module owns creation of the financial source operation.

---

# 78. Integration With Reporting

Reporting must distinguish:

```text
Purchase spending
Operational expenses
Inventory valuation
Historical cost of sold products
Cash outflows
```

These values are related but not interchangeable.

---

# 79. Non-Goals

This module intentionally does not implement:

- Accounts payable
- Supplier credit terms
- Formal accounting journal entries
- Double-entry accounting
- Electronic supplier invoicing
- Bank reconciliation
- Complex expense categories
- Purchase orders
- Goods-receipt workflows separate from purchase confirmation
- Warehouse transfers
- Waste/merma tracking
- Manufacturing
- Production batches
- Formal tax accounting

These may be added later if explicitly required.

---

# 80. Required Schema Adjustments

The existing DDL requires a few adjustments to fully support the business behavior defined in this module.

These should be implemented as migrations rather than recreating existing tables.

## 80.1 Add PURCHASE Cash Movement Type

The current `cash_movement_type` must support:

```text
PURCHASE
```

A purchase paid in cash is not semantically the same as a generic withdrawal.

Recommended migration concept:

```sql
ALTER TYPE cash_movement_type
ADD VALUE IF NOT EXISTS 'PURCHASE';
```

---

# 81. Add Purchase Reference to Cash Movements

`cash_movements` currently supports references to payments and expenses but not purchases.

Add:

```text
purchase_id UUID NULL
```

referencing:

```text
purchases(id)
```

This allows a cash outflow to be traced directly to the purchase that caused it.

---

# 82. Add Cash Session Reference to Purchases

A CASH purchase must identify the cash session from which money was taken.

Add:

```text
cash_session_id UUID NULL
```

to purchases.

It is required by business logic when:

```text
payment_method.type = CASH
```

and optional otherwise.

---

# 83. Expense Status

Expenses require explicit lifecycle state so they can be voided without deletion.

Add an expense status enum or equivalent values:

```text
CONFIRMED
VOID
```

Add:

```text
status
```

to `expenses`.

Do not represent voiding by deleting the row.

---

# 84. Recommended Void Metadata

For both purchases and expenses, consider storing:

```text
voided_at
voided_by_user_id
void_reason
```

These are useful operational fields even though the complete event is also present in `audit_logs`.

---

# 85. Purchase Movement Cost Metadata

No new relational columns are strictly required for weighted-cost reversal metadata because `inventory_movements.metadata JSONB` can preserve:

```text
unit_cost_before
unit_cost_after
purchase_unit_cost
inventory_value_before
inventory_value_after
```

This metadata should be populated for purchase movements.

---

# 86. Critical Implementation Principle

Do not implement this module as independent CRUD endpoints that modify tables in isolation.

The primary business flows are:

```text
PURCHASE
↓
Inventory
↓
Weighted Cost
↓
Kardex
↓
Product Cost
↓
Cash
↓
Audit
```

```text
EXPENSE
↓
Payment Method
↓
Cash when applicable
↓
Audit
↓
Reporting
```

```text
INVENTORY ADJUSTMENT
↓
Inventory Lock
↓
Immutable Kardex Movement
↓
Current Stock
↓
Alert
↓
Audit
```

All implementation decisions must preserve:

- Transactional consistency
- Inventory integrity
- Historical integrity
- Cost integrity
- Cash traceability
- Branch isolation
- Auditability
- Idempotency