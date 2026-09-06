# Cash Register and Day Close Module

## Purpose

This document defines the business rules, domain model, transactional behavior and expected implementation for:

- Cash registers
- Cash sessions
- Opening cash
- Cash movements
- Cash sales
- Cash purchases
- Cash expenses
- Cash deposits
- Cash withdrawals
- Cash adjustments
- Expected cash
- Counted cash
- Cash differences
- Day/cash-session close
- Payment-method reconciliation
- Closing receipts
- Audit requirements
- Offline considerations

This document must be treated as authoritative context when implementing or modifying cash register or day-close functionality.

The Payments module remains authoritative for payment creation and settlement.

The Purchases and Expenses module remains authoritative for purchase/expense creation.

The Printing module remains authoritative for physical close-report printing.

Do not reinterpret the concepts described here without an explicit requirement change.

---

# 1. Core Cash Principle

Cash management tracks physical money held by the business.

The primary relationship is:

```text
Cash Register
↓
Cash Session
↓
Cash Movements
```

A cash register is a logical or physical drawer.

A cash session represents one operational opening/closing period for that drawer.

Cash movements explain why physical cash changed.

---

# 2. Cash Register

A cash register contains at least:

- ID
- Branch
- Name
- Active/inactive state
- Created timestamp
- Updated timestamp

Examples:

```text
Caja Principal
Caja Barra
Caja 2
```

A cash register belongs to exactly one branch.

---

# 3. Inactive Cash Registers

Inactive cash registers:

- Cannot open new cash sessions.
- Remain visible in historical cash-session records.
- Must not be physically deleted if historical references exist.

---

# 4. Cash Session

A cash session represents the period between opening and closing a cash register.

A cash session contains at least:

- ID
- Cash register
- User who opened it
- Opening timestamp
- Opening amount
- User who closed it, nullable
- Closing timestamp, nullable
- Expected cash
- Counted cash
- Difference
- Status

Supported statuses:

```text
OPEN
CLOSED
```

---

# 5. One Open Session Per Register

A cash register may have at most one OPEN cash session at a time.

Invalid:

```text
Caja Principal

Session A:
OPEN

Session B:
OPEN
```

Valid:

```text
Session A:
CLOSED

Session B:
OPEN
```

This should be enforced both in backend logic and, preferably, through a PostgreSQL partial unique index.

Recommended:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_cash_session_per_register
ON cash_sessions(cash_register_id)
WHERE status = 'OPEN';
```

---

# 6. Opening a Cash Session

Opening a cash session is a domain operation.

Flow:

```text
Authenticate user
↓
Validate branch
↓
Require cash.open
↓
Validate cash register
↓
Lock cash register/session context
↓
Validate no OPEN session exists
↓
Validate opening amount
↓
BEGIN
↓
Create cash session
↓
Create audit record
↓
COMMIT
```

---

# 7. Opening Amount

`opening_amount` represents physical cash already present in the drawer when the session begins.

Example:

```text
Opening amount:
$200,000
```

This amount is not a sale.

It is the initial physical balance used to calculate expected cash.

---

# 8. Opening Amount Validation

Opening amount must be:

```text
opening_amount >= 0
```

Negative opening cash is invalid.

---

# 9. Cash Movement

A cash movement represents a reason why physical drawer cash changes.

Required movement types include:

```text
SALE
PURCHASE
EXPENSE
WITHDRAWAL
DEPOSIT
ADJUSTMENT
```

Cash movement amount is always stored as a positive amount.

Direction is derived from movement type.

---

# 10. Cash Movement Direction

Positive cash effect:

```text
SALE
DEPOSIT
```

Negative cash effect:

```text
PURCHASE
EXPENSE
WITHDRAWAL
```

`ADJUSTMENT` requires explicit direction metadata or a dedicated signed effect field.

Do not infer direction from a negative `amount`.

---

# 11. Adjustment Direction

For clarity, cash adjustments should explicitly indicate direction.

Recommended values:

```text
INCREASE
DECREASE
```

Example:

```text
ADJUSTMENT
Amount: 5,000
Direction: DECREASE
Reason: Cash counting correction
```

Do not overload the amount sign.

---

# 12. Cash Sale

A confirmed CASH payment creates a cash movement:

```text
movement_type = SALE
```

Example:

```text
Customer payment:
$50,000 CASH
```

Cash effect:

```text
+50,000
```

The movement should reference the originating payment.

---

# 13. Card and QR Payments

CARD and QR payments do not change physical drawer cash.

Therefore:

```text
CARD
→ no cash movement
```

```text
QR
→ no cash movement
```

They still belong to sales/payment reporting and close summaries.

---

# 14. Cash Purchase

A purchase paid using CASH creates:

```text
movement_type = PURCHASE
```

Cash effect:

```text
-amount
```

The movement must reference the originating purchase.

---

# 15. Cash Expense

An expense paid using CASH creates:

```text
movement_type = EXPENSE
```

Cash effect:

```text
-amount
```

The movement must reference the originating expense.

---

# 16. Withdrawal

A withdrawal represents money intentionally removed from the drawer without being an inventory purchase or operational expense record.

Examples:

```text
Cash removed for safekeeping
Owner withdrawal
Cash transfer to vault
```

Movement:

```text
WITHDRAWAL
```

Cash effect:

```text
-amount
```

A withdrawal requires:

- Amount
- Reason
- User
- Timestamp
- Cash session

---

# 17. Deposit

A deposit represents money intentionally added to the drawer outside sales.

Examples:

```text
Additional change money
Owner adds cash to drawer
```

Movement:

```text
DEPOSIT
```

Cash effect:

```text
+amount
```

A deposit requires:

- Amount
- Reason
- User
- Timestamp
- Cash session

---

# 18. Manual Cash Adjustment

`ADJUSTMENT` is reserved for correcting cash-register state when there is a known discrepancy that must be represented explicitly.

It must not be used casually instead of:

- Expense
- Purchase
- Withdrawal
- Deposit

Every adjustment requires:

- Amount
- Direction
- Reason
- User
- Timestamp

Adjustments must be audited.

---

# 19. Cash Movements Are Historical Events

Confirmed cash movements must not be physically deleted.

If a movement was incorrect, create a compensating movement.

Example:

Original:

```text
WITHDRAWAL
10,000
```

Incorrect.

Correction:

```text
DEPOSIT
10,000
Reason: Reverse incorrect withdrawal
```

Both remain visible.

---

# 20. Expected Cash Formula

Expected cash is calculated from the session.

Core formula:

```text
expected_cash =
opening_amount
+ cash_sales
+ deposits
- cash_purchases
- cash_expenses
- withdrawals
+ adjustment_net_effect
```

Only physical-cash movements contribute.

CARD and QR do not.

---

# 21. Expected Cash From Movements

Preferred implementation:

```text
expected_cash =
opening_amount
+
sum(cash movement effects)
```

where each movement type maps to a signed effect.

Do not calculate expected cash from arbitrary sales totals without reconciling movement semantics.

---

# 22. Example Expected Cash

Opening:

```text
200,000
```

Cash sales:

```text
+500,000
```

Deposit:

```text
+50,000
```

Cash expenses:

```text
-100,000
```

Withdrawal:

```text
-200,000
```

Expected:

```text
450,000
```

---

# 23. Counted Cash

At close, the cashier enters the actual physical cash counted.

Example:

```text
Counted cash:
445,000
```

This value is user-entered.

It must not be overwritten by expected-cash calculations.

---

# 24. Cash Difference

Difference:

```text
difference =
counted_cash - expected_cash
```

Example:

```text
Expected:
450,000

Counted:
445,000

Difference:
-5,000
```

Negative means cash shortage.

Positive means cash overage.

---

# 25. Difference Is Not Automatically an Adjustment

Closing difference is an observed reconciliation result.

Do not automatically create an `ADJUSTMENT` just to force:

```text
difference = 0
```

The close should preserve the actual discrepancy.

If management later wants to post a separate correction, that is an explicit operation.

---

# 26. Cash Session Closing

Closing a cash session is a domain operation.

Flow:

```text
Authenticate user
↓
Validate branch
↓
Require cash.close
↓
Load OPEN session
↓
Lock session
↓
Recalculate authoritative expected cash
↓
Enter counted cash
↓
Calculate difference
↓
Build payment-method summary
↓
BEGIN
↓
Store expected cash
↓
Store counted cash
↓
Store difference
↓
Set status CLOSED
↓
Set closed_at
↓
Set closed_by_user_id
↓
Create immutable close snapshot
↓
Create print job if requested/configured
↓
Create audit record
↓
COMMIT
```

---

# 27. Closed Session Immutability

After a session is CLOSED:

- Do not add ordinary new cash movements to it.
- Do not edit opening amount.
- Do not edit expected cash.
- Do not edit counted cash silently.
- Do not reopen through ordinary workflow.
- Preserve historical close totals.

Corrections require an explicit administrative correction process.

---

# 28. Late Offline Operations

Offline operations may arrive after a cash session has already been closed.

Do not silently attach them to a closed session.

This must be treated as a synchronization conflict.

Examples:

```text
Offline cash sale from 20:00
Session closed online at 23:00
Operation syncs at 23:30
```

The server must preserve the pending/conflicting operation for resolution.

---

# 29. Close Summary by Payment Method

The close should include all sales payments recorded during the session context, grouped by method.

Example:

```text
Cash:
800,000

Card:
700,000

QR:
500,000
```

Only CASH affects drawer expected cash.

CARD and QR are still operationally important for reconciliation.

---

# 30. Close Summary Should Distinguish Cash Flow Types

Recommended summary:

```text
Opening cash

Cash sales
Cash deposits

Cash purchases
Cash expenses
Cash withdrawals
Cash adjustments

Expected cash
Counted cash
Difference

Card sales
QR sales

Total sales
```

Do not mix non-cash sales into expected drawer cash.

---

# 31. Day Close vs Cash Session Close

The MVP should treat "day close" operationally as the close of a cash session.

If there are multiple sessions or registers in one calendar day, each session has its own close.

A future business-wide daily close may aggregate:

```text
all closed sessions for branch/date
```

but is not required for core cash reconciliation.

---

# 32. Multiple Registers

A branch may have multiple cash registers.

Each register has independent:

- Opening amount
- Session
- Movements
- Expected cash
- Counted cash
- Difference

Do not aggregate physical cash drawers before closing them individually.

---

# 33. Cash Session Selection

For cash-affecting operations, the backend must know which open cash session receives the movement.

Preferred behavior:

- User/session context has an active cash register/cash session.
- Operation explicitly references that session when needed.
- Backend validates it belongs to the same branch and is OPEN.

Do not guess from "the most recent open session" if multiple registers are possible.

---

# 34. One Active Cash Context Per User

Optional but recommended initial UX:

A cashier selects or opens a cash session and works within that context.

The frontend stores:

```text
active_cash_session_id
```

as session context.

The backend still validates it.

---

# 35. Cash Movement Source Traceability

Every movement should reference its source when applicable.

Examples:

```text
SALE
→ payment_id
```

```text
PURCHASE
→ purchase_id
```

```text
EXPENSE
→ expense_id
```

For manual movements:

```text
WITHDRAWAL
DEPOSIT
ADJUSTMENT
```

source may be null, but reason is required.

---

# 36. Cash Movement User Attribution

Every movement must preserve the responsible user.

This allows reports such as:

```text
Who created this withdrawal?
Who entered this adjustment?
Who registered this deposit?
```

---

# 37. Cash Movement Timestamp

Use server-authoritative timestamp for synchronized operations where possible.

For offline operations, preserve both:

- Local occurred timestamp
- Server processed timestamp

Do not silently replace business occurrence time with synchronization time.

---

# 38. Cash Withdrawal Permissions

Recommended:

```text
cash.withdraw
```

Withdrawals should generally be more restricted than normal sales.

---

# 39. Cash Deposit Permissions

Recommended:

```text
cash.deposit
```

---

# 40. Cash Adjustment Permissions

Recommended:

```text
cash.adjust
```

This should be considered a sensitive permission.

---

# 41. Cash Close Permissions

Recommended:

```text
cash.close
```

Optionally separate:

```text
cash.view_difference
```

if the business wants to hide expected-vs-counted difference from some users.

---

# 42. Blind Cash Close

Optional future behavior could hide expected cash from the cashier until after counted cash is entered.

This is not required for initial implementation.

Initial MVP may show expected cash before count.

Do not implement blind close unless explicitly requested.

---

# 43. Cash Session Reporting

Cash-session detail should expose:

- Register
- Opened by
- Opened at
- Opening amount
- Movements
- Sales by payment method
- Expected cash
- Counted cash
- Difference
- Closed by
- Closed at
- Status

---

# 44. Open Cash Session Dashboard

Dashboard may show:

```text
Caja Principal
OPEN

Opened at:
09:00

Opening:
200,000

Expected cash:
650,000
```

Expected amount may update in real time.

---

# 45. Cash Movement UI

Authorized users should see movement history such as:

```text
17:20 SALE
+50,000
Payment #123

16:40 EXPENSE
-20,000
Cleaning supplies

15:00 WITHDRAWAL
-100,000
Safe deposit
```

Direction should be visually clear.

---

# 46. Closing UI

Recommended flow:

```text
CLOSE CASH REGISTER

Opening amount:
$200,000

Cash sales:
$800,000

Deposits:
$0

Cash purchases:
-$100,000

Cash expenses:
-$50,000

Withdrawals:
-$200,000

Expected cash:
$650,000

Counted cash:
[________]

Difference:
calculated in real time
```

---

# 47. Count Confirmation

Before final close, show the calculated difference clearly.

Example:

```text
Expected:
650,000

Counted:
645,000

Difference:
-5,000
```

The user explicitly confirms the close.

---

# 48. Close Notes

Recommended optional field:

```text
closing_notes
```

Useful for:

```text
Short by 5,000
Coin difference
Cash removed before count
```

---

# 49. Close Snapshot

The final close must preserve an immutable snapshot.

Recommended JSON structure:

```json
{
  "cash_session_id": "uuid",
  "cash_register": "Caja Principal",
  "opened_at": "...",
  "closed_at": "...",
  "opening_amount": 200000,
  "sales": {
    "cash": 800000,
    "card": 700000,
    "qr": 500000
  },
  "cash_movements": {
    "deposits": 0,
    "purchases": 100000,
    "expenses": 50000,
    "withdrawals": 200000,
    "adjustments_net": 0
  },
  "expected_cash": 650000,
  "counted_cash": 645000,
  "difference": -5000
}
```

This snapshot is used for historical display and printing.

---

# 50. Close Receipt

The Printing module uses the immutable close snapshot.

Reprinting the close must not recalculate historical totals.

---

# 51. Closing With Pending Print Jobs

A cash session may still close even if its printer is unavailable.

Close transaction remains valid.

Close print job may become:

```text
FAILED
```

and be reprinted later.

---

# 52. Sales Attribution to Cash Session

CASH payments must directly reference or be traceable to the cash session that received them.

Do not infer historical cash-session membership only from timestamp.

Explicit reference is safer.

---

# 53. Non-Cash Payment Session Context

CARD and QR payments may still be associated with a cash session for reconciliation even though they do not affect physical cash.

This is useful so the close can show:

```text
Card sales during this cashier session
QR sales during this cashier session
```

Recommended behavior:

All received payments may reference the active cash session.

Only CASH creates a physical cash movement.

---

# 54. Payment Cash Session Reference

Recommended schema addition:

```text
payments.cash_session_id
```

This allows all payment methods to be grouped by session.

For CASH, it is required.

For CARD/QR, strongly recommended when payment occurred during a cashier session.

---

# 55. Purchase Cash Session Reference

Cash purchases require:

```text
purchases.cash_session_id
```

as already defined in the purchases module.

Non-cash purchases may leave it null.

---

# 56. Expense Cash Session Reference

The current DDL already supports:

```text
expenses.cash_session_id
```

For CASH expenses, it is required.

For CARD/QR expenses, it may be null or associated for operational reporting according to implementation.

---

# 57. Cash Movement Idempotency

Cash-affecting domain operations must not create duplicate movements on retry.

Example:

```text
Payment operation retried
```

must not create:

```text
SALE +50,000
SALE +50,000
```

Idempotency should be driven by source operation/payment IDs.

---

# 58. Unique Source Movement

Recommended invariant:

For source-backed automatic movement types, there should be only one active/original movement per source operation.

Examples:

```text
Payment → one SALE movement
Purchase → one PURCHASE movement
Expense → one EXPENSE movement
```

Compensating movements are separate explicit correction events.

---

# 59. Cash Concurrency

Multiple cash movements may happen concurrently.

Cash movements themselves are additive, but session closing must lock the session and prevent racing operations.

Closing flow must ensure:

```text
No new ordinary cash movement is committed after the final expected-cash calculation for a CLOSED session.
```

---

# 60. Closing Lock Strategy

Recommended:

```text
Lock cash_sessions row
↓
Mark closing intent / validate OPEN
↓
Calculate movements
↓
Finalize close
```

Cash-affecting operations must validate session status while inside their own transaction.

If session has become CLOSED:

```text
Reject operation
```

---

# 61. Cash Session Version

Optional but recommended:

```text
version BIGINT
```

incremented on session-affecting operations.

Useful for:

- Concurrency
- Offline conflict detection
- UI freshness

---

# 62. Offline Cash Sales

Offline cash payment operations may be queued.

They must preserve:

- Operation ID
- Payment ID
- Account/split
- Cash session ID
- User
- Device
- Amount
- Local timestamp
- Last known session/account version

During synchronization:

```text
Validate session still OPEN
Validate account/payment state
Validate idempotency
Apply payment
Create cash movement
```

---

# 63. Offline Cash Purchase/Expense

Same principles apply.

If referenced cash session is already CLOSED:

```text
Do not silently attach to another session
```

Mark conflict.

---

# 64. Offline Withdrawals and Deposits

These are especially sensitive.

Initial recommendation:

Do not allow creating manual withdrawals/deposits offline unless explicitly needed.

If supported later, require:

- Strong local permission snapshot
- Operation ID
- Cash session ID
- Local timestamp
- Reason
- Conflict handling

---

# 65. Offline Close

Closing a cash session offline is high risk.

Initial recommendation:

Require server connectivity for final authoritative cash-session close.

The frontend may prepare/count cash offline, but final CLOSE operation should synchronize against the authoritative server state.

This avoids closing against missing remote cash movements.

---

# 66. Closing Preparation Offline

Allowed local workflow:

```text
Count physical cash
Enter counted amount locally
```

But final server operation:

```text
CLOSE_CASH_SESSION
```

must recalculate expected cash from authoritative synchronized data before commit.

---

# 67. Cash Reconciliation Alerts

Dashboard/reporting should flag:

```text
difference != 0
```

especially above configurable thresholds.

Initial system does not require threshold configuration.

Any non-zero difference may be displayed.

---

# 68. Historical Close Integrity

Later:

- Payment voids
- Financial corrections
- Offline conflict resolutions

must not silently rewrite the original close snapshot.

If corrections occur after close, they should appear as post-close correction events in later operational reporting.

The historical close remains what was known/finalized at the time.

---

# 69. No Automatic Historical Close Recalculation

Do not update:

```text
cash_sessions.expected_cash
cash_sessions.counted_cash
cash_sessions.difference
```

after close because later corrections were posted.

Closed values are historical snapshots.

---

# 70. Operational Corrections After Close

If a mistake is discovered after close:

Example:

```text
Expense was omitted
```

Record the correction explicitly in a later valid session or dedicated administrative correction process.

Do not mutate the historical close.

---

# 71. Audit Requirements

Audit at minimum:

## Cash Sessions

- Session opened
- Session closed

## Manual Movements

- Deposit
- Withdrawal
- Adjustment

## Sensitive Corrections

- Attempted/approved post-close correction
- Cash movement compensation

Automatic SALE/PURCHASE/EXPENSE movement creation is already traceable to its source operation but may also be summarized in audit where appropriate.

---

# 72. Close Audit Example

```json
{
  "action": "CASH_SESSION_CLOSED",
  "entity_type": "cash_session",
  "entity_id": "uuid",
  "after_data": {
    "opening_amount": 200000,
    "expected_cash": 650000,
    "counted_cash": 645000,
    "difference": -5000
  }
}
```

---

# 73. Withdrawal Audit Example

```json
{
  "action": "CASH_WITHDRAWAL",
  "entity_type": "cash_movement",
  "entity_id": "uuid",
  "after_data": {
    "amount": 100000,
    "reason": "Safe deposit"
  }
}
```

---

# 74. Suggested Permissions

Recommended permissions:

```text
cash.view
cash.open
cash.close
cash.deposit
cash.withdraw
cash.adjust
cash.view_movements
cash.view_difference
cash.print_close
cash.reprint_close
```

Exact naming must remain consistent with the centralized authorization module.

---

# 75. Backend Invariants

The backend must enforce all of the following:

1. A cash register belongs to exactly one branch.
2. A cash register has at most one OPEN session.
3. Opening amount must be non-negative.
4. CASH operations require an OPEN valid cash session.
5. CARD and QR do not modify physical drawer cash.
6. Cash movement amounts are positive.
7. Movement direction is determined explicitly by type/direction metadata.
8. Every automatic cash movement must reference its originating business operation where possible.
9. Confirmed cash movements must not be physically deleted.
10. Incorrect movements are corrected through compensating movements.
11. Expected cash is calculated from opening amount plus net physical cash movements.
12. Counted cash is user-entered.
13. Difference equals counted cash minus expected cash.
14. Difference must not be automatically zeroed through adjustment.
15. Closing must be transactional.
16. A CLOSED session must not receive ordinary new movements.
17. Close snapshot is immutable historical data.
18. Close receipt printing failure does not invalidate the close.
19. Session close must be concurrency-safe.
20. Offline operations must not silently attach to closed sessions.
21. Idempotent retries must not duplicate cash movements.
22. Historical close values must not be recalculated after later corrections.

---

# 76. Main Use Cases

This module must support at minimum:

```text
Create cash register
View cash registers
Activate/deactivate cash register

Open cash session
View open session
View current expected cash

Record deposit
Record withdrawal
Record adjustment

Receive automatic cash-sale movements
Receive automatic cash-purchase movements
Receive automatic cash-expense movements

View cash movement history

Prepare close
Enter counted cash
Calculate difference
Close cash session

View historical closes
Print close
Reprint close
```

---

# 77. Integration With Payments

CASH payment:

```text
Payment confirmed
↓
Cash movement SALE
↓
Expected cash increases
```

CARD/QR payment:

```text
Payment confirmed
↓
No physical cash movement
↓
Still included in session payment-method summary
```

The Payments module owns payment validity.

The Cash module owns drawer effect.

---

# 78. Integration With Purchases

CASH purchase:

```text
Purchase confirmed
↓
Cash movement PURCHASE
↓
Expected cash decreases
```

Non-cash purchase:

```text
No drawer movement
```

---

# 79. Integration With Expenses

CASH expense:

```text
Expense confirmed
↓
Cash movement EXPENSE
↓
Expected cash decreases
```

Non-cash expense:

```text
No drawer movement
```

---

# 80. Integration With Printing

When session closes:

```text
Final close snapshot
↓
DAY_CLOSE print job
```

Printing is asynchronous/retryable.

The cash transaction must not depend on printer success.

---

# 81. Integration With Reporting

This module provides data for:

- Cash sales
- Cash purchases
- Cash expenses
- Deposits
- Withdrawals
- Adjustments
- Expected cash
- Counted cash
- Differences
- Sales by payment method
- Session performance
- Historical closes

---

# 82. Non-Goals

This module intentionally does not implement:

- Bank account reconciliation
- Accounting journal entries
- Petty-cash accounting system
- Cash vault management
- Inter-register transfers
- Formal fiscal closure
- DIAN reporting
- Currency exchange
- Foreign currencies
- External card settlement reconciliation

These may be added later if explicitly required.

---

# 83. Required Schema Adjustments

The current DDL requires a few additions to fully support this specification.

Implement through migrations.

## 83.1 Enforce One Open Session Per Register

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_cash_session_per_register
ON cash_sessions(cash_register_id)
WHERE status = 'OPEN';
```

---

# 84. Add Adjustment Direction

Recommended enum:

```text
INCREASE
DECREASE
```

Add nullable field to `cash_movements`:

```text
adjustment_direction
```

Require it only for:

```text
movement_type = ADJUSTMENT
```

---

# 85. Add Purchase Reference to Cash Movements

As already specified in the purchases module:

```text
purchase_id UUID NULL
REFERENCES purchases(id)
```

---

# 86. Add Payment Cash Session Reference

Recommended:

```text
payments.cash_session_id UUID NULL
REFERENCES cash_sessions(id)
```

For CASH payments:

```text
NOT NULL by business validation
```

For CARD/QR:

```text
recommended when processed during a session
```

---

# 87. Add Closing Notes

Recommended addition to `cash_sessions`:

```text
closing_notes TEXT NULL
```

---

# 88. Add Close Snapshot

Recommended:

```text
close_snapshot JSONB NULL
```

to `cash_sessions`.

Populate only when closing.

This preserves immutable historical close content.

---

# 89. Add Session Version

Recommended:

```text
version BIGINT NOT NULL DEFAULT 1
```

for concurrency/offline support.

---

# 90. Critical Implementation Principle

Do not calculate drawer cash as:

```text
all sales
minus all expenses
```

without payment-method semantics.

Correct model:

```text
Opening Cash
↓
Physical Cash Movements
↓
Expected Cash
↓
Physical Count
↓
Difference
```

Core flows:

```text
OPEN

Cash Register
↓
Opening Amount
↓
OPEN Session
```

```text
OPERATE

Cash Payment
Cash Purchase
Cash Expense
Deposit
Withdrawal
Adjustment
↓
Immutable Cash Movements
↓
Expected Cash
```

```text
CLOSE

Lock Session
↓
Recalculate Expected Cash
↓
Enter Counted Cash
↓
Calculate Difference
↓
Immutable Close Snapshot
↓
CLOSED
↓
Print
```

All implementation decisions must preserve:

- Physical cash traceability
- Financial separation by payment method
- Historical integrity
- Transactional consistency
- Branch isolation
- Concurrency safety
- Idempotency
- Auditability