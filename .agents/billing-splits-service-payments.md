# Billing, Account Splits, Service, Discounts and Payments Module

## Purpose

This document defines the business rules, domain model, formulas, transactional behavior and expected implementation for:

- Account totals
- Account-level discounts
- Item-level discounts
- Service charge
- Service percentage
- Total with service
- Total without service
- Splitting accounts by item
- Splitting accounts by percentage
- Independent service percentage per split
- Mixed payments
- Payment validation
- Payment completion
- Account completion
- Split completion
- Payment receipts
- Audit requirements
- Offline considerations

This document must be treated as authoritative context when implementing or modifying billing, account splitting, service or payment functionality.

The Tables, Accounts and Order Taking module remains authoritative for account lifecycle and account items.

The Cash module remains authoritative for cash-session behavior.

The Printing module remains authoritative for payment receipt generation and physical printing.

Do not reinterpret the concepts described here without an explicit requirement change.

---

# 1. Core Billing Principle

An account represents all consumption associated with a table visit.

Billing derives from:

```text id="u7pvdn"
Account
↓
Active Account Items
↓
Item Prices
↓
Discounts
↓
Taxes
↓
Subtotal
↓
Service
↓
Final Total
```

The backend is always authoritative for financial calculations.

The frontend may calculate and display real-time previews, but client-supplied totals must never be trusted.

---

# 2. Financial Precision

Money must use decimal arithmetic.

Do not use binary floating-point types for authoritative calculations.

Use:

```text id="lp8fwa"
NUMERIC / decimal
```

for:

- Prices
- Discounts
- Taxes
- Service
- Payments
- Totals

Internal calculations may use greater precision than displayed values.

Round only at defined financial boundaries.

---

# 3. Rounding

Use two decimal places for monetary totals unless currency configuration explicitly states otherwise.

For COP, the UI may display whole pesos if desired, but backend persistence should remain decimal-safe.

Recommended rounding mode:

```text id="sks4ia"
ROUND_HALF_UP
```

Use one consistent rounding strategy throughout backend and frontend.

Do not allow different modules to implement different rounding rules.

---

# 4. Account Item Base Amount

For each active account item:

```text id="y5v37v"
gross_line_amount =
unit_price * quantity
```

Additional accompaniments with a sale price contribute to the commercial amount.

Example:

```text id="yvec8i"
Churrasco:
65,000

Extra antipasto:
2,000

Line commercial amount:
67,000
```

Free additional accompaniments contribute:

```text id="onspnb"
0
```

to price, while still consuming inventory.

---

# 5. Item-Level Discounts

A discount may apply directly to an account item.

Supported types:

```text id="f2cf7c"
FIXED
PERCENTAGE
```

Example percentage:

```text id="ybcjrb"
Line:
50,000

Discount:
10%

Discount amount:
5,000

Net line:
45,000
```

Example fixed:

```text id="m447gh"
Line:
50,000

Discount:
7,000

Net line:
43,000
```

---

# 6. Item Discount Limits

An item discount must never reduce an item's commercial value below zero.

Rule:

```text id="3u5c8v"
discount_amount <= gross_line_amount
```

If a requested discount exceeds the line value, reject it or cap it according to explicit UI behavior.

Preferred behavior:

```text id="a8kszj"
Reject invalid discount
```

rather than silently cap.

---

# 7. Account-Level Discounts

An account may also receive discounts that apply to the account subtotal.

Supported types:

```text id="eypif0"
FIXED
PERCENTAGE
```

Account-level discounts are applied after item-level discounts.

Conceptual order:

```text id="s78xjk"
Gross item amount
↓
Item discounts
↓
Net item totals
↓
Account subtotal before account discount
↓
Account-level discount
↓
Discounted subtotal
```

---

# 8. Discount Ordering

Use this calculation order:

```text id="l4foox"
1. Calculate gross line amounts
2. Apply item-level discounts
3. Sum net line amounts
4. Apply account-level discounts
5. Calculate taxes according to tax rules
6. Determine service base
7. Calculate service
8. Calculate final total
```

Do not apply service before discounts.

---

# 9. Service Charge

Service is an optional percentage-based charge.

It is not an inventory item.

It is not a product.

It is not a tax.

It must be represented separately.

The account stores:

```text id="2dr7wk"
service_percentage
service_total
```

---

# 10. Default Service Percentage

Each branch may define a default service percentage.

Example:

```text id="9v9lxv"
default_service_percentage = 10
```

When an account is opened or billing is initialized, the default may be applied.

The user may later modify or disable it if authorized.

---

# 11. Service Enabled State

The UI must support:

```text id="mf114m"
[✓] Apply service
```

When service is enabled:

- Show editable percentage.
- Show calculated service amount.
- Show total with service.
- Show total without service.

When service is disabled:

```text id="o5omns"
service_percentage = 0
service_total = 0
```

The total excludes service.

---

# 12. Service Calculation Base

Service is calculated after discounts.

The base is the discounted subtotal before service.

Conceptually:

```text id="ac193b"
service_base =
subtotal_after_discounts
```

Then:

```text id="pmduv2"
service_total =
service_base * service_percentage / 100
```

Example:

```text id="gw2oxe"
Subtotal:
100,000

Discount:
10,000

Service base:
90,000

Service:
10%

Service total:
9,000
```

---

# 13. Taxes and Service

Tax treatment may vary by jurisdiction or configuration.

For the initial internal system, preserve taxes as a separate amount and do not implicitly tax the service unless explicitly configured.

Default conceptual total:

```text id="rwq9hs"
final_total =
discounted_subtotal
+ tax_total
+ service_total
```

Do not hardcode fiscal assumptions beyond configured tax behavior.

---

# 14. Total With and Without Service

The account UI must display both:

```text id="y2tmgi"
Total without service
Total with service
```

when service is active.

Example:

```text id="yuaerk"
Subtotal after discounts:
100,000

Taxes:
0

Service 10%:
10,000

Total without service:
100,000

Total with service:
110,000
```

These values must update in real time.

---

# 15. Service Percentage Editing

Service percentage must be editable when the user has the appropriate permission.

Valid range:

```text id="hvea6n"
0 <= service_percentage < 100
```

A percentage of 0 means no service charge.

The frontend should immediately update:

- Service amount
- Total with service

The backend recalculates authoritatively.

---

# 16. Independent Service Per Split

When an account is divided, every resulting split may have its own service configuration.

Example:

```text id="mbhi38"
Split A:
Service 10%

Split B:
Service 0%

Split C:
Service 15%
```

This is explicitly supported.

Changing service on one split must not alter service on the others.

---

# 17. Account Split

A split represents a payable subdivision of an account.

A split does not create another restaurant table account.

The original account remains the parent.

Relationship:

```text id="h1lc4f"
Account
├── Split A
├── Split B
└── Split C
```

Payments may be associated with individual splits.

---

# 18. Supported Split Types

Supported split types are:

```text id="53vybn"
BY_ITEM
BY_PERCENTAGE
```

No equal-person split mode is required beyond what can be represented using percentages.

---

# 19. Split by Item

`BY_ITEM` allows assigning account item quantities to different payable splits.

Example:

```text id="4vptua"
Account:

2 x Churrasco
2 x Soda
1 x Extra antipasto
```

Split A:

```text id="mcftxq"
1 x Churrasco
1 x Soda
```

Split B:

```text id="mwjx1m"
1 x Churrasco
1 x Soda
1 x Extra antipasto
```

---

# 20. Partial Quantity Allocation

If an account item has quantity greater than one, its quantity may be divided.

Example:

```text id="1jtd5b"
Soda x4
```

Valid:

```text id="fhu93k"
Split A:
2

Split B:
1

Split C:
1
```

Allocation must use whole commercial product quantities.

---

# 21. Complete Item Allocation

For a finalized item-based split, all active account-item quantities must be allocated exactly once.

For every account item:

```text id="8hn5d7"
sum(split_item.quantity)
=
account_item.quantity
```

Do not allow:

```text id="ylu7fb"
under-allocation
```

or:

```text id="1l4axq"
over-allocation
```

when the split configuration is being finalized.

---

# 22. Additional Accompaniments in Item Splits

Additional accompaniments belong to their parent account item.

If one unit of a product is allocated to a split, its attached additional configuration follows that product unit.

If an aggregated account item represents multiple units with different additions, those should already have been stored as separate account items according to the order-taking module.

Do not split an additional independently from the product unit it belongs to unless explicitly modeled later.

---

# 23. Item Split Totals

For item-based splits, subtotal is derived from assigned product quantities and their historical commercial values.

Do not recalculate product prices using current catalog prices.

Use the account-item historical sale snapshot.

---

# 24. Split by Percentage

`BY_PERCENTAGE` divides the account's payable subtotal proportionally.

Example:

```text id="t48m63"
Account subtotal:
200,000
```

Splits:

```text id="hshyip"
A:
40%

B:
35%

C:
25%
```

Result before service:

```text id="nemqbe"
A:
80,000

B:
70,000

C:
50,000
```

---

# 25. Percentage Sum

Percentage splits must total exactly:

```text id="kbme7e"
100%
```

before they can be finalized or fully paid.

Invalid:

```text id="eflghl"
30%
30%
30%
```

because:

```text id="pgzv20"
90%
```

Valid:

```text id="b2r60e"
30%
30%
40%
```

---

# 26. Percentage Precision

Percentage values may support decimal precision.

Example:

```text id="vryqbt"
33.33%
33.33%
33.34%
```

The total must still equal 100% within the defined decimal precision.

Do not use floating-point comparison.

---

# 27. Percentage Split Base

Percentage splitting applies to the account subtotal before service, after discounts.

This is a core requirement.

Conceptually:

```text id="ss1030"
Account gross
↓
Discounts
↓
Discounted subtotal
↓
Percentage allocation
↓
Per-split service
↓
Per-split final total
```

Do not split the total after global service.

---

# 28. Percentage Split Taxes

If taxes are present, allocate taxes proportionally using the same split percentage unless explicit item-level attribution is available.

Example:

```text id="le518w"
Account tax:
20,000

Split A:
40%

Tax A:
8,000
```

Ensure total allocated tax equals original account tax after rounding reconciliation.

---

# 29. Rounding Reconciliation for Percentage Splits

Percentage splits can create rounding differences.

Example:

```text id="lpmqwo"
Total:
100

33.33%
33.33%
33.34%
```

Rounded values must still sum to the original amount.

Preferred rule:

1. Calculate high-precision split values.
2. Round each split.
3. Calculate rounding residual.
4. Apply residual to the final split or deterministically selected split.

Example:

```text id="e3wuwb"
A = 33.33
B = 33.33
C = 33.34
```

Never allow split totals to differ from the source account because of rounding.

---

# 30. Split Service Calculation

After subtotal allocation:

```text id="g1wof4"
split_service =
split_subtotal_after_discounts
* split_service_percentage
/ 100
```

Example:

```text id="2ca49a"
Split A subtotal:
80,000

Service:
10%

Service:
8,000

Final:
88,000
```

Another split may choose:

```text id="e81wpi"
0%
```

service independently.

---

# 31. Account Service When Splitting

Once an account is actively being settled through independent splits, service should be calculated at split level for payment purposes.

Do not double-charge:

```text id="0rmyun"
account service
+
split service
```

The original account may retain default/current service configuration as reference, but split totals are authoritative for split settlement.

---

# 32. Split Lifecycle

Recommended split statuses:

```text id="3j0145"
OPEN
PAID
VOID
```

A split begins:

```text id="sl2gze"
OPEN
```

When fully paid:

```text id="svtd39"
PAID
```

A split may be voided before financial completion if the split arrangement is abandoned.

---

# 33. Reconfiguring Splits

If no split has received payments yet, an authorized user may discard and recreate the split configuration.

If any split already has payment activity:

Do not silently rebuild the entire split arrangement.

Require explicit correction/reversal behavior.

This prevents payment references from becoming invalid.

---

# 34. Payment

A payment represents money received toward:

- A full account
- A specific account split

A payment contains at least:

- ID
- Account
- Optional split
- Payment method
- Amount
- Reference
- User who received payment
- Timestamp
- Notes

---

# 35. Supported Payment Methods

Initial configured payment types:

```text id="9y9mlv"
CASH
QR
CARD
```

The system may have multiple configured methods of the same type.

Example:

```text id="0rtxkt"
Card - Bold
Card - Other
QR - Nequi
QR - Bancolombia
Cash
```

The type determines financial behavior.

---

# 36. Mixed Payments

A payable amount may be satisfied using multiple payment methods.

Example:

```text id="yp8p4y"
Total:
150,000

Cash:
50,000

Card:
70,000

QR:
30,000
```

This is valid.

Each payment is stored as an independent `payments` record.

---

# 37. Mixed Payment on Split

Mixed payment is also allowed on an individual split.

Example:

```text id="44e361"
Split A total:
80,000

Cash:
30,000

Card:
50,000
```

Split A becomes paid when total successful payments equal its final total.

---

# 38. Payment Amount

Payment amount must be:

```text id="plqr03"
amount > 0
```

Do not store negative payments as ordinary payment records.

Refunds/reversals require explicit future domain operations.

---

# 39. Payment Target

A payment must target either:

```text id="t83cz8"
Account directly
```

or:

```text id="hkvwus"
Account + Account Split
```

If `account_split_id` is present:

- The split must belong to the same account.
- The split must be OPEN.
- Payment must contribute only to that split.

---

# 40. Account Without Splits

If an account has no finalized splits, payments apply directly to the account.

Completion rule:

```text id="o7w7wb"
sum(valid payments)
=
account final total
```

Then:

```text id="mewdfz"
Account → PAID
Table → AVAILABLE
```

---

# 41. Account With Finalized Splits

If an account is being settled through finalized splits, direct account-level payments should not be mixed arbitrarily with split-level payments.

Preferred invariant:

```text id="8yv649"
Settlement mode is either:
DIRECT
or
SPLIT
```

Once split settlement begins, payments should target splits.

This avoids ambiguous balances.

---

# 42. Settlement Mode

Recommended addition to the account domain:

```text id="tv1gfj"
settlement_mode
```

Values:

```text id="7a03no"
DIRECT
SPLIT
```

Default:

```text id="y2nbdo"
DIRECT
```

When splits are finalized:

```text id="bx63nx"
DIRECT → SPLIT
```

Do not switch back to DIRECT after payments exist without an explicit reversal flow.

---

# 43. Payment Validation

Before accepting a payment:

1. Validate authenticated user.
2. Validate branch.
3. Validate permission.
4. Validate account exists.
5. Validate account is OPEN.
6. Validate split if supplied.
7. Validate payment method exists and is active.
8. Validate payment amount.
9. Validate remaining balance.
10. Validate cash-session requirements for CASH.
11. Validate idempotency operation ID when applicable.

---

# 44. Overpayment

The initial system should not permit arbitrary overpayment.

Rule:

```text id="l3ydjr"
payment_amount <= remaining_balance
```

for CARD and QR.

For CASH, accepting an amount tendered greater than remaining balance may be useful for change calculation, but the stored payment should represent the actual amount applied to the account, not the gross cash handed over.

Example:

```text id="d9y39v"
Balance:
48,000

Customer gives:
50,000

Applied payment:
48,000

Change:
2,000
```

The cash module may use tender/change metadata if implemented.

---

# 45. Cash Tender

Recommended payment command for cash:

```json id="meb9j9"
{
  "payment_method": "CASH",
  "amount_applied": 48000,
  "cash_received": 50000
}
```

Then:

```text id="qhkyen"
change =
cash_received - amount_applied
```

Persisting `cash_received` is optional but useful for receipt and cashier UX.

---

# 46. Remaining Balance

For a direct account:

```text id="jvfk3a"
remaining_balance =
account_final_total
-
sum(valid_account_payments)
```

For a split:

```text id="4x88kp"
remaining_balance =
split_final_total
-
sum(valid_split_payments)
```

Do not rely on frontend balance calculations.

---

# 47. Payment Completion

If payment causes:

```text id="kfrwfp"
remaining_balance = 0
```

then:

For direct settlement:

```text id="id5eoy"
Account → PAID
Table → AVAILABLE
```

For split settlement:

```text id="szl46v"
Split → PAID
```

and if all active splits are PAID:

```text id="w6wyj1"
Account → PAID
Table → AVAILABLE
```

---

# 48. Partial Payments

Partial payments are allowed.

Example:

```text id="5xb5yf"
Account total:
100,000

First payment:
40,000
```

Result:

```text id="n8vmpt"
Account remains OPEN
Remaining:
60,000
```

The system must preserve the payment.

---

# 49. Payments and Account Modification

Once an account has received any payment, modifying its commercial contents becomes financially sensitive.

Preferred rule:

After first payment:

- Do not allow ordinary item addition/removal.
- Do not allow ordinary discount changes.
- Do not allow service changes that reduce/increase payable total.
- Require explicit reversal/correction if billing must change.

This avoids inconsistent states where already-received money exceeds or no longer matches the bill.

---

# 50. Payment Lock State

Recommended derived account property:

```text id="t2phn4"
has_payments =
exists(valid payments)
```

When true, restrict billing mutations.

For split settlement, a split with payments becomes similarly locked.

---

# 51. Payment Transaction

Registering a payment is a domain operation.

Conceptual direct payment flow:

```text id="fktusj"
Authenticate user
↓
Validate account
↓
Validate remaining balance
↓
Validate payment method
↓
BEGIN
↓
Lock account
↓
Recalculate authoritative total
↓
Validate payment again
↓
Create payment
↓
Create cash movement if CASH
↓
Calculate remaining balance
↓
If zero:
    mark account PAID
    set closed_at
    release table
↓
Create payment receipt snapshot/job if requested
↓
Create audit record
↓
COMMIT
```

---

# 52. Split Payment Transaction

```text id="n24963"
Authenticate user
↓
Validate account
↓
Validate split
↓
BEGIN
↓
Lock split/account
↓
Calculate authoritative split total
↓
Validate payment
↓
Create payment
↓
Create cash movement if CASH
↓
If split balance zero:
    mark split PAID
↓
If all splits PAID:
    mark account PAID
    release table
↓
Create receipt snapshot/job
↓
Audit
↓
COMMIT
```

---

# 53. Cash Integration

When payment method type is:

```text id="h4n2o5"
CASH
```

an open cash session is required.

Successful cash payment creates a cash movement:

```text id="p6qdkz"
SALE
```

with positive cash effect.

CARD and QR payments do not increase physical drawer cash.

They remain recorded for reporting and cash-session reconciliation.

---

# 54. Payment Method Snapshot

Historical payment records should preserve enough context to remain understandable if the payment-method record changes later.

Recommended snapshot metadata:

```text id="b60flj"
method_name_snapshot
method_type_snapshot
```

At minimum, reporting must remain able to distinguish historical CASH, QR and CARD behavior.

---

# 55. Payment References

QR or CARD payments may have an optional reference.

Examples:

```text id="sl57px"
Transaction ID
Voucher number
Approval code
Transfer reference
```

Do not require reference for CASH.

---

# 56. Discount Rules

Reusable discount definitions may exist through:

```text id="y3x8b5"
discount_rules
```

but a historical discount application must preserve:

- Name snapshot
- Discount type
- Discount value
- Applied amount

Never recalculate historical discount amounts from a mutable discount rule.

---

# 57. Manual Discounts

Authorized users may apply ad-hoc discounts even without a predefined reusable discount rule if this is supported by the UI.

Such discounts still need:

- Type
- Value
- Applied amount
- Responsible user
- Audit trail

The exact UI can distinguish:

```text id="20wjsu"
Saved promotion
Manual discount
```

without changing the underlying historical principles.

---

# 58. Discount Permissions

Discount application must require a dedicated permission.

Recommended:

```text id="npk1wa"
sales.apply_discount
```

Changing or removing an existing discount should also be permission-controlled and audited.

---

# 59. Service Permissions

Recommended:

```text id="c82c0d"
sales.modify_service
```

A normal waiter may be allowed to toggle service if the business chooses, but permission must remain configurable.

---

# 60. Split Permissions

Recommended:

```text id="x1z7b1"
sales.split
```

This permission grants access to:

- Create splits
- Allocate items
- Define percentages
- Configure split service

Payment permissions remain separate.

---

# 61. Payment Permissions

Recommended:

```text id="7hp4fr"
payments.view
payments.create
payments.receive_cash
payments.receive_card
payments.receive_qr
```

A simpler permission model may use:

```text id="5mfn1q"
payments.create
```

if method-level permission granularity is unnecessary.

---

# 62. Void Payment

The initial system should not allow ordinary deletion of payments.

If a payment was recorded incorrectly, use a payment-void/reversal operation.

This must:

- Preserve original payment.
- Record reason.
- Reverse cash effect if applicable.
- Recalculate account/split balance.
- Potentially transition account from PAID back to a correction state only under explicit rules.

Because paid-sale reversal is sensitive, the initial implementation may restrict payment voiding to accounts that have not yet been fully closed or require administrative correction flow.

Do not physically delete payment rows.

---

# 63. Payment Status

The current DDL lacks explicit payment status.

Recommended values:

```text id="2pa0qf"
CONFIRMED
VOID
```

This allows payment correction without deletion.

---

# 64. Payment Void Metadata

Recommended fields:

```text id="fzpt8o"
status
voided_at
voided_by_user_id
void_reason
```

The original payment amount remains preserved.

---

# 65. Payment Reversal and Cash

If a confirmed CASH payment is voided:

```text id="2dg1hm"
Original:
SALE +50,000
```

Create compensating cash movement:

```text id="bozrx9"
ADJUSTMENT / PAYMENT_REVERSAL
-50,000 cash effect
```

Do not edit the original cash movement.

Historical cash movements remain immutable business events.

---

# 66. Paid Account Corrections

A paid account should not casually transition:

```text id="9ll2hz"
PAID → OPEN
```

If payment reversal makes the account unpaid, use an explicit administrative correction workflow.

Recommended future state may include:

```text id="4yq2m7"
PAYMENT_CORRECTION
```

but this is not required for the simplest MVP.

Initial implementation may reject payment reversal after final account close unless performed by a specialized administrative operation.

---

# 67. Account Receipt Before Payment

The account receipt/check may be printed before payment.

It should show:

```text id="t6j2fa"
Subtotal
Discounts
Taxes
Service
Total with service
Total without service
```

Printing the account receipt has no financial side effect.

---

# 68. Payment Receipt

After a payment or completed split, a payment receipt may be generated.

For a fully paid split:

```text id="4ni5bj"
Split summary
Service
Total
Payments
```

For direct full account payment:

```text id="kwyy5c"
Account summary
Service
Total
Payments
```

Mixed payment methods must all appear.

---

# 69. Multiple Receipts for Split Accounts

Every paid split may have its own receipt.

Example:

```text id="h7aqmq"
Mesa 5

Split A:
Receipt A

Split B:
Receipt B

Split C:
Receipt C
```

This fulfills the requirement that each person can take an independent internal receipt.

---

# 70. Account-Level Final Totals After Split Settlement

The parent account should still expose overall historical totals.

Conceptually:

```text id="c5c39b"
account total before split settlement
```

and:

```text id="rvpd9z"
sum(split subtotals)
=
account subtotal after discounts
```

Taxes should reconcile.

Service may differ because each split can use a different percentage.

Therefore:

```text id="yxnx6m"
sum(split final totals)
```

may differ from the account's originally displayed total with its default service.

For final settled reporting, split service amounts become the actual charged service.

---

# 71. Actual Charged Service

For direct settlement:

```text id="yrl6tv"
actual_service =
account.service_total
```

For split settlement:

```text id="rnxejc"
actual_service =
sum(split.service_total)
```

Reports should use actual charged service, not the parent's original default service amount when split settlement occurred.

---

# 72. Parent Account Service During Split

When settlement mode is SPLIT, the parent account may preserve:

```text id="h46n5m"
default_service_percentage
```

for reference or initial split creation.

But final charged service must be derived from the splits.

Do not double-count parent and split service in reports.

---

# 73. Split Creation Defaults

When creating splits, each split may initially inherit:

```text id="jbk62s"
account.service_percentage
```

Example:

Account default:

```text id="l5ul49"
10%
```

New splits initially:

```text id="f9pb7l"
10%
10%
10%
```

The user can then modify each independently.

---

# 74. Split Deletion

An OPEN split with no payments may be deleted/rebuilt as configuration state if no historical business event depends on it.

Once a split has payments:

Do not delete it.

Use explicit cancellation/correction behavior.

---

# 75. Payment Idempotency

Payment creation must be idempotent.

Every payment command should carry a globally unique operation ID.

If the same payment operation is submitted twice:

```text id="v2ufq0"
Do not create two payments
Do not increase cash twice
Do not mark account twice
```

Return the original result.

This is critical for:

- Mobile connectivity issues
- Offline synchronization
- User retry after timeout

---

# 76. Payment Concurrency

Two devices may attempt to pay the same remaining balance simultaneously.

Example:

```text id="utft1p"
Remaining:
50,000

Device A:
Pays 50,000

Device B:
Pays 50,000
```

The backend must prevent 100,000 from being applied.

Use row locking or equivalent transactional concurrency control.

Conceptually:

```text id="6sz79o"
Lock account/split
↓
Recalculate remaining balance
↓
Validate payment
↓
Apply
```

---

# 77. Split Concurrency

Split configuration must also use concurrency control.

Do not let two devices simultaneously replace split allocation.

Prefer versioned account mutations.

Use:

```text id="tiazph"
accounts.version
```

and/or row locking.

---

# 78. Offline Payment Risk

Payments are financially sensitive.

Offline payment entry may be supported, but must be treated more strictly than offline order taking.

Potential offline data:

- Operation ID
- Account ID
- Split ID
- Payment method
- Amount
- Cash received if applicable
- User
- Branch
- Device
- Last known account version
- Local timestamp

The server remains authoritative.

---

# 79. Offline Card/QR Caveat

The application records CARD and QR payments, but does not itself process external payment authorization unless integrated later.

If a user records such a payment offline, it is an operational declaration that external payment occurred.

The system must not claim external payment-provider verification unless an actual integration exists.

---

# 80. Offline Cash Payment

Offline cash payment is possible operationally if the device has a valid local cash-session context.

However, synchronization must validate:

- Cash session
- Account state
- Remaining balance
- Payment operation ID
- User permission

Conflicts must not silently duplicate cash.

---

# 81. Offline Account Already Paid Conflict

Example:

```text id="hjhd3c"
Device A offline:
records payment

Meanwhile Device B:
fully pays account online
```

When Device A synchronizes:

Do not apply another payment automatically.

Mark the operation as conflict/rejected and preserve it for resolution.

---

# 82. Offline Split Conflict

If split configuration changed on the server while an offline device has stale splits:

Do not silently apply payments to outdated split IDs or percentages.

Validate split existence/version during synchronization.

---

# 83. Audit Requirements

Audit at minimum:

## Discounts

- Account discount applied
- Account discount removed
- Item discount applied
- Item discount removed

## Service

- Service enabled/disabled
- Service percentage changed
- Split service percentage changed

## Splits

- Split created
- Split configuration changed
- Split voided
- Settlement mode changed

## Payments

- Payment received
- Payment voided/corrected
- Account completed
- Split completed

Audit should record relevant before/after financial values.

---

# 84. Payment Audit Example

```json id="j6diaq"
{
  "action": "PAYMENT_RECEIVED",
  "entity_type": "payment",
  "entity_id": "uuid",
  "after_data": {
    "account_id": "uuid",
    "split_id": null,
    "method_type": "CARD",
    "amount": 50000
  }
}
```

---

# 85. Service Audit Example

```json id="jzvt8x"
{
  "action": "SERVICE_CHANGED",
  "entity_type": "account",
  "entity_id": "uuid",
  "before_data": {
    "service_percentage": 10
  },
  "after_data": {
    "service_percentage": 0
  }
}
```

---

# 86. Backend Invariants

The backend must enforce all of the following:

1. Client monetary totals are never authoritative.
2. Monetary calculations use decimal arithmetic.
3. Discounts cannot reduce a payable component below zero.
4. Item discounts apply before account discounts.
5. Service applies after discounts.
6. Service is separate from tax.
7. Service may be independently configured per split.
8. Split percentages must total exactly 100%.
9. Item split allocations must exactly cover active item quantities when finalized.
10. Split calculations use historical account-item prices.
11. Finalized split settlement and direct settlement must not be mixed arbitrarily.
12. Payments must be positive.
13. Payments cannot exceed remaining balance.
14. CASH payments require an open valid cash session.
15. CARD and QR do not directly modify physical cash.
16. Mixed payments are allowed.
17. Partial payments are allowed.
18. Account becomes PAID only when authoritative remaining balance is zero.
19. Split becomes PAID only when its authoritative remaining balance is zero.
20. In SPLIT settlement mode, account becomes PAID only when all active splits are PAID.
21. Table is released only when account becomes PAID or VOID.
22. Payment operations must be idempotent.
23. Concurrent payment attempts must be serialized appropriately.
24. Confirmed payments must not be physically deleted.
25. Historical discount/service/payment data must remain valid after configuration changes.
26. Billing changes after payment begins must be restricted.
27. Actual charged service in split settlement is the sum of split service amounts.
28. Parent account service must not be double-counted when splits are used.

---

# 87. Main Use Cases

This module must support at minimum:

```text id="b4wq62"
View account billing summary

Apply item discount
Remove item discount
Apply account discount
Remove account discount

Enable service
Disable service
Change service percentage

Print current account total with and without service

Create item-based split
Allocate item quantities
Validate complete item allocation

Create percentage-based split
Configure percentages
Validate 100% total

Configure service independently per split

Receive partial payment
Receive full payment
Receive mixed payment
Receive split payment

Calculate remaining balance

Complete split
Complete account
Release table automatically

Generate payment receipt snapshot
```

---

# 88. Integration With Order Taking

Order-taking provides:

```text id="yz7kjf"
Active account items
Historical sale prices
Taxes
Item quantities
```

This module calculates payable values from those records.

Once payments begin, order-taking mutations become restricted.

---

# 89. Integration With Cash

For CASH payment:

```text id="sz6146"
Payment confirmed
↓
Cash movement SALE
↓
Expected drawer cash increases
```

For:

```text id="yxf1ck"
CARD
QR
```

physical cash does not change.

The Cash module owns session reconciliation.

---

# 90. Integration With Printing

This module provides authoritative snapshots for:

```text id="0j6c22"
Account receipt
Payment receipt
Split payment receipt
```

The Printing module owns rendering and physical delivery.

---

# 91. Integration With Reporting

This module provides data for:

- Gross sales
- Discounts
- Net sales
- Taxes
- Service collected
- Sales by payment method
- Mixed payments
- Split usage
- Account totals
- Average ticket
- Payment timing

Reports must use finalized historical values.

---

# 92. Non-Goals

This module intentionally does not implement:

- External card processing
- QR payment-provider integration
- Refund settlement with banks
- Electronic invoicing
- DIAN tax-document generation
- Accounts receivable
- Customer credit
- Complex loyalty points
- Gift cards
- Automatic tipping rules beyond percentage service
- Currency conversion

These may be introduced later only if explicitly required.

---

# 93. Required Schema Adjustments

The current DDL requires several additions to fully support this specification.

Implement them through migrations.

## 93.1 Add Account Settlement Mode

Recommended enum:

```text id="yn4u9b"
DIRECT
SPLIT
```

Add to `accounts`:

```text id="kajsjv"
settlement_mode
```

Default:

```text id="zw7gvl"
DIRECT
```

---

# 94. Add Payment Status

Recommended enum:

```text id="ddw4fs"
CONFIRMED
VOID
```

Add to `payments`:

```text id="268ae8"
status
```

Default:

```text id="8v49mx"
CONFIRMED
```

---

# 95. Add Payment Void Metadata

Recommended additions:

```text id="e5l2sz"
voided_at
voided_by_user_id
void_reason
```

---

# 96. Add Payment Method Snapshots

Recommended additions to `payments`:

```text id="saz1li"
payment_method_name_snapshot
payment_method_type_snapshot
```

This improves historical reporting even if payment-method configuration changes later.

---

# 97. Add Cash Tender Metadata

Optional but recommended for cashier UX:

```text id="0jbpza"
cash_received
change_amount
```

Only relevant when method type is CASH.

---

# 98. Account Split Status

The current DDL reuses `account_status` for splits.

This works technically because values are:

```text id="723ph4"
OPEN
PAID
VOID
```

No migration is strictly required.

A dedicated split status enum may be introduced later for clearer domain semantics.

---

# 99. Split Finalization

Recommended addition:

```text id="3z1ttm"
finalized_at
```

or:

```text id="mtgdwu"
is_finalized
```

to distinguish editable split configuration from a split arrangement ready for payment.

Do not allow payments against incomplete percentage/item allocation.

---

# 100. Payment Operation ID

Recommended addition for direct idempotency:

```text id="nvzbd9"
operation_id UUID UNIQUE
```

on `payments`, or guarantee the equivalent through centralized `sync_operations`.

For financial operations, having a direct unique operation reference is strongly recommended.

---

# 101. Critical Implementation Principle

Do not implement billing as frontend arithmetic followed by saving totals.

Correct flow:

```text id="jfoxye"
Account Items
↓
Backend Pricing Rules
↓
Discounts
↓
Taxes
↓
Service
↓
Authoritative Balance
↓
Payment
```

Splitting must remain a settlement structure under the original account:

```text id="54sane"
Account
↓
Split Allocation
↓
Independent Service
↓
Independent Payments
↓
All Splits Paid
↓
Account Paid
```

Payment flow:

```text id="gpxg6v"
Payment Intent
↓
Lock Account/Split
↓
Recalculate Balance
↓
Validate Amount
↓
Persist Payment
↓
Cash Effect if Applicable
↓
Update Completion State
↓
Receipt Snapshot
↓
Audit
```

All implementation decisions must preserve:

- Financial consistency
- Deterministic rounding
- Split reconciliation
- Payment idempotency
- Cash traceability
- Historical integrity
- Branch isolation
- Auditability
- Concurrency safety