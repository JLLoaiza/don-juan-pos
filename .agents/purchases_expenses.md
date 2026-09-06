# Inventory, Catalog and Costing Module

## Purpose

This document defines the business rules, domain model, invariants and expected behavior for the inventory, product catalog, subrecipe and costing modules.

This document must be treated as authoritative context when implementing or modifying functionality related to:

- Inventory items
- Inventory quantities
- Inventory costs
- Inventory adjustments
- Inventory alerts
- Products
- Product composition
- Accompaniments
- Subrecipes
- Product additional options
- Product costing
- Product pricing
- Profit calculation
- Margin calculation
- Inventory consumption
- Historical cost snapshots

Do not reinterpret the domain concepts described here without an explicit requirement change.

---

# 1. Core Domain Model

The core relationship is:

```text
Inventory Item
      ↓
Accompaniment / Subrecipe
      ↓
Product
      ↓
Sale
      ↓
Inventory Consumption
```

A product can also reference inventory items directly:

```text
Product
├── Inventory Item
├── Inventory Item
└── Accompaniment
    ├── Inventory Item
    └── Inventory Item
```

The system supports exactly one level of reusable subrecipe.

---

# 2. Inventory Item

An inventory item represents something whose physical or countable stock is controlled by the system.

Examples:

- Beef
- Onion
- Pepper
- Lettuce
- Plantain
- Arepa
- Soda 400 ml
- Cleaning product

An inventory item contains at least:

- ID
- Branch
- Name
- Base unit
- Current unit cost
- Current stock
- Minimum stock
- Notes
- Active/inactive state

An inventory item is not necessarily something sold directly to a customer.

Example:

```text
Name: Onion
Unit: G
Unit cost: 2.10
Current stock: 3500
Minimum stock: 2000
```

This means:

```text
1 G costs $2.10
1000 G costs $2100
```

---

# 3. Supported Units

The supported canonical inventory units are:

```text
G
KG
ML
L
UNIT
```

Every inventory item has exactly one canonical unit.

All quantities referencing an inventory item must use that inventory item's canonical unit.

Example:

```text
Inventory item:
Onion

Unit:
G
```

Valid product component:

```text
Onion
10 G
```

Do not persist:

```text
0.01 KG
```

for that item.

The UI may display convenient conversions when useful, but calculations and persisted quantities must use the configured canonical unit.

Do not introduce a separate unit-conversion engine unless explicitly requested.

---

# 4. Inventory Cost

`inventory_items.unit_cost` represents the current cost per canonical inventory unit.

Examples:

```text
Onion
Unit: G
Cost: 2.10
```

```text
Soda 400 ml
Unit: UNIT
Cost: 3000
```

Inventory cost and product sale price are completely separate concepts.

Inventory cost must never be edited through the product editor.

---

# 5. Weighted Average Cost

Current inventory cost uses weighted average costing.

For normal positive inventory, when a confirmed purchase adds stock:

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
Current stock:
100 KG

Current unit cost:
30000

Purchase:
50 KG

Purchase unit cost:
36000
```

Result:

```text
Old value:
100 * 30000 = 3000000

Purchase value:
50 * 36000 = 1800000

New value:
4800000

New stock:
150 KG

New unit cost:
32000
```

The inventory item becomes:

```text
Stock: 150 KG
Unit cost: 32000
```

The purchase item must preserve the actual purchase price of `36000`.

The purchase cost and the resulting current weighted-average cost are different concepts.

---

# 6. Negative Inventory

Negative stock is allowed.

A sale must not fail solely because an inventory item does not have sufficient stock.

Example:

```text
Current stock:
0 UNIT

Sale consumption:
1 UNIT

Result:
-1 UNIT
```

The system must:

1. Complete the valid sale operation.
2. Create the inventory movement.
3. Update current stock.
4. Detect the negative result.
5. Generate an operational warning.
6. Make the negative stock visible in inventory views and dashboards.

Negative inventory must never be silently ignored.

---

# 7. Purchasing Into Negative Inventory

Negative stock represents a stock deficit.

Do not apply the ordinary weighted-average formula directly against negative inventory.

Example:

```text
Current stock:
-5 KG

Current unit cost:
30000

Purchase:
10 KG

Purchase unit cost:
40000
```

The first 5 KG compensate for the deficit.

Resulting physical stock:

```text
5 KG
```

The resulting positive inventory uses the incoming purchase cost:

```text
New unit cost:
40000
```

Result:

```text
Stock:
5 KG

Unit cost:
40000
```

This prevents negative historical inventory from distorting the value of newly acquired positive stock.

---

# 8. Stock Minimum

Every inventory item has a configurable minimum stock.

Inventory state must be derived using the following precedence:

```text
NEGATIVE_STOCK
OUT_OF_STOCK
LOW_STOCK
OK
```

Rules:

```text
NEGATIVE_STOCK:
current_stock < 0

OUT_OF_STOCK:
current_stock = 0

LOW_STOCK:
current_stock > 0
AND current_stock < minimum_stock

OK:
current_stock >= minimum_stock
```

The system should expose stock alerts to the dashboard and inventory interface.

---

# 9. Manual Inventory Adjustments

Authorized users may manually adjust inventory.

Examples:

```text
Physical count correction
Stock reconciliation
Manual entry
Manual removal
```

Every adjustment must:

- Require an amount.
- Require a reason.
- Create an inventory movement.
- Record stock before.
- Record stock after.
- Record the responsible user.
- Record timestamp.
- Be auditable.

Example:

```text
System stock:
100 KG

Physical stock:
95 KG

Adjustment:
-5 KG

Reason:
Physical count
```

The movement records:

```text
stock_before = 100
quantity = -5
stock_after = 95
```

A quantity adjustment does not automatically modify unit cost.

---

# 10. Inventory Movement Immutability

Inventory movements are immutable historical facts.

Once created, an inventory movement:

- Must not be updated.
- Must not be deleted.
- Must not be overwritten.
- Must not be silently corrected.

If a mistake occurred, create a new compensating movement.

Example:

```text
Incorrect movement:
-5 KG

Correction:
+5 KG
```

Both records remain in the Kardex.

---

# 11. Product

A product represents something sold by the business.

Examples:

- Churrasco de res
- Lomo de cerdo
- Soda 400 ml

A product contains at least:

- ID
- Branch
- Name
- Description
- Sale price
- Calculated cost
- Image
- Notes
- Tax configuration
- Active/inactive state
- Product composition
- Available additional accompaniments

Products do not use categories.

---

# 12. Product Composition

A product can contain:

1. Direct inventory items
2. Accompaniments / subrecipes

Example:

```text
Product:
Churrasco de res

Composition:

Beef
350 G

Antipasto
1 portion

Lettuce
10 G

Plantain
1 UNIT

Arepa with sautéed vegetables
1 portion
```

The system must resolve the complete composition into physical inventory items before calculating cost or inventory consumption.

---

# 13. Accompaniment

An accompaniment is a reusable subrecipe.

This is an important domain definition.

An accompaniment:

- Is composed exclusively of inventory items.
- Has its own reusable composition.
- Has a calculated cost.
- Can be included inside a product.
- Can also be offered as an additional option.
- Can have a default additional sale price.
- Is not itself an inventory item.

Example:

```text
Accompaniment:
Antipasto

Components:

Onion
10 G

Pepper
10 G
```

The accompaniment cost is:

```text
10 * onion.unit_cost
+
10 * pepper.unit_cost
```

---

# 14. Subrecipe Nesting Rule

Only one level of reusable subrecipe is supported.

Allowed:

```text
Product
└── Accompaniment
    └── Inventory Item
```

Allowed:

```text
Product
└── Inventory Item
```

Not allowed:

```text
Product
└── Accompaniment
    └── Accompaniment
        └── Inventory Item
```

An accompaniment can only contain inventory items.

Do not implement recursive subrecipes unless explicitly requested later.

---

# 15. Product Cost Calculation

Product cost is always calculated from current inventory costs.

It must never be manually editable.

Formula:

```text
product_cost =
    direct_inventory_cost
    +
    accompaniment_cost
```

Direct inventory cost:

```text
sum(
    component_quantity
    *
    inventory_item.unit_cost
)
```

Accompaniment cost:

```text
sum(
    accompaniment_quantity
    *
    sum(
        accompaniment_component.quantity
        *
        inventory_item.unit_cost
    )
)
```

Example:

```text
Beef:
350 G * $35 = $12,250

Antipasto:
10 G onion * $2.10 = $21
10 G pepper * $3 = $30

Antipasto cost:
$51

Lettuce:
10 G * $5 = $50

Plantain:
1 UNIT * $1500 = $1500

Arepa:
1 portion = $1800
```

Product cost:

```text
$15,651
```

---

# 16. Cached Product Cost

`products.calculated_cost` may store the calculated product cost for performance.

It is derived data.

The authoritative source remains:

```text
product_components
+
accompaniment_components
+
inventory_items.unit_cost
```

The client must not be able to submit an arbitrary `calculated_cost` and have the backend trust it.

---

# 17. Product Pricing Model

The pricing interface exposes:

```text
Calculated Cost
Sale Price
Profit
Margin
```

Rules:

```text
Calculated Cost:
readonly

Sale Price:
editable

Profit:
editable

Margin:
editable
```

Only the sale price needs to be persisted as the actual product pricing value.

Profit and margin are derived from sale price and current calculated cost.

---

# 18. Pricing Formulas

Definitions:

```text
profit =
    sale_price - calculated_cost

margin =
    profit / sale_price
```

For percentage display:

```text
margin_percentage =
    margin * 100
```

---

# 19. Editing Sale Price

When sale price changes:

```text
profit =
    sale_price - cost

margin =
    profit / sale_price
```

Example:

```text
Cost:
20000

New sale price:
65000

Profit:
45000

Margin:
69.23%
```

---

# 20. Editing Profit

When the user edits desired profit:

```text
sale_price =
    cost + desired_profit

margin =
    desired_profit / sale_price
```

Example:

```text
Cost:
20000

Desired profit:
50000

Sale price:
70000

Margin:
71.43%
```

---

# 21. Editing Margin

When the user edits desired margin:

```text
sale_price =
    cost / (1 - margin)

profit =
    sale_price - cost
```

If margin is entered as a percentage:

```text
sale_price =
    cost / (1 - margin_percentage / 100)
```

Example:

```text
Cost:
20000

Desired margin:
60%

Sale price:
50000

Profit:
30000
```

---

# 22. Margin Validation

A margin of exactly 100% is invalid because it produces division by zero.

Do not accept:

```text
margin >= 100%
```

Negative margin may be allowed.

This permits selling below cost intentionally.

Example:

```text
Cost:
10000

Price:
8000

Profit:
-2000

Margin:
-25%
```

---

# 23. Cost Changes Must Not Change Product Price

When an inventory cost changes, affected product costs must be recalculated.

The sale price must remain unchanged.

Example:

Before:

```text
Cost:
18250

Price:
65000

Profit:
46750

Margin:
71.92%
```

After ingredient costs increase:

```text
Cost:
20000

Price:
65000

Profit:
45000

Margin:
69.23%
```

The system must not automatically adjust sale price.

---

# 24. Composition Changes Must Not Change Product Price

If a product recipe changes:

```text
Beef:
350 G
```

becomes:

```text
Beef:
400 G
```

the system must:

- Recalculate product cost.
- Recalculate current profit.
- Recalculate current margin.
- Preserve current sale price.

---

# 25. Additional Accompaniments

An additional is not a separate recipe model.

An additional is an existing accompaniment configured as available for a specific product.

Example:

```text
Product:
Churrasco

Available additional accompaniments:

Cheese
Bacon
Antipasto
Extra arepa
```

Each product-additional relationship may contain:

- Accompaniment reference
- Optional price override
- Whether free selection is allowed
- Display order
- Active/inactive state

---

# 26. Additional Pricing

Every accompaniment may define:

```text
default_price
```

A product can optionally define:

```text
price_override
```

Effective additional price:

```text
if price_override is not null:
    use price_override
else:
    use accompaniment.default_price
```

Changing a product-specific price override must not modify the accompaniment default price.

---

# 27. Free Additional

If allowed by product configuration, a user can mark an additional as:

```text
No charge
```

Example:

```text
Bacon
Normal price:
5000

Current sale:
0
```

This changes only the current sale line.

It must not modify:

- The accompaniment default price.
- The product-specific price override.
- The accompaniment composition.

A free additional still consumes inventory.

Price and inventory consumption are independent.

---

# 28. Included Accompaniments vs Additional Accompaniments

An accompaniment may be used in two ways:

## Base product component

Example:

```text
Churrasco
└── Antipasto x1
```

This is already included in the product sale price.

## Additional

Example:

```text
Churrasco
└── Extra Antipasto +$2000
```

Both use the same accompaniment definition.

Both consume the same underlying inventory according to quantity.

Only their commercial pricing behavior differs.

---

# 29. Inventory Consumption

When a sold product is confirmed, its composition must be expanded into physical inventory consumption.

Example:

```text
Churrasco x2

Composition:
Beef 350 G
Antipasto x1
Lettuce 10 G
Plantain 1 UNIT
```

Antipasto:

```text
Onion 10 G
Pepper 10 G
```

Final inventory consumption:

```text
Beef:
-700 G

Onion:
-20 G

Pepper:
-20 G

Lettuce:
-20 G

Plantain:
-2 UNIT
```

Do not create an inventory movement for `Antipasto`.

Antipasto is a recipe abstraction, not inventory.

---

# 30. Additional Inventory Consumption

Selected additional accompaniments must also be expanded into their inventory components.

This is true regardless of their sale price.

Example:

```text
Extra bacon:
$0
```

If the bacon accompaniment consumes:

```text
Bacon inventory:
100 G
```

then the sale must still generate:

```text
Bacon:
-100 G
```

---

# 31. Sale Consumption Snapshot

When a product is sold, preserve a historical consumption snapshot.

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

The snapshot represents the exact cost and inventory composition at sale time.

Historical sales must not recalculate using current recipes or current costs.

---

# 32. Historical Integrity

Changes to current catalog data must never rewrite historical transactions.

Changes that must not affect historical sales include:

- Product rename
- Product price change
- Product composition change
- Inventory cost change
- Accompaniment composition change
- Accompaniment rename
- Additional price change
- Tax configuration change

Historical transactions must preserve their own snapshots.

---

# 33. Product Cost Dependency Recalculation

Changing an inventory item cost can affect products directly or indirectly.

Direct dependency:

```text
Inventory Item
↓
Product Component
↓
Product
```

Indirect dependency:

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

Whenever `inventory_items.unit_cost` changes:

1. Find products referencing the inventory item directly.
2. Find accompaniments containing the inventory item.
3. Find products using those accompaniments.
4. Recalculate all affected product costs.
5. Persist updated cached costs where applicable.
6. Do not modify sale prices.

---

# 34. Product Editor Behavior

The product editor should provide a live summary.

Example:

```text
CHURRASCO DE RES

Sale price:
$65,000

Calculated cost:
$18,250

Profit:
$46,750

Margin:
71.92%
```

The calculated cost field is readonly.

The following are editable:

```text
Sale price
Profit
Margin
```

Editing one must immediately recalculate the other two.

---

# 35. Product Composition UI

The product editor should clearly separate:

```text
Direct inventory components

Accompaniments / subrecipes

Available additional accompaniments
```

Example:

```text
Composition

Direct inventory:
Beef        350 G
Lettuce      10 G
Plantain      1 UNIT

Subrecipes:
Antipasto     1
Arepa         1

Additional options:
Extra cheese       +4000
Extra antipasto    +2000
```

---

# 36. Current Profitability Preview

The product editor must show current profitability based on current inventory costs.

Example:

```text
Product:
Churrasco de res

Sale price:
$65,000

Calculated cost:
$18,250

Profit:
$46,750

Margin:
71.92%
```

This is a current pricing preview.

It is not a historical profitability report.

---

# 37. Inventory UI

The inventory interface should show at minimum:

- Name
- Unit
- Current unit cost
- Current stock
- Minimum stock
- Current stock status
- Active/inactive state

Example:

```text
Beef

Unit:
G

Current cost:
$35 / G

Current stock:
4500 G

Minimum stock:
10000 G

Status:
LOW_STOCK
```

Negative stock should be visually prominent.

---

# 38. Active and Inactive Inventory Items

Inventory items use soft deactivation.

Inactive inventory items:

- Cannot be added to new product recipes.
- Cannot be added to new accompaniment recipes.
- Remain available in historical transactions.
- Remain visible in Kardex/history.
- Must not be physically deleted.

If an active product references an inactive inventory item, preserve the product but show an administrative warning.

---

# 39. Active and Inactive Accompaniments

Inactive accompaniments:

- Cannot be added to new product configurations.
- Cannot be selected as new additional options.
- Remain valid in historical transactions.
- Must not be physically deleted.

If an active product currently depends on an inactive accompaniment, show an administrative warning.

---

# 40. Active and Inactive Products

Inactive products:

- Cannot be added to new sales.
- Remain visible in historical sales.
- Remain available to reporting.
- Remain available to authorized administrators.
- Must not be physically deleted.

---

# 41. Inventory Unit Changes

Changing an inventory item's canonical unit changes the meaning of all historical quantities and costs.

Therefore:

If an inventory item has historical movements or historical transactional references, its canonical unit must not be changed.

Instead:

1. Deactivate the old inventory item.
2. Create a new inventory item.
3. Configure the desired new unit.
4. Update active recipes to use the new item when appropriate.

Example:

Do not change:

```text
Onion
G
```

into:

```text
Onion
KG
```

after historical usage exists.

Create a new inventory item instead.

---

# 42. Transactional Integrity

Operations that modify multiple related records must use a PostgreSQL transaction.

Example product creation:

```text
BEGIN

Create product
Create product components
Create additional relationships
Calculate product cost
Persist calculated cost
Create audit record

COMMIT
```

If any step fails:

```text
ROLLBACK
```

Never allow partially created product compositions.

---

# 43. Inventory Cost Update Transaction

When a purchase modifies current inventory stock and cost:

```text
BEGIN

Lock inventory item

Read current stock
Read current unit cost

Calculate resulting stock
Calculate weighted average cost

Update inventory item

Create immutable inventory movement

Find affected products
Recalculate product costs

Create required audit records

COMMIT
```

Concurrent updates must not calculate inventory costs using stale data.

Use appropriate PostgreSQL row locking when required.

---

# 44. Inventory Adjustments Transaction

Manual adjustment:

```text
BEGIN

Lock inventory item

Validate permission

Read current stock

Calculate stock_after

Create immutable inventory movement

Update current_stock

Create audit record

COMMIT
```

A manual adjustment does not modify `unit_cost`.

---

# 45. Permissions

Recommended permissions include:

```text
products.view
products.create
products.update
products.activate
products.deactivate
products.view_cost

inventory.view
inventory.create
inventory.update
inventory.adjust
inventory.view_movements
inventory.view_cost

accompaniments.view
accompaniments.create
accompaniments.update
accompaniments.activate
accompaniments.deactivate

pricing.view
pricing.update
```

Exact permission naming should remain consistent with the centralized authorization module.

Cost and profitability access should be separable from basic product access.

---

# 46. Audit Requirements

Audit at minimum:

## Products

- Product creation
- Product modification
- Price modification
- Product activation
- Product deactivation
- Composition modification
- Additional configuration modification

## Inventory

- Inventory item creation
- Inventory item modification
- Activation/deactivation
- Manual stock adjustment
- Cost changes caused by purchasing

## Accompaniments

- Accompaniment creation
- Accompaniment modification
- Composition modification
- Default price modification
- Activation/deactivation

Audit data should preserve relevant before and after state.

---

# 47. Backend Invariants

The backend must enforce all of the following:

1. Product cost is derived and cannot be authoritatively supplied by the client.
2. Inventory unit must be one of the supported canonical units.
3. Inventory component quantities must be positive.
4. Accompaniment component quantities must be positive.
5. Accompaniments may contain only inventory items.
6. Accompaniments may not contain other accompaniments.
7. A product component references either an inventory item or an accompaniment, never both.
8. Historical sales must remain valid after catalog changes.
9. Inventory movements are immutable.
10. Manual adjustments require a reason.
11. Negative stock does not block sales when negative inventory is enabled.
12. Additional sale price does not affect physical inventory consumption.
13. A free additional still consumes inventory.
14. Current inventory cost changes do not modify historical sales.
15. Product composition changes do not modify historical sales.
16. Product price changes do not modify historical sales.
17. Current cost changes must recalculate affected product costs.
18. Product price must not automatically change because cost changed.
19. Canonical inventory units with historical usage must not be changed.
20. Inactive catalog entities must not be physically deleted if historical references may exist.

---

# 48. Offline Requirements

Offline sales require a local copy of enough catalog data to calculate and display orders.

At minimum, offline-capable clients should cache:

- Active products
- Product prices
- Product compositions
- Active accompaniments
- Accompaniment compositions
- Product additional configurations
- Relevant inventory item identifiers and units
- Tax configuration
- User permissions

The local device may cache product cost information for display.

The server remains authoritative after synchronization.

---

# 49. Offline Catalog Conflict Rules

Catalog editing is more conflict-sensitive than sale creation.

Initial behavior:

- Do not silently overwrite newer server-side catalog changes.
- Detect conflicting updates to the same catalog entity.
- Preserve conflict information.
- Require explicit administrative resolution when necessary.

Do not apply ordinary last-write-wins behavior to recipe, pricing or inventory configuration changes unless explicitly designed later.

---

# 50. Source of Truth

Authoritative current data:

```text
Inventory quantity:
inventory_items.current_stock

Inventory cost:
inventory_items.unit_cost

Accompaniment composition:
accompaniment_components

Product composition:
product_components

Product sale price:
products.sale_price
```

Authoritative historical data:

```text
Inventory history:
inventory_movements

Historical sale cost:
account_items.unit_cost

Historical sale consumption:
account_items.consumption_snapshot
```

Derived current data:

```text
Accompaniment cost
Product calculated cost
Product current profit
Product current margin
Inventory stock status
```

Derived values may be cached but must always remain reproducible from authoritative data.

---

# 51. Main Use Cases

The module must support at minimum:

```text
Create inventory item
View inventory item
Update inventory item
Activate inventory item
Deactivate inventory item

View current inventory
View current inventory cost
View stock alerts
View inventory Kardex
Adjust inventory

Create accompaniment
View accompaniment
Update accompaniment
Configure accompaniment components
Activate accompaniment
Deactivate accompaniment

Create product
View product
Update product
Configure product composition
Configure product additional accompaniments
Activate product
Deactivate product

Calculate accompaniment cost
Calculate product cost

Edit sale price
Edit target profit
Edit target margin

Recalculate product profitability

Resolve sale inventory consumption
Create sale consumption snapshot
```

---

# 52. Integration With Purchases

Confirmed purchases affect this module as follows:

```text
Purchase confirmed
↓
Purchase items validated
↓
Inventory item locked
↓
Stock increased
↓
Weighted-average cost calculated
↓
Inventory movement created
↓
Inventory item updated
↓
Dependent product costs recalculated
↓
Audit generated
```

The purchasing module owns purchase lifecycle rules.

This module owns inventory quantity, current inventory cost and dependent product-cost recalculation.

---

# 53. Integration With Sales

When a sale item is confirmed:

```text
Product
↓
Resolve direct inventory components
↓
Resolve accompaniment subrecipes
↓
Resolve selected additional accompaniments
↓
Aggregate physical inventory consumption
↓
Capture historical cost snapshot
↓
Create immutable inventory movements
↓
Update current stock
↓
Generate negative-stock alerts if necessary
```

The sales module owns account and sale lifecycle rules.

This module owns inventory consumption resolution and stock mutation.

---

# 54. Integration With Reporting

Reporting must be able to distinguish:

```text
Current inventory cost
Current product cost
Historical sale cost
Actual purchase cost
```

Do not calculate historical profitability by joining historical sales against current inventory costs.

Historical reporting must use sale-time snapshots.

---

# 55. Non-Goals

This module intentionally does not support:

- Waste or merma tracking
- Manufacturing
- Production batches
- Yield calculations
- Recursive subrecipes
- Nested accompaniments
- Automatic recipe scaling by production batch
- Complex unit-conversion configuration
- Reservations
- Delivery
- Electronic invoicing
- Full supplier workflow
- Cash management
- Payroll

These concerns either belong to other modules or are intentionally excluded from the current system scope.

---

# 56. Critical Implementation Principle

Do not implement this module as independent CRUD screens.

The domain relationships must always remain intact.

The most important flows are:

```text
Inventory Item
↓
Accompaniment
↓
Product
↓
Current Cost
↓
Pricing
```

```text
Purchase
↓
Inventory Stock
↓
Weighted Average Cost
↓
Product Cost
↓
Current Profitability
```

```text
Product Sale
↓
Recipe Resolution
↓
Subrecipe Resolution
↓
Physical Inventory Consumption
↓
Historical Cost Snapshot
↓
Immutable Inventory Movements
```

All implementation decisions must preserve transactional consistency, historical integrity and auditability.