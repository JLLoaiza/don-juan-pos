# Dining Areas, Tables, Accounts and Order Taking Module

## Purpose

This document defines the business rules, domain model, transactional behavior and expected implementation for:

- Dining areas
- Restaurant tables
- Table status
- Customer association
- Table accounts
- Account items
- Product selection
- Additional accompaniments
- Item notes
- Waiter/user attribution
- Adding and modifying consumption
- Sending consumption to kitchen
- Inventory consumption integration
- Account cancellation
- Table lifecycle
- Historical sale snapshots
- Audit requirements
- Offline considerations

This document must be treated as authoritative context when implementing or modifying functionality related to restaurant floor operation and order taking.

The Organization and Authorization module and the Inventory, Catalog and Costing module remain authoritative for their respective domain rules.

Do not reinterpret the concepts described here without an explicit requirement change.

---

# 1. Core Domain Principle

The system does NOT have a separate business concept of multiple orders belonging to one table.

The primary operational relationship is:

```text
Dining Area
↓
Table
↓
Account
↓
Account Items
```

An account represents all consumption accumulated on a table during one visit.

Example:

```text
Table 5

Account

Churrasco x2
Soda x3
Extra antipasto x1
```

If the customer asks for additional products later, those products are added to the same account.

Do not create a second independent sales order merely because the customer ordered at a different time.

---

# 2. Account vs Kitchen Order

An `Account` is the commercial and financial record of the table.

A `Kitchen Order` is only an operational print/instruction snapshot sent to food preparation.

These concepts must not be confused.

Example:

```text
Table 5
Account #ABC

12:10
Churrasco x2
Soda x2

12:35
Extra Churrasco x1
```

There is still one account:

```text
Account #ABC
```

but there may be two kitchen print events:

```text
Kitchen ticket 1
Churrasco x2
Soda x2
```

```text
Kitchen ticket 2
Churrasco x1
```

The kitchen ticket does not represent another customer account.

---

# 3. Dining Area

A dining area represents a named physical area or salon inside a branch.

Examples:

```text
Main Salon
Terrace
Second Floor
Bar Area
```

A dining area contains at least:

- ID
- Branch
- Name
- Active/inactive state

A dining area belongs to exactly one branch.

---

# 4. Dining Area Rules

An inactive dining area:

- Cannot receive new tables.
- Should not appear in normal waiter views.
- Remains available in historical administrative data.
- Must not be physically deleted if referenced historically.

Existing tables belonging to an inactive area remain stored.

---

# 5. Restaurant Table

A restaurant table represents a physical table inside a dining area.

A table contains at least:

- ID
- Dining area
- Name
- Capacity
- Current status
- Active/inactive state

Example:

```text
Dining Area:
Main Salon

Table:
Mesa 5

Capacity:
4

Status:
AVAILABLE
```

---

# 6. Table Names

Table names are configurable.

Examples:

```text
Mesa 1
Mesa 2
Barra 1
VIP
Terraza 3
```

The name must be unique inside its dining area.

The system must not assume the name is numeric.

---

# 7. Table Capacity

Capacity represents the expected number of guests the table can accommodate.

Example:

```text
Mesa 5
Capacity: 4
```

Capacity is informational.

The initial system does not prevent using a table because the number of customers exceeds its configured capacity.

---

# 8. Table Status

Supported table statuses are:

```text
AVAILABLE
OCCUPIED
RESERVED
```

Visual representation:

```text
AVAILABLE → White
OCCUPIED  → Yellow
RESERVED  → Orange
```

Colors belong to frontend presentation.

Do not persist color values in the database.

---

# 9. AVAILABLE Table

`AVAILABLE` means the table currently has no active customer account and is available for use.

When a new account is opened on the table:

```text
AVAILABLE
↓
OCCUPIED
```

This transition should happen automatically.

---

# 10. OCCUPIED Table

`OCCUPIED` means the table currently has an active account.

The normal relationship is:

```text
Table
↓
One OPEN Account
```

A table must not have multiple open accounts simultaneously.

This is a core business invariant.

---

# 11. RESERVED Table

The initial system does not implement a reservation module.

`RESERVED` is simply a manually configurable operational table status.

Example:

```text
Mesa 4
RESERVED
```

This may be used by staff to indicate that the table should not be assigned normally.

There is no:

- Reservation entity
- Reservation customer
- Reservation time
- Booking calendar

unless explicitly added later.

---

# 12. Manual Table Status Changes

Authorized users may manually change table status.

However, table status must remain consistent with active accounts.

The backend must not allow:

```text
Table has OPEN account
status = AVAILABLE
```

under normal operation.

If an open account exists, the table should be `OCCUPIED`.

Manual `AVAILABLE` should only be allowed when no open account exists.

---

# 13. Opening a RESERVED Table

An authorized user may open an account on a `RESERVED` table.

When this happens:

```text
RESERVED
↓
OCCUPIED
```

No reservation entity needs to be cleared because none exists.

---

# 14. Inactive Tables

Inactive tables:

- Cannot receive new accounts.
- Do not appear in normal waiter table selection.
- Remain available in historical data.
- Must not be physically deleted when historical references exist.

An active open account should prevent deactivation until the account is resolved.

---

# 15. Account

An account represents the complete current consumption for a table visit.

An account contains at least:

- ID
- Branch
- Table
- Optional customer
- User who opened the account
- Status
- Open timestamp
- Close timestamp
- Subtotal
- Discount total
- Service percentage
- Service total
- Tax total
- Total
- Notes

The account is the central commercial entity for dine-in operation.

---

# 16. Account Status

Supported account statuses are:

```text
OPEN
PAID
VOID
```

No additional kitchen or preparation states belong to the account.

---

# 17. OPEN Account

An `OPEN` account:

- May receive products.
- May receive additional accompaniments.
- May receive notes.
- May be modified according to permissions.
- May be sent to kitchen.
- May be split later.
- May receive payments later.

An open account belongs to an occupied table.

---

# 18. PAID Account

A `PAID` account is financially completed.

A paid account:

- Must not accept new products.
- Must not allow ordinary item modifications.
- Remains historically queryable.
- Must not be deleted.
- Causes the table to return to `AVAILABLE` when fully closed.

Payment-specific rules are defined in the payments module.

---

# 19. VOID Account

A `VOID` account represents a cancelled account.

Voiding is not deletion.

A voided account:

- Remains in history.
- Cannot receive new items.
- Must preserve its historical data.
- Must preserve audit information.
- Must compensate inventory consumption when applicable.
- Returns the table to `AVAILABLE` when no other open account exists.

---

# 20. One Open Account Per Table

A table may have at most one open account at a time.

Invalid state:

```text
Mesa 5

Account A
OPEN

Account B
OPEN
```

Valid:

```text
Mesa 5

Account A
PAID

Account B
OPEN
```

The backend must enforce this invariant.

Prefer also enforcing it through a PostgreSQL partial unique index.

Recommended database constraint:

```sql
CREATE UNIQUE INDEX uq_open_account_per_table
ON accounts(table_id)
WHERE status = 'OPEN';
```

This should be added through a migration.

---

# 21. Opening an Account

Opening an account is a domain operation.

Conceptual flow:

```text
Authenticate user
↓
Validate branch
↓
Validate permission
↓
Validate table
↓
Lock table
↓
Validate no OPEN account exists
↓
BEGIN
↓
Create account
↓
Set table OCCUPIED
↓
Create audit event
↓
COMMIT
```

The operation must be atomic.

---

# 22. Opening Account on AVAILABLE Table

Normal case:

```text
Table:
AVAILABLE
```

Operation:

```text
Create account
↓
Table becomes OCCUPIED
```

---

# 23. Opening Account on RESERVED Table

Allowed for authorized users.

Flow:

```text
Table:
RESERVED

Open account
↓
Table:
OCCUPIED
```

---

# 24. Opening Account on OCCUPIED Table

If an open account already exists:

Do not create another account.

The frontend should open the existing account instead.

Conceptually:

```text
Select occupied table
↓
Load existing OPEN account
```

---

# 25. Customer Association

An account may optionally reference a registered customer.

Customer data includes:

- Name
- Phone
- Email
- Notes

Customer association is optional.

A customer is not required to open or close a normal table account.

---

# 26. Customer History

Customer purchase history is derived from accounts associated with that customer.

Do not duplicate purchase history into a separate customer-history storage model.

Conceptually:

```text
Customer
↓
Accounts
↓
Account Items
↓
Payments
```

---

# 27. Changing Customer on Open Account

An authorized user may assign or change the customer while the account remains open.

This operation must be audited if customer identification is relevant to the business.

Changing the customer does not affect inventory or pricing.

---

# 28. Account Item

An account item represents a product added to a table account.

Each account item contains at least:

- ID
- Account
- Product reference
- User who added the item
- Product name snapshot
- Unit sale price snapshot
- Unit cost snapshot
- Quantity
- Discounts
- Tax snapshot
- Line subtotal
- Line total
- Notes
- Inventory consumption snapshot
- Creation timestamp

---

# 29. Product Quantity

Commercial product quantity must represent whole sold units in the current restaurant scope.

Examples:

```text
Churrasco x1
Soda x2
Lomo x3
```

Do not allow:

```text
Churrasco x1.5
```

unless fractional commercial products are explicitly introduced later.

The current DDL uses a numeric quantity type, but business validation must require positive whole-number quantities for `account_items`.

Recommended future schema tightening may use an integer type or a whole-number check constraint.

---

# 30. Adding Product to Account

Adding a product to an account is a domain operation.

Conceptual flow:

```text
Authenticate user
↓
Validate branch
↓
Require sales/update permission
↓
Load OPEN account
↓
Validate product is active
↓
Resolve current product price
↓
Resolve current product cost
↓
Resolve tax
↓
Resolve product composition
↓
Resolve base accompaniments
↓
Resolve selected additional accompaniments
↓
Calculate inventory consumption
↓
Create historical snapshots
↓
Add account item
↓
Recalculate account totals
↓
Create audit event
```

Inventory is not necessarily consumed merely because the item is temporarily present in an unsent UI form.

Inventory consumption occurs when the item is confirmed/sent as an actual restaurant request.

---

# 31. Draft UI State vs Persisted Consumption

The frontend may temporarily allow the waiter to build a selection:

```text
Churrasco x2
Soda x2
Extra antipasto
```

before confirming it.

This draft UI state does not need to affect inventory.

The important domain operation is:

```text
CONFIRM_ACCOUNT_ITEMS
```

or equivalent.

At confirmation:

```text
Persist account items
↓
Capture snapshots
↓
Consume inventory
↓
Create Kardex movements
↓
Create kitchen instruction when appropriate
```

---

# 32. Product Snapshot

When an account item is confirmed, preserve the current product information.

At minimum:

```text
product_id
product_name_snapshot
unit_price
unit_cost
tax_rate_snapshot
```

Historical sale information must not later depend on the current product record.

Example:

Today:

```text
Churrasco
$65,000
```

Tomorrow:

```text
Churrasco
$70,000
```

Yesterday's account must still show:

```text
$65,000
```

---

# 33. Cost Snapshot

When the product is confirmed:

```text
account_items.unit_cost
```

must represent the calculated product cost at that moment.

If ingredient costs change later, this historical cost must not change.

This value is used for historical profitability reporting.

---

# 34. Inventory Consumption Snapshot

The account item must preserve the resolved physical inventory consumption at confirmation time.

Example:

```json
{
  "components": [
    {
      "inventory_item_id": "uuid",
      "name": "Beef",
      "quantity": 350,
      "unit": "G",
      "unit_cost": 35
    },
    {
      "inventory_item_id": "uuid",
      "name": "Onion",
      "quantity": 10,
      "unit": "G",
      "unit_cost": 2.1
    }
  ],
  "total_cost": 18250
}
```

This snapshot remains immutable as historical sale context.

---

# 35. Base Accompaniments

A product may contain accompaniments as part of its base composition.

Example:

```text
Churrasco

Included:
Antipasto
Arepa with sautéed vegetables
```

These are already part of product cost and inventory consumption.

They are not automatically separate billable lines.

---

# 36. Additional Accompaniments

The waiter may select additional accompaniments configured for the product.

Example:

```text
Churrasco

Extra cheese
+$4,000

Extra antipasto
+$2,000
```

Selected additional accompaniments must be stored historically.

---

# 37. Free Additional

If configuration allows:

```text
Extra antipasto
Normal price: $2,000

No charge: true
```

then:

```text
Sale price contribution:
$0

Inventory consumption:
normal
```

The inventory is still consumed.

---

# 38. Additional Snapshot

Historical selected additional data must preserve at least:

- Accompaniment ID
- Name snapshot
- Quantity
- Unit price
- Included/free flags
- Total

If its underlying inventory consumption is relevant, it must be included in the account item's full consumption snapshot.

---

# 39. Item Notes

Each account item may contain free-form notes.

Examples:

```text
No onion
Well done
Sauce on the side
No cheese
```

Notes are operational instructions.

They do not automatically modify inventory composition.

This distinction is important.

Example:

```text
Note:
"No onion"
```

does NOT automatically remove onion from inventory consumption unless explicit ingredient-removal functionality is implemented later.

The current system treats notes as text only.

---

# 40. Ingredient Removal Is Not a Current Feature

The current specification does not define per-sale recipe editing at ingredient level.

Therefore:

```text
"No onion"
```

is a note to kitchen.

It does not modify:

```text
product composition
inventory consumption
product cost snapshot
```

unless this feature is explicitly introduced later.

Do not infer inventory modifications from natural-language notes.

---

# 41. Waiter Attribution

Operational order taking is attributed to authenticated users.

The system does not infer the waiter from the employee module.

Employees and users are intentionally independent.

Account records preserve:

```text
opened_by_user_id
```

Account items preserve:

```text
added_by_user_id
```

This allows reporting such as:

```text
Sales entered by user
Products entered by user
Accounts opened by user
```

If a business concept linking employees and users is introduced later, it must be explicitly modeled.

Do not infer that relationship.

---

# 42. Waiter Role

"Waiter" is primarily an authorization role or operational usage pattern.

It is not a separate entity required by this module.

A user with the appropriate permissions may perform waiter actions.

Example permissions:

```text
tables.view
accounts.open
accounts.view
accounts.update
sales.add_items
kitchen.send
```

---

# 43. Aggregating Identical Products

The frontend may visually aggregate equivalent account items.

Example:

```text
Soda x3
```

However, backend persistence should preserve enough granularity to handle:

- Different additional accompaniments
- Different notes
- Different prices
- Different discounts
- Different confirmation times
- Different users

Items are equivalent only if their commercial and historical properties are equivalent.

Do not blindly merge account lines based only on `product_id`.

---

# 44. Example of Non-Equivalent Items

These must remain distinguishable:

```text
Churrasco
Extra cheese
```

and:

```text
Churrasco
No additional
```

Also:

```text
Churrasco
Note: Well done
```

and:

```text
Churrasco
Note: Medium
```

Even though both reference the same product.

---

# 45. Account Total Recalculation

Whenever account contents change, totals must be recalculated.

At this module stage, calculate at least:

```text
item subtotal
item discount
item tax
account subtotal
account discount total
account tax total
```

Service and payment finalization are defined in later modules.

Account monetary values must never be trusted from frontend arithmetic.

The frontend may calculate previews.

The backend remains authoritative.

---

# 46. Pricing Authority

When adding a normal product:

Use the current persisted product sale price.

The frontend must not be able to submit an arbitrary lower price and have the backend accept it as normal behavior.

If manual price override is later supported, it must:

- Require explicit permission.
- Be auditable.
- Preserve original/current product price context.
- Be explicitly represented.

Do not implement arbitrary client-controlled pricing by default.

---

# 47. Inventory Consumption Timing

Inventory must be deducted when consumption is confirmed as an actual restaurant request.

Recommended flow:

```text
Waiter builds items
↓
Waiter confirms / sends request
↓
Items become confirmed consumption
↓
Inventory deducted
↓
Kardex movements created
↓
Kitchen ticket generated if applicable
```

Do not deduct inventory while the waiter is merely browsing or editing an unconfirmed draft.

---

# 48. Confirming Account Items

Confirmation must be atomic.

Conceptual flow:

```text
BEGIN

Lock account
Validate OPEN status

Validate products
Resolve prices
Resolve costs
Resolve taxes
Resolve compositions
Resolve additional accompaniments

Create account items
Create additional snapshot records

For each resolved inventory item:
    create inventory movement
    update current stock

Create consumption snapshots

Recalculate account totals

Create kitchen order snapshot if required
Create print job if required

Create audit record

COMMIT
```

If any part fails:

```text
ROLLBACK
```

There must never be:

```text
Account item created
Inventory not consumed
```

or:

```text
Inventory consumed
Account item missing
```

---

# 49. Stock Negative During Confirmation

Insufficient stock does not block confirmation when negative inventory is enabled.

Example:

```text
Beef stock:
200 G

Consumption:
350 G
```

Result:

```text
New stock:
-150 G
```

The operation succeeds.

The response must include a stock warning.

Example conceptual response:

```json
{
  "success": true,
  "warnings": [
    {
      "type": "NEGATIVE_STOCK",
      "inventory_item": "Beef",
      "current_stock": -150,
      "unit": "G"
    }
  ]
}
```

---

# 50. Kitchen-Relevant vs Non-Kitchen Products

The current data model does not yet explicitly classify products as kitchen/non-kitchen.

Initial behavior may send all newly confirmed account items to the kitchen printing workflow.

However, implementation should be structured so product-level print routing can later be introduced without rewriting the account model.

For example:

```text
Soda
→ possibly no kitchen print later

Churrasco
→ kitchen print
```

Do not tightly couple account persistence to one physical printer.

---

# 51. Adding More Items Later

An open account may receive additional confirmed items later.

Example:

```text
12:00

Churrasco x2
Soda x2
```

Later:

```text
12:30

Soda x1
Extra patacón x1
```

All belong to the same account.

Only newly confirmed consumption should generate new inventory movements and new kitchen instructions.

Do not re-consume previously confirmed items.

---

# 52. Confirmation Batches

Although there is no separate commercial "order" entity, the system should preserve the concept of confirmation batches operationally.

This may be represented through:

- `kitchen_orders`
- timestamps
- audit events
- print jobs

The account remains the single customer consumption entity.

Do not create a second competing financial order model.

---

# 53. Removing Unconfirmed Items

If an item exists only in frontend draft state and has not been confirmed:

```text
Remove it freely
```

No inventory correction is needed.

No historical sale record is needed.

---

# 54. Removing Confirmed Items

A confirmed account item has already:

- Created historical data
- Consumed inventory
- Potentially been sent to kitchen

Therefore it must not simply be deleted.

Removing/cancelling confirmed consumption is a domain operation.

---

# 55. Cancelling a Confirmed Account Item

Conceptual flow:

```text
Authenticate user
↓
Validate permission
↓
Load OPEN account
↓
Load confirmed item
↓
Require cancellation reason
↓
BEGIN
↓
Create compensating inventory movements
↓
Mark item cancelled/void
↓
Recalculate account totals
↓
Create kitchen cancellation instruction if appropriate
↓
Create audit record
↓
COMMIT
```

The original item remains historically traceable.

---

# 56. Account Item Cancellation Status

The current DDL does not contain an explicit account-item status.

This should be added.

Recommended values:

```text
CONFIRMED
VOID
```

A confirmed item may transition:

```text
CONFIRMED
↓
VOID
```

Do not delete the original account item.

---

# 57. Account Item Void Metadata

Recommended fields:

```text
status
voided_at
voided_by_user_id
void_reason
```

This should be added through a schema migration.

These fields make account-item cancellation explicit and auditable.

---

# 58. Inventory Compensation for Voided Item

Inventory compensation must use the original sale consumption snapshot.

Do not resolve the current product recipe.

Example:

Original sale consumed:

```text
Beef:
350 G at historical configuration

Onion:
10 G
```

Later recipe changed to:

```text
Beef:
400 G
```

If the original item is cancelled, return:

```text
Beef:
350 G

Onion:
10 G
```

using the original consumption snapshot.

Never use the current recipe for historical compensation.

---

# 59. Cost of Inventory Compensation

Compensating stock quantity does not rewrite the historical account-item cost.

The original sale cost snapshot remains intact.

The compensating inventory movement should preserve appropriate metadata identifying:

- Original sale item
- Original movement
- Compensation reason

---

# 60. Kitchen Cancellation

If a confirmed item was already sent to kitchen and is later cancelled, the system should generate a new kitchen instruction.

Example:

```text
CANCEL

Mesa 5

1 x Churrasco

Reason:
Customer changed order
```

Do not delete or rewrite the original kitchen ticket.

Kitchen history remains immutable.

Detailed printing behavior belongs to the Kitchen and Printing module.

---

# 61. Updating Quantity of Confirmed Items

Do not directly modify the quantity of confirmed historical consumption.

Example:

Current:

```text
Churrasco x2
```

User wants:

```text
Churrasco x1
```

Preferred behavior:

```text
Void/cancel one unit
```

or create an explicit adjustment operation.

Similarly:

```text
Churrasco x2
→ Churrasco x3
```

should add one new unit of confirmed consumption.

Do not rewrite previous Kardex movements.

---

# 62. Account Notes

An account may contain general notes.

Example:

```text
Birthday table
Customer wants separate receipts
```

Account notes do not affect pricing or inventory.

---

# 63. Account Void

Voiding an entire open account is allowed only through an explicit domain operation.

Requirements:

- Account is still OPEN.
- User has permission.
- Reason is required.
- Existing confirmed inventory consumption must be compensated.
- Account items remain historically visible.
- Kitchen cancellation information may need to be generated.
- Account becomes `VOID`.
- Table returns to `AVAILABLE`.
- Audit record is created.

---

# 64. Void Account Flow

```text
Authenticate
↓
Validate branch
↓
Require accounts.void
↓
Lock account
↓
Validate OPEN
↓
Require reason
↓
BEGIN
↓
For each active confirmed account item:
    compensate original inventory consumption
    mark item VOID

Mark account VOID
Set closed_at

Set table AVAILABLE

Create kitchen cancellation information if needed

Create audit event

COMMIT
```

---

# 65. Paid Account Cannot Be Voided Through Normal Account Flow

A paid account represents a completed financial transaction.

Do not reuse the open-account void operation for paid accounts.

Any future paid-sale reversal/refund workflow must explicitly coordinate:

- Payment reversal
- Cash
- Inventory
- Account status
- Audit

This belongs to a later payment/refund domain.

---

# 66. Closing Account

The account becomes `PAID` only when financial payment rules are satisfied.

The payments module determines that condition.

Once paid:

```text
Account:
PAID

Table:
AVAILABLE
```

This transition must be atomic with final payment completion.

---

# 67. Table Release

A table becomes `AVAILABLE` when its active account becomes:

```text
PAID
```

or:

```text
VOID
```

The backend should control this automatically.

Do not require the waiter to manually free the table after successful account completion.

---

# 68. Reopening Paid Accounts

The initial system does not support ordinary reopening of paid accounts.

If a mistake is discovered after payment, use an explicit correction/refund workflow later.

Do not implement:

```text
PAID → OPEN
```

as a normal state transition.

---

# 69. Moving an Account Between Tables

Although not originally listed as a core requirement, this is operationally useful and inexpensive to support.

Recommended behavior:

An authorized user may transfer an OPEN account to another available table.

Example:

```text
Mesa 4
Account ABC

Move to:
Mesa 7
```

Flow:

```text
Lock source table
Lock target table
Lock account

Validate target AVAILABLE
↓
Change account.table_id
↓
Source table AVAILABLE
↓
Target table OCCUPIED
↓
Audit
```

No inventory or pricing change occurs.

---

# 70. Moving to RESERVED Table

Moving an account to a reserved table may be allowed for authorized users.

Result:

```text
Target RESERVED
↓
Target OCCUPIED
```

---

# 71. Merging Tables

The initial scope does not require table/account merging.

Do not implement automatic account merges unless explicitly requested.

Account splitting is handled separately in the account split/payment module.

---

# 72. Account Monetary Snapshot Behavior

Account-level totals are current aggregations of active account items.

While the account is open:

```text
subtotal
discount_total
tax_total
service_total
total
```

may be recalculated as items change.

Individual historical confirmed item snapshots must not be rewritten because product catalog values change.

---

# 73. Account Calculation Authority

The frontend may display real-time totals.

The backend is authoritative.

The client should send intent, not authoritative totals.

Bad request design:

```json
{
  "product_id": "...",
  "price": 25000,
  "cost": 10000,
  "total": 25000
}
```

Preferred intent:

```json
{
  "product_id": "...",
  "quantity": 1,
  "additional_accompaniments": [...],
  "notes": "Well done"
}
```

The backend resolves:

- Current valid price
- Current cost
- Taxes
- Inventory consumption
- Totals

---

# 74. Account Concurrency

Multiple devices may interact with the same open account.

Example:

```text
Device A
opens Mesa 5

Device B
opens Mesa 5
```

The account is shared server state.

Operations must be designed to avoid lost updates.

Prefer additive domain commands:

```text
ADD_ACCOUNT_ITEMS
VOID_ACCOUNT_ITEM
UPDATE_ACCOUNT_NOTES
```

rather than sending the entire account object back for replacement.

---

# 75. Optimistic Concurrency

Accounts should use a version or equivalent concurrency mechanism.

Recommended addition:

```text
accounts.version BIGINT NOT NULL DEFAULT 1
```

Every meaningful account mutation increments the version.

Clients may send:

```text
expected_version
```

The backend can detect stale edits.

This is especially useful for multiple waiter devices and offline synchronization.

---

# 76. Do Not Replace Entire Account State

Avoid APIs such as:

```text
PUT /accounts/{id}
```

with:

```json
{
  "all_items": [...]
}
```

that overwrite the entire current account.

Prefer explicit operations:

```text
POST /accounts/{id}/items
POST /accounts/{id}/void-item
POST /accounts/{id}/notes
POST /accounts/{id}/move-table
```

or equivalent command-oriented application services.

This reduces concurrency conflicts and accidental historical rewrites.

---

# 77. Offline Table Data

Offline-capable devices need local access to:

- Dining areas
- Active tables
- Last known table statuses
- Active products
- Product composition
- Additional configuration
- Open accounts relevant to the branch
- User permissions

Table state displayed offline is potentially stale.

The UI should indicate offline status.

---

# 78. Offline Account Opening

Opening a table while offline creates a concurrency risk.

Example:

```text
Device A offline:
opens Mesa 5

Device B online:
opens Mesa 5
```

The server may later receive conflicting account creations.

Offline account creation must use:

- Globally unique account ID
- Globally unique operation ID
- Device ID
- User ID
- Branch ID
- Table ID
- Last known table/account version

---

# 79. Offline Open-Account Conflict

The server remains authoritative for the invariant:

```text
One OPEN account per table
```

If an offline account creation conflicts with an already existing open account, do not silently create two open accounts.

The synchronization layer must detect the conflict.

Preferred behavior:

- Preserve the offline operation.
- Mark synchronization conflict.
- Do not discard locally captured consumption.
- Require resolution by merging/reassigning pending consumption to the authoritative account where appropriate.

The full synchronization UX is defined in the Offline module.

---

# 80. Offline Adding Items to Existing Account

Adding products to an already known account is easier to reconcile than opening conflicting accounts.

Each confirmed batch must have a globally unique operation ID.

When synchronized:

```text
Check operation_id
↓
Already processed?
Yes → return prior result
No → validate account remains OPEN
```

If the account was already paid or voided while the device was offline, the server must reject or conflict the operation rather than silently reopen the account.

---

# 81. Offline Inventory Consumption

The device may calculate provisional inventory consumption locally for UX.

The authoritative inventory mutation occurs on the server during synchronization.

The server must:

- Re-resolve/validate historical requested configuration appropriately.
- Prevent duplicate processing using operation IDs.
- Create authoritative Kardex movements.

Offline behavior must not cause the same product consumption to be deducted twice.

---

# 82. Account Item Identity

Each account item created offline must have a globally unique ID.

Prefer UUIDv7 where supported.

Do not depend on server-generated sequential IDs for sale lines.

---

# 83. Audit Requirements

Audit at minimum:

## Tables

- Manual table status change
- Table activation/deactivation
- Account transfer between tables

## Accounts

- Account opened
- Account voided
- Customer assigned/changed
- Account notes changed

## Account Items

- Item confirmed
- Item voided
- Additional selected
- Free additional applied
- Quantity added
- Item note created/changed when relevant

Audit should preserve meaningful business context without duplicating complete historical snapshots unnecessarily.

---

# 84. Suggested Permissions

Recommended permissions include:

```text
dining_areas.view
dining_areas.create
dining_areas.update
dining_areas.activate
dining_areas.deactivate

tables.view
tables.create
tables.update
tables.change_status
tables.activate
tables.deactivate

accounts.view
accounts.open
accounts.update
accounts.void
accounts.move_table

sales.add_items
sales.void_items
sales.view_prices

customers.view
customers.create
customers.update

kitchen.send
kitchen.reprint
```

Exact permission naming must remain consistent with the centralized authorization module.

---

# 85. Cost Visibility

Waiters do not necessarily need access to product costs or profitability.

The account/order-taking UI should display sale prices but only display cost/profitability when the authenticated user has the relevant permission.

Example:

Without:

```text
products.view_cost
```

do not expose:

```text
unit_cost
profit
margin
```

to the frontend unless required for another authorized operation.

---

# 86. Branch Invariants

The backend must validate that:

- Dining area belongs to branch.
- Table belongs to dining area in branch.
- Account belongs to branch.
- Product belongs to branch.
- Customer belongs to branch under current model.
- Additional accompaniment belongs to branch.
- User has access to branch.

Do not allow cross-branch account composition.

---

# 87. Backend Invariants

The backend must enforce all of the following:

1. A table belongs to exactly one dining area.
2. A dining area belongs to exactly one branch.
3. A table has at most one OPEN account.
4. An OPEN account implies table status OCCUPIED.
5. A PAID or VOID account must not accept new consumption.
6. Product sale quantities must be positive whole numbers.
7. Only active products may be added to new consumption.
8. Only configured additional accompaniments may be selected for a product.
9. Free additional is allowed only when configuration permits it.
10. Free additional still consumes inventory.
11. Item notes do not automatically modify recipe consumption.
12. Product price is resolved by the backend.
13. Product cost is resolved by the backend.
14. Product composition is resolved by the backend.
15. Historical item snapshots are immutable.
16. Confirmed consumption must create corresponding inventory movements.
17. Inventory mutations and account-item persistence must be transactional.
18. Confirmed items must not be physically deleted.
19. Cancelling confirmed items creates compensating inventory movements.
20. Compensation uses the original consumption snapshot, not current recipe.
21. Account voiding must preserve historical items.
22. Paid accounts cannot be reopened through normal order-taking behavior.
23. Closing/voiding an account automatically releases the table.
24. Client-supplied totals are not authoritative.
25. Branch boundaries must always be validated.
26. Offline retries must be idempotent.
27. Concurrency must not create duplicate open accounts for the same table.

---

# 88. Main Use Cases

This module must support at minimum:

```text
Create dining area
View dining areas
Update dining area
Activate/deactivate dining area

Create table
View tables
Update table
Change table status
Activate/deactivate table

Open account
View open account
Associate customer
Update account notes
Move open account to another table
Void open account

Add product to account
Add multiple products
Select additional accompaniments
Mark allowed additional as free
Add item notes
Confirm consumption

Add additional consumption later
View account consumption history

Void confirmed account item
Compensate inventory for voided item

Automatically occupy table
Automatically release table

Attribute account/items to authenticated user
```

---

# 89. Integration With Inventory Module

Confirmed account items:

```text
Product
↓
Resolve product recipe
↓
Resolve accompaniment subrecipes
↓
Resolve selected additional accompaniments
↓
Create consumption snapshot
↓
Inventory mutation service
↓
Immutable SALE movements
↓
Current stock update
↓
Negative stock warning when necessary
```

The Inventory module owns stock mutation rules.

This module owns the restaurant account and consumption intent.

---

# 90. Integration With Kitchen Module

Newly confirmed consumption:

```text
Account item confirmation
↓
Kitchen snapshot generated
↓
Kitchen order record
↓
Print job
```

Later additions generate additional kitchen tickets.

Cancelling previously sent consumption may generate a cancellation ticket.

Kitchen tickets never replace the account.

---

# 91. Integration With Payments Module

The account remains OPEN until financial completion.

Later modules may:

```text
Account
↓
Split
↓
Service
↓
Discounts
↓
Payments
↓
PAID
```

When the payment module determines the account is fully paid:

```text
Account status → PAID
Table status   → AVAILABLE
```

---

# 92. Integration With Reporting

This module provides historical information for:

- Sales by product
- Sales by user/waiter
- Sales by table
- Sales by dining area
- Product quantities
- Account average
- Customer purchase history
- Product historical costs
- Historical profitability

Historical reporting must use sale snapshots.

---

# 93. Non-Goals

This module intentionally does not implement:

- Reservation scheduling
- Delivery
- Takeaway channels
- Multiple commercial orders per table
- Complex kitchen preparation states
- Ingredient-level customization
- Recipe changes from free-text notes
- Table map positioning
- Employee-user relationships
- Final account splitting
- Payment settlement
- Cash reconciliation
- Electronic invoicing
- Paid-sale refund workflow

These belong to other modules or are intentionally excluded.

---

# 94. Required Schema Adjustments

The existing DDL requires a few additions to fully support this specification.

Implement these through migrations.

## 94.1 Enforce One Open Account Per Table

Add:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_account_per_table
ON accounts(table_id)
WHERE status = 'OPEN'
  AND table_id IS NOT NULL;
```

---

# 95. Add Account Item Status

Create an enum or equivalent:

```text
CONFIRMED
VOID
```

Add to `account_items`:

```text
status
```

Default:

```text
CONFIRMED
```

---

# 96. Add Account Item Void Metadata

Add:

```text
voided_at TIMESTAMPTZ NULL

voided_by_user_id UUID NULL
REFERENCES users(id)

void_reason TEXT NULL
```

A voided item remains stored.

---

# 97. Add Account Void Metadata

Recommended additions to `accounts`:

```text
voided_at
voided_by_user_id
void_reason
```

This provides direct operational visibility in addition to audit logs.

---

# 98. Add Account Version

Recommended:

```sql
ALTER TABLE accounts
ADD COLUMN version BIGINT NOT NULL DEFAULT 1;
```

Increment on meaningful account mutations.

This supports:

- Multiple waiter devices
- Optimistic concurrency
- Offline conflict detection

---

# 99. Product Quantity Constraint

The current `account_items.quantity` uses a decimal numeric type.

Current business rules require whole commercial product quantities.

Recommended check:

```sql
ALTER TABLE account_items
ADD CONSTRAINT chk_account_item_quantity_whole
CHECK (
    quantity > 0
    AND quantity = trunc(quantity)
);
```

Keep the numeric column if desired, but enforce whole values.

---

# 100. Historical Account Item Deletion

The current DDL uses:

```text
account_items
REFERENCES accounts
ON DELETE CASCADE
```

The application must never physically delete an operational account.

Therefore historical rows remain safe under normal domain behavior.

Do not expose physical account deletion through application services.

A future hard-delete administrative maintenance operation, if ever introduced, must be outside normal business functionality.

---

# 101. Critical Implementation Principle

Do not model restaurant operation as:

```text
Table
→ Multiple independent Orders
→ Merge later
```

The required domain is:

```text
Table
↓
One active Account
↓
Consumption added over time
```

Kitchen activity is separate:

```text
Account
↓
Confirmed consumption batch
↓
Kitchen ticket
```

The three primary flows are:

```text
TABLE

AVAILABLE
↓
Open Account
↓
OCCUPIED
↓
Consumption
↓
Payment / Void
↓
AVAILABLE
```

```text
CONSUMPTION

Waiter selection
↓
Confirm
↓
Historical sale snapshot
↓
Inventory consumption
↓
Kardex
↓
Kitchen instruction
```

```text
CANCELLATION

Confirmed item
↓
Explicit void
↓
Original item preserved
↓
Inventory compensation
↓
Kitchen cancellation when needed
↓
Audit
```

All implementation decisions must preserve:

- One active account per table
- Historical integrity
- Inventory integrity
- Transactional consistency
- User attribution
- Branch isolation
- Auditability
- Idempotency
- Offline conflict detection