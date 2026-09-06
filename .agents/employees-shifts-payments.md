# Employees, Shifts, Wage Rates, Bonuses and Daily Payments Module

## Purpose

This document defines the business rules, domain model, calculations, transactional behavior and expected implementation for:

- Employees
- Employee branch assignment
- Employee status
- Work shifts
- Clock-in and clock-out
- Configurable hourly wage ranges
- Wage calculation across multiple time ranges
- Overnight shifts
- Bonuses
- Daily employee payment
- Historical wage snapshots
- Payment records
- Audit requirements
- Reporting
- Offline considerations

This document must be treated as authoritative context when implementing or modifying employee scheduling, shift calculation or daily employee payment functionality.

Employees are intentionally independent from authenticated users.

Do not infer or create a relationship between `employees` and `users` unless explicitly required later.

---

# 1. Core Domain Principle

The employee module tracks people working for the business and the money paid for specific completed work periods.

The main relationship is:

```text
Branch
↓
Employee
↓
Shift
↓
Calculated Base Pay
↓
Bonuses
↓
Employee Payment
```

An employee is not a system user.

A shift represents worked time.

A payment represents money actually paid.

These concepts must remain separate.

---

# 2. Employee

An employee represents a person working for a branch.

Examples:

```text
Juan Pérez
Mesero

Carlos Gómez
Cocinero

María López
Caja
```

An employee contains at least:

- ID
- Branch
- First name
- Last name
- Document number, optional
- Phone, optional
- Email, optional
- Position
- Notes
- Active/inactive state
- Created timestamp
- Updated timestamp

---

# 3. Employee vs User

Employees and users are separate entities.

Do not assume:

```text
Employee
=
Authenticated User
```

Examples:

```text
Employee:
Carlos

User account:
none
```

is valid.

Also:

```text
User:
administrator

Employee:
none
```

is valid.

Order-taking attribution belongs to authenticated users.

Payroll belongs to employees.

---

# 4. Employee Branch Scope

An employee belongs to one branch in the current model.

Example:

```text
Employee:
Carlos

Branch:
Don Juan Centro
```

Employee shifts, bonuses and payments must belong to the same branch context.

Do not associate a shift from Branch A with an employee from Branch B.

---

# 5. Inactive Employees

Inactive employees:

- Cannot receive new shifts.
- Cannot receive new normal payroll entries.
- Remain visible in historical shifts.
- Remain visible in historical payments.
- Must not be physically deleted when historical references exist.

Deactivation is preferred over deletion.

---

# 6. Position

`position` is informational.

Examples:

```text
Waiter
Cook
Cashier
Kitchen Assistant
Manager
```

Position does not automatically grant system permissions.

Do not connect employee position to user roles.

---

# 7. Employee Wage Rate

An employee may have one or more configured hourly wage ranges.

Example:

```text
06:00 → 18:00
8750 / hour

18:00 → 06:00
11900 / hour
```

A wage rate contains at least:

- ID
- Employee
- Start time
- End time
- Hourly rate
- Active/inactive state
- Created timestamp
- Updated timestamp

---

# 8. Wage Rate Scope

Wage rates are employee-specific.

Example:

```text
Carlos:
06:00–18:00 = 8750
18:00–06:00 = 11900
```

Another employee may have:

```text
María:
06:00–18:00 = 9500
18:00–06:00 = 12500
```

Do not assume all employees share the same rate.

A future shared wage-template feature may be introduced separately.

---

# 9. Wage Rate Time Ranges

A rate range may cross midnight.

Example:

```text
18:00 → 06:00
```

means:

```text
18:00 → 24:00
and
00:00 → 06:00
```

The backend must support this explicitly.

Do not interpret:

```text
end_time < start_time
```

as invalid.

It means the range crosses midnight.

---

# 10. Wage Rate Coverage

For every worked minute that should be paid, the employee must have exactly one applicable active wage rate.

The configuration should ideally cover a complete 24-hour period.

Example:

```text
06:00 → 18:00
18:00 → 06:00
```

provides full coverage.

---

# 11. Wage Rate Gaps

Invalid or incomplete configuration example:

```text
06:00 → 18:00
20:00 → 06:00
```

This leaves:

```text
18:00 → 20:00
```

without a wage rate.

If a completed shift includes an uncovered period, the system must not guess a wage.

Preferred behavior:

```text
Reject final wage calculation
```

and report the uncovered time range.

---

# 12. Overlapping Wage Rates

Two active wage ranges for the same employee must not overlap.

Invalid:

```text
06:00 → 18:00 = 8750
17:00 → 22:00 = 10000
```

The interval:

```text
17:00 → 18:00
```

would be ambiguous.

The backend must reject overlapping active wage configurations.

---

# 13. Wage Rate Validation

When creating or updating wage rates, validate:

1. Employee exists.
2. Employee belongs to current branch.
3. Hourly rate is non-negative.
4. Start and end times are not identical.
5. Active ranges do not overlap.
6. Historical shifts must not be retroactively recalculated automatically.

---

# 14. Historical Wage Integrity

Changing an employee's wage rate today must not alter the pay of an already completed historical shift.

Example:

Yesterday:

```text
06:00–18:00 = 8750
```

Today rate changes to:

```text
06:00–18:00 = 9500
```

Yesterday's completed shift remains calculated using:

```text
8750
```

The system must preserve wage calculation snapshots for completed shifts.

---

# 15. Shift

A shift represents one worked period by an employee.

A shift contains at least:

- ID
- Employee
- Branch
- Work date
- Clock-in timestamp
- Clock-out timestamp, nullable
- Calculated hours
- Calculated base pay
- Status
- Notes
- Wage calculation snapshot
- Created timestamp
- Updated timestamp

---

# 16. Shift Status

Supported statuses should be:

```text
OPEN
COMPLETED
CANCELLED
```

Meaning:

## OPEN

Employee has started or a shift has been created without a final clock-out.

## COMPLETED

Clock-out exists and pay calculation is finalized.

## CANCELLED

Shift record was invalidated and must not be used for payment.

---

# 17. Shift Work Date

`work_date` represents the business date on which the shift began.

Example:

```text
Clock in:
2026-09-06 18:00

Clock out:
2026-09-07 02:00
```

Then:

```text
work_date = 2026-09-06
```

Do not split one overnight shift into two shift entities solely because midnight was crossed.

---

# 18. Shift Clock-In

A shift clock-in may be recorded manually by an authorized user.

The initial system does not require biometric or automatic time-clock hardware.

Clock-in must include:

- Employee
- Timestamp
- Branch context

---

# 19. Shift Clock-Out

Clock-out must be later than clock-in.

Example:

```text
Clock in:
17:00

Clock out:
20:00
```

Valid.

For overnight work:

```text
Clock in:
22:00

Clock out:
02:00 next day
```

Valid because full timestamps are used.

---

# 20. Shift Duration

Shift duration is:

```text
clock_out - clock_in
```

Do not calculate duration using only wall-clock time values without date context.

Example:

```text
22:00 → 02:00
```

is:

```text
4 hours
```

not:

```text
-20 hours
```

---

# 21. Wage Calculation Principle

A completed shift must be divided into portions according to the employee's wage rate ranges.

Example:

```text
Rates:

06:00 → 18:00
8750 / hour

18:00 → 06:00
11900 / hour
```

Shift:

```text
17:00 → 20:00
```

Must calculate:

```text
17:00 → 18:00
1 hour × 8750
= 8750

18:00 → 20:00
2 hours × 11900
= 23800
```

Total:

```text
32550
```

---

# 22. Calculation Granularity

Wage calculations must support partial hours.

Do not round worked time to whole hours.

Example:

```text
17:30 → 18:30
```

Rates:

```text
17:30 → 18:00
0.5 hour × 8750
= 4375

18:00 → 18:30
0.5 hour × 11900
= 5950
```

Total:

```text
10325
```

---

# 23. Minute-Based Calculation

Preferred implementation uses minutes or seconds as the calculation basis.

For a rate:

```text
hourly_rate
```

calculate:

```text
rate_per_minute =
hourly_rate / 60
```

Then:

```text
segment_pay =
worked_minutes * rate_per_minute
```

Retain sufficient decimal precision internally.

Round the final monetary result consistently.

---

# 24. Cross-Midnight Calculation

Example:

```text
Shift:
17:00 → 02:00
```

Rates:

```text
06:00 → 18:00
8750

18:00 → 06:00
11900
```

Segments:

```text
17:00 → 18:00
1 hour × 8750

18:00 → 00:00
6 hours × 11900

00:00 → 02:00
2 hours × 11900
```

Equivalent night total:

```text
8 hours × 11900
```

Final base pay:

```text
8750 + 95200
= 103950
```

---

# 25. Multi-Day Shifts

The calculation engine should technically support shifts longer than 24 hours if valid timestamps are supplied.

However, these should be unusual and may trigger an administrative warning.

Do not assume all shifts end on the same calendar date.

---

# 26. Wage Snapshot

When a shift is completed, preserve the exact wage ranges used.

Recommended JSON snapshot:

```json
{
  "segments": [
    {
      "start": "2026-09-06T17:00:00-05:00",
      "end": "2026-09-06T18:00:00-05:00",
      "minutes": 60,
      "hourly_rate": 8750,
      "amount": 8750
    },
    {
      "start": "2026-09-06T18:00:00-05:00",
      "end": "2026-09-06T20:00:00-05:00",
      "minutes": 120,
      "hourly_rate": 11900,
      "amount": 23800
    }
  ],
  "total_minutes": 180,
  "base_amount": 32550
}
```

This ensures historical pay remains reproducible.

---

# 27. Calculated Hours

`regular_hours` should represent actual worked duration in decimal hours.

Example:

```text
3 hours 30 minutes
=
3.5
```

This field is useful for reporting.

The wage snapshot remains the authoritative explanation of the calculation.

---

# 28. Completing a Shift

Completing a shift is a domain operation.

Flow:

```text
Authenticate user
↓
Validate branch
↓
Require employee shift permission
↓
Load employee
↓
Validate clock-in
↓
Validate clock-out
↓
Load applicable wage rates
↓
Validate complete coverage
↓
Validate no overlapping rates
↓
Calculate segments
↓
BEGIN
↓
Store clock-out
↓
Store total hours
↓
Store calculated base pay
↓
Store wage calculation snapshot
↓
Set status COMPLETED
↓
Create audit record
↓
COMMIT
```

---

# 29. Editing an OPEN Shift

An authorized user may edit an OPEN shift.

Examples:

```text
Correct clock-in
Add notes
```

Changes must be audited when they affect time.

---

# 30. Editing a COMPLETED Shift

A completed shift has financial meaning.

Do not silently edit:

```text
clock_in
clock_out
calculated_pay
```

Preferred correction behavior:

1. Require explicit correction permission.
2. Require reason.
3. Preserve previous calculation.
4. Recalculate using applicable historical/current rule intentionally.
5. Create audit record.
6. If already paid, do not silently alter payment.

---

# 31. Paid Shift Modification

If a shift already has an employee payment, ordinary time modification should be blocked.

A correction may require:

- Shift correction
- Payment difference
- Additional employee payment or explicit correction record

Do not silently rewrite a paid amount.

---

# 32. Shift Cancellation

An invalid unpaid shift may be cancelled.

Requirements:

- Permission
- Reason
- Audit

A cancelled shift:

- Does not count toward payroll.
- Cannot be paid normally.
- Remains historically visible.

Do not delete it.

---

# 33. Bonus

A bonus is an additional amount assigned to an employee.

The required model is intentionally simple.

A bonus contains:

- ID
- Employee
- Optional shift
- Bonus date
- Amount
- Comments
- User who created it
- Created timestamp

Example:

```text
Employee:
Carlos

Bonus:
20,000

Comments:
Extra support during busy evening
```

---

# 34. Bonus Simplicity

Do not introduce:

- Bonus categories
- Bonus formulas
- Automatic sales bonuses
- Percentage bonuses
- Conditional bonus engines

unless explicitly requested later.

The current requirement is:

```text
Bonus
Value
Comments
```

and nothing more complex.

---

# 35. Bonus Amount

Bonus amount must be positive.

Do not use negative bonuses for deductions.

The initial system does not define payroll deductions.

If deductions are required later, introduce a separate explicit concept.

---

# 36. Shift-Linked Bonus

A bonus may optionally reference a shift.

Example:

```text
Shift:
September 6

Bonus:
10,000
```

This makes it easy to include in that day's payment.

---

# 37. Non-Shift Bonus

A bonus may also exist without a shift reference if needed.

Example:

```text
Employee:
Carlos

Date:
September 6

Bonus:
50,000

Comment:
Special recognition
```

The payment workflow must explicitly choose which unpaid bonuses are included.

---

# 38. Bonus Immutability After Payment

Once a bonus has been included in a completed employee payment:

- Do not silently edit amount.
- Do not delete it.
- Preserve historical paid value.

Corrections must create explicit adjustment/payment difference behavior.

---

# 39. Employee Payment

An employee payment represents money actually paid to the employee.

This is distinct from calculated shift pay.

Example:

```text
Shift base pay:
32,550

Bonuses:
10,000

Total due:
42,550

Payment:
42,550
```

The payment records that money was actually delivered.

---

# 40. Daily Payment Principle

The business pays employees daily.

The system does not need a complex monthly payroll engine.

The key historical statement is:

```text
Employee X worked this shift
and was paid this amount.
```

---

# 41. Employee Payment Contents

An employee payment contains at least:

- ID
- Employee
- Shift
- Payment date
- Base amount
- Bonus amount
- Total amount
- Payment method
- User who registered payment
- Notes
- Created timestamp

Recommended additional fields:

- Payment status
- Wage snapshot reference
- Bonus snapshot
- Void/correction metadata

---

# 42. Base Amount

For a normal payment:

```text
base_amount =
shift.calculated_pay
```

The client must not arbitrarily supply a different base amount without an explicit correction flow.

---

# 43. Bonus Amount

For a normal payment:

```text
bonus_amount =
sum(selected unpaid bonuses)
```

associated with that employee/payment context.

---

# 44. Total Employee Payment

Formula:

```text
total_amount =
base_amount + bonus_amount
```

Example:

```text
Base:
87,500

Bonuses:
20,000

Total:
107,500
```

---

# 45. One Normal Payment Per Shift

A completed shift should have at most one normal confirmed employee payment.

Recommended invariant:

```text
one confirmed employee payment per shift
```

Additional correction payments, if later needed, must be explicitly marked as corrections rather than normal duplicate payments.

---

# 46. Payment Eligibility

A shift may be paid only if:

```text
status = COMPLETED
```

Do not pay:

```text
OPEN
CANCELLED
```

shifts through the normal workflow.

---

# 47. Employee Payment Flow

Conceptual flow:

```text
Authenticate user
↓
Validate branch
↓
Require employees.pay
↓
Load employee
↓
Load COMPLETED shift
↓
Validate shift not already paid
↓
Load eligible bonuses
↓
Calculate base amount
↓
Calculate bonus amount
↓
Calculate total
↓
Validate payment method
↓
BEGIN
↓
Create employee payment
↓
Mark included bonuses as paid/linked
↓
Create cash movement if payment method is CASH
↓
Create audit record
↓
COMMIT
```

---

# 48. Employee Payment and Cash

Employee payment may use configured payment methods.

Initial types:

```text
CASH
QR
CARD
```

If payment is CASH:

- Require open cash session.
- Create a physical cash outflow.
- Link the cash movement to the employee payment.

If QR or CARD:

- Do not reduce physical drawer cash.
- Preserve payment method for reporting.

---

# 49. Employee Payment Cash Movement

A cash employee payment should have an explicit cash movement semantic.

Recommended cash movement type:

```text
EMPLOYEE_PAYMENT
```

Cash effect:

```text
-amount
```

Do not misclassify employee wages as:

```text
EXPENSE
```

if direct traceability can be preserved with a dedicated type.

---

# 50. Employee Payment as Operational Expense

For profitability/reporting, employee payments are labor expenses.

They should be available to operational reporting separately from:

```text
inventory purchases
general expenses
```

Do not include employee wages in product ingredient cost.

---

# 51. Employee Payment Historical Snapshot

A payment should preserve what was actually paid.

Recommended snapshot:

```json
{
  "employee": {
    "id": "uuid",
    "name": "Carlos Gómez"
  },
  "shift": {
    "clock_in": "...",
    "clock_out": "...",
    "base_amount": 32550
  },
  "bonuses": [
    {
      "id": "uuid",
      "amount": 10000,
      "comments": "Busy night support"
    }
  ],
  "base_amount": 32550,
  "bonus_amount": 10000,
  "total_amount": 42550
}
```

Later wage-rate or bonus changes must not rewrite this payment.

---

# 52. Payment Method Snapshot

Historical employee payments should preserve:

- Payment method name
- Payment method type

This prevents later configuration changes from making historical records ambiguous.

---

# 53. Payment Status

Recommended employee payment statuses:

```text
CONFIRMED
VOID
```

A confirmed payment must not be physically deleted.

---

# 54. Employee Payment Void

If an employee payment was registered incorrectly:

Do not delete it.

Use explicit void/correction behavior.

Requirements:

- Permission
- Reason
- Preserve original payment
- Reverse cash effect if CASH
- Mark payment VOID
- Audit

If bonuses were included, their paid state must be recalculated consistently.

---

# 55. Cash Reversal for Voided Employee Payment

Original:

```text
EMPLOYEE_PAYMENT
-50,000
```

If payment is voided:

Create compensating cash movement:

```text
+50,000
```

with explicit correction/reversal metadata.

Do not edit the original cash movement.

---

# 56. Underpayment

The normal workflow assumes:

```text
payment total =
amount due
```

The initial system does not need employee partial payments.

Do not implement employee payment installments unless explicitly requested.

---

# 57. Overpayment

The normal workflow must not allow:

```text
payment > calculated amount + selected bonuses
```

without an explicit additional bonus or correction.

If more money is intentionally being paid, create a bonus first.

This keeps the reason visible.

---

# 58. Payment Date

`payment_date` represents the business date on which the employee was paid.

Usually:

```text
same day as shift
```

but the model may allow later payment.

---

# 59. Daily Employee Summary

The UI should support a daily view such as:

```text
September 6

Carlos
17:00 → 20:00
Base: 32,550
Bonus: 10,000
Paid: 42,550

María
15:00 → 23:00
Base: 83,200
Bonus: 0
Paid: 83,200
```

---

# 60. Shift Calculation Preview

Before completing a shift, authorized users should see a calculation preview.

Example:

```text
Carlos

17:00 → 20:00

17:00 → 18:00
1h × 8,750 = 8,750

18:00 → 20:00
2h × 11,900 = 23,800

Base pay:
32,550
```

The backend remains authoritative.

---

# 61. Shift Editor

The shift editor should show:

- Employee
- Work date
- Clock in
- Clock out
- Calculated duration
- Rate segments
- Calculated base pay
- Status
- Notes
- Bonuses
- Payment state

---

# 62. Wage Configuration UI

The employee editor should allow wage ranges such as:

```text
06:00 → 18:00    $8,750/h
18:00 → 06:00    $11,900/h
```

The UI should validate overlaps immediately.

The backend must validate again.

---

# 63. Rate Range Display

Cross-midnight ranges should be displayed naturally:

```text
18:00 → 06:00
```

Do not require users to manually split them into:

```text
18:00 → 23:59
00:00 → 06:00
```

The backend calculation engine may internally normalize ranges as needed.

---

# 64. Overlap Detection

Rate overlap detection must correctly handle overnight ranges.

Example:

```text
18:00 → 06:00
```

overlaps with:

```text
05:00 → 08:00
```

during:

```text
05:00 → 06:00
```

The configuration must be rejected.

---

# 65. Rate Coverage Detection

The system should detect uncovered periods.

Example:

```text
06:00 → 18:00
19:00 → 06:00
```

Gap:

```text
18:00 → 19:00
```

The UI should warn administrators.

A shift crossing the gap cannot be finalized until a valid rate exists.

---

# 66. Rate Changes

When updating rates:

Do not modify historical completed shift snapshots.

Only future or not-yet-finalized shift calculations should use the new rates.

---

# 67. Optional Effective Dates

The current DDL does not have wage-rate effective dates.

For the initial version, changing active rates affects future shift calculations from that point onward.

However, to safely support pre-created future shifts and historical configuration, effective dates are recommended.

Suggested fields:

```text
effective_from DATE
effective_to DATE NULL
```

This makes wage history much more explicit.

---

# 68. Recommended Wage Rate History Model

Prefer preserving rate records rather than overwriting historical rate values.

Example:

Old:

```text
06:00–18:00
8750
effective_to = 2026-09-30
```

New:

```text
06:00–18:00
9500
effective_from = 2026-10-01
```

This improves reproducibility.

---

# 69. Current Wage Rate Selection

When calculating a shift segment, select the wage rate applicable to:

- Employee
- Local timestamp/date
- Time-of-day
- Effective date

The entire segment must have deterministic rate coverage.

---

# 70. Branch Timezone

Shift calculation uses branch-local time.

This is critical.

Example branch timezone:

```text
America/Bogota
```

Clock timestamps may be stored as `TIMESTAMPTZ`, but wage time-range comparisons use the branch's local wall-clock time.

Do not use server timezone implicitly.

---

# 71. Daylight Saving Time

For branches in timezones with daylight-saving transitions, duration calculations must use actual timestamps.

Rate-range matching uses local branch time.

The current business operates in Colombia, but architecture should remain timezone-correct.

---

# 72. Shift Overlap

An employee should not normally have overlapping active/completed shifts.

Invalid:

```text
Shift A:
15:00 → 20:00

Shift B:
18:00 → 23:00
```

The overlap:

```text
18:00 → 20:00
```

should be rejected unless explicitly supported later.

---

# 73. Multiple Shifts Per Day

An employee may have multiple non-overlapping shifts on the same day.

Example:

```text
10:00 → 14:00

18:00 → 23:00
```

This is valid.

Do not enforce one shift per employee per day.

---

# 74. Shift Breaks

The current system does not explicitly model unpaid breaks.

If the business later needs break tracking, introduce a separate break entity or shift-segment model.

Do not infer breaks automatically from long shifts.

---

# 75. Bonuses and Shift Payment

When paying a shift, the UI should display eligible bonuses.

Example:

```text
Shift base:
82,000

Bonuses:

[✓] Busy night
10,000

[✓] Extra support
15,000
```

Then:

```text
Total:
107,000
```

---

# 76. Bonus Payment Link

A bonus included in a payment should be explicitly linked to that payment.

The existing DDL currently links:

```text
employee_bonuses → shift
```

but not:

```text
employee_bonuses → employee_payment
```

This should be improved.

---

# 77. Recommended Employee Payment Bonus Relation

Prefer a relation table:

```text
employee_payment_bonuses
```

with:

```text
employee_payment_id
employee_bonus_id
amount_snapshot
```

This supports:

- Exact historical inclusion
- Multiple bonuses
- No ambiguity about paid/unpaid bonuses

---

# 78. Bonus Paid State

Do not rely only on a boolean:

```text
paid = true
```

if a direct payment relation exists.

A bonus is considered paid when it is linked to a confirmed employee payment.

---

# 79. Payment Calculation Authority

The frontend sends intent such as:

```json
{
  "shift_id": "uuid",
  "bonus_ids": ["uuid1", "uuid2"],
  "payment_method_id": "uuid"
}
```

The backend calculates:

```text
base_amount
bonus_amount
total_amount
```

Do not trust client-supplied totals.

---

# 80. Employee Payment Transaction

Recommended full transaction:

```text
BEGIN

Lock shift
Validate COMPLETED
Validate not already paid

Load selected bonuses
Validate employee ownership
Validate bonuses not already paid

Resolve authoritative base amount
Calculate bonuses
Calculate total

Create employee payment
Create employee-payment bonus links

If CASH:
    validate OPEN cash session
    create cash movement

Create audit records

COMMIT
```

---

# 81. Payment Concurrency

Two users must not be able to pay the same shift simultaneously.

Use row locking and a unique confirmed-payment invariant.

Conceptually:

```text
Lock shift
↓
Check payment exists
↓
Create payment
```

---

# 82. Employee Payment Idempotency

Payment creation should use a globally unique operation ID.

Retrying the same payment must not:

- Pay the shift twice
- Include bonuses twice
- Create duplicate cash movements

---

# 83. Offline Shift Entry

Shift clock-in/out may be recorded offline if supported.

Offline operation should preserve:

- Operation ID
- Employee ID
- Branch
- Device
- Local timestamp
- User
- Last known employee/shift state

The server validates on synchronization.

---

# 84. Offline Clock-In

Offline clock-in is relatively safe when creating a globally unique shift.

Potential conflict:

```text
Device A:
opens shift for Carlos

Device B:
also opens shift for Carlos
```

The server must detect overlapping OPEN shifts.

Do not silently create concurrent shifts for the same employee.

---

# 85. Offline Clock-Out

Offline clock-out may synchronize later.

The server must validate:

- Shift still exists
- Shift still OPEN
- Clock-out is valid
- No conflicting correction occurred

The server performs authoritative wage calculation.

---

# 86. Offline Wage Calculation

The client may calculate an estimated wage locally using cached rates.

The server remains authoritative.

During sync:

```text
Load authoritative wage rates
↓
Recalculate shift
↓
Persist authoritative snapshot
```

Do not trust client-calculated pay.

---

# 87. Offline Employee Payment

Employee payment is financially sensitive.

Initial recommendation:

Require server connectivity for final employee payment.

The UI may prepare payment information offline, but final payment should validate:

- Shift status
- Current payment state
- Bonuses
- Cash session
- Payment method
- Permissions

before committing.

---

# 88. Cash Employee Payment Offline

Avoid finalizing CASH employee payment offline in the MVP.

This reduces risk of:

- Closed cash session conflict
- Duplicate wage payment
- Duplicate cash outflow

---

# 89. Audit Requirements

Audit at minimum:

## Employees

- Create employee
- Update employee
- Activate employee
- Deactivate employee

## Wage Rates

- Create wage rate
- Change wage rate
- Activate/deactivate wage rate

## Shifts

- Shift created
- Clock-in changed
- Shift completed
- Completed shift corrected
- Shift cancelled

## Bonuses

- Bonus created
- Bonus changed before payment
- Bonus voided/corrected

## Payments

- Employee payment created
- Employee payment voided
- Payment correction

---

# 90. Shift Audit Example

```json
{
  "action": "EMPLOYEE_SHIFT_COMPLETED",
  "entity_type": "employee_shift",
  "entity_id": "uuid",
  "after_data": {
    "employee_id": "uuid",
    "clock_in": "2026-09-06T17:00:00-05:00",
    "clock_out": "2026-09-06T20:00:00-05:00",
    "hours": 3,
    "calculated_pay": 32550
  }
}
```

---

# 91. Employee Payment Audit Example

```json
{
  "action": "EMPLOYEE_PAYMENT_CREATED",
  "entity_type": "employee_payment",
  "entity_id": "uuid",
  "after_data": {
    "employee_id": "uuid",
    "shift_id": "uuid",
    "base_amount": 32550,
    "bonus_amount": 10000,
    "total_amount": 42550,
    "payment_method_type": "CASH"
  }
}
```

---

# 92. Suggested Permissions

Recommended permissions:

```text
employees.view
employees.create
employees.update
employees.activate
employees.deactivate

employees.view_rates
employees.manage_rates

employees.view_shifts
employees.create_shift
employees.update_shift
employees.complete_shift
employees.cancel_shift
employees.correct_shift

employees.view_bonuses
employees.create_bonus
employees.update_bonus

employees.view_payments
employees.pay
employees.void_payment
```

Exact naming must remain consistent with the centralized authorization module.

---

# 93. Reporting

This module must support reporting such as:

## Employee

- Shifts by employee
- Hours worked
- Base pay
- Bonuses
- Total paid

## Date

- Employees worked today
- Total hours
- Total employee payments
- Unpaid completed shifts

## Wage Analysis

- Cost by employee
- Cost by position
- Labor cost by day
- Labor cost by branch

---

# 94. Daily Payroll View

Recommended operational screen:

```text
TODAY

Carlos Gómez
17:00 → 20:00
3.00 h
Base: $32,550
Bonus: $10,000
Total: $42,550
PAID

María López
15:00 → 23:00
8.00 h
Base: $82,700
Bonus: $0
Total: $82,700
PENDING
```

---

# 95. Unpaid Shift Alert

Dashboard may show:

```text
3 completed shifts pending payment
```

This prevents forgotten daily payments.

---

# 96. Labor Cost and Product Cost

Employee wages do not belong inside:

```text
products.calculated_cost
```

Product cost remains ingredient/inventory cost.

Labor cost belongs to operational profitability reporting.

Do not allocate wages into product recipes in the current system.

---

# 97. Labor Cost Reporting

Operational profitability may later calculate:

```text
Sales
- Historical product cost
- General expenses
- Employee payments
= Estimated operating result
```

Keep these concepts separate.

---

# 98. Backend Invariants

The backend must enforce all of the following:

1. Employees and users are independent entities.
2. Employee belongs to one branch in current scope.
3. Inactive employees cannot receive new normal shifts.
4. Shift timestamps use full datetime values.
5. Clock-out must be after clock-in.
6. Overnight shifts are supported.
7. Multiple non-overlapping shifts per employee/day are allowed.
8. Overlapping employee shifts are not allowed.
9. Wage rates are employee-specific.
10. Wage rates may cross midnight.
11. Active wage ranges must not overlap.
12. Shift wage calculation must have complete rate coverage.
13. Completed shift pay is calculated by time segments.
14. Partial hours must be paid proportionally.
15. Branch-local timezone is used for rate-range matching.
16. Completed shift wage snapshots must not change when rates change later.
17. Completed paid shifts must not be silently edited.
18. Bonuses are simple positive monetary additions.
19. Bonuses included in a payment must be historically identifiable.
20. Employee payment base amount comes from completed shift.
21. Employee payment total equals base amount plus included bonuses.
22. One normal confirmed payment per shift.
23. Employee payments must not be physically deleted.
24. CASH employee payments require an OPEN cash session.
25. Employee payment retries must be idempotent.
26. Concurrent payment attempts must not pay a shift twice.
27. Client-calculated wage/pay values are never authoritative.

---

# 99. Main Use Cases

This module must support at minimum:

```text
Create employee
View employee
Update employee
Activate/deactivate employee

Configure employee wage ranges
View wage ranges
Change future wage rates

Create shift
Clock in
Clock out
Preview wage calculation
Complete shift
Cancel shift
Correct unpaid completed shift

Create bonus
View employee bonuses

View daily employee summary
View unpaid completed shifts

Pay completed shift
Include bonuses
Record payment method
Record cash outflow when applicable

View historical employee payments
Void/correct payment when authorized
```

---

# 100. Integration With Cash Module

For CASH employee payment:

```text
Employee payment
↓
Cash movement EMPLOYEE_PAYMENT
↓
Expected cash decreases
```

CARD/QR employee payment:

```text
No physical drawer movement
```

The Cash module owns drawer reconciliation.

---

# 101. Integration With Reporting

This module provides:

```text
Worked hours
Shift base cost
Bonuses
Actual employee payments
Labor expense
```

Reports must distinguish:

```text
Calculated but unpaid shift cost
```

from:

```text
Actually paid employee amount
```

---

# 102. Non-Goals

This module intentionally does not implement:

- Monthly payroll
- Social security
- Benefits
- Tax withholding
- Overtime labor-law automation
- Holiday/sunday legal surcharge engine
- Vacation management
- Sick leave
- Employee contracts
- Payroll deductions
- Loans to employees
- Automatic sales commissions
- Biometric attendance
- Employee-user linking
- Shift scheduling calendar

These may be introduced later if explicitly required.

The system currently calculates pay strictly from configured hourly ranges and manually assigned bonuses.

---

# 103. Required Schema Adjustments

The existing DDL requires several additions to fully support this specification.

Implement these through migrations.

## 103.1 Add Wage Rate Effective Dates

Recommended additions to `employee_wage_rates`:

```text
effective_from DATE NOT NULL
effective_to DATE NULL
```

This preserves rate history.

---

# 104. Add Shift Calculation Snapshot

Add to `employee_shifts`:

```text
wage_calculation_snapshot JSONB
```

For COMPLETED shifts it should preserve the exact segment calculation.

---

# 105. Add Shift Cancellation Metadata

Recommended fields:

```text
cancelled_at
cancelled_by_user_id
cancel_reason
```

---

# 106. Add Employee Payment Status

Recommended values:

```text
CONFIRMED
VOID
```

Add to:

```text
employee_payments.status
```

---

# 107. Add Employee Payment Void Metadata

Recommended:

```text
voided_at
voided_by_user_id
void_reason
```

---

# 108. Add Employee Payment Snapshot

Recommended:

```text
payment_snapshot JSONB
```

This preserves:

- Employee identity snapshot
- Shift snapshot
- Wage calculation
- Bonuses
- Payment method

---

# 109. Add Employee Payment Operation ID

Recommended:

```text
operation_id UUID UNIQUE
```

for idempotency.

---

# 110. Add Employee Payment Bonus Relation

Recommended table:

```sql
CREATE TABLE employee_payment_bonuses (
    employee_payment_id UUID NOT NULL
        REFERENCES employee_payments(id),

    employee_bonus_id UUID NOT NULL
        REFERENCES employee_bonuses(id),

    amount_snapshot NUMERIC(14, 2) NOT NULL,

    PRIMARY KEY (
        employee_payment_id,
        employee_bonus_id
    )
);
```

This explicitly identifies which bonuses were paid.

---

# 111. Add Cash Movement Employee Payment Reference

Recommended addition to `cash_movements`:

```text
employee_payment_id UUID NULL
REFERENCES employee_payments(id)
```

---

# 112. Add Employee Payment Cash Movement Type

Extend:

```text
cash_movement_type
```

with:

```text
EMPLOYEE_PAYMENT
```

Cash effect:

```text
DECREASE
```

---

# 113. Prevent Duplicate Normal Shift Payment

Recommended unique partial index after payment status exists:

```sql
CREATE UNIQUE INDEX uq_confirmed_employee_payment_per_shift
ON employee_payments(shift_id)
WHERE status = 'CONFIRMED';
```

This prevents accidental double payment.

---

# 114. Critical Implementation Principle

Do not implement employee payroll as:

```text
Hours
×
one flat rate
```

The required model is:

```text
Shift
↓
Split by configured time ranges
↓
Calculate each segment
↓
Sum Base Pay
↓
Add Bonuses
↓
Employee Payment
```

The critical flows are:

```text
SHIFT

Clock In
↓
Worked Time
↓
Clock Out
↓
Rate Segmentation
↓
Historical Wage Snapshot
↓
COMPLETED
```

```text
PAYMENT

Completed Shift
↓
Base Amount
↓
Selected Bonuses
↓
Total Amount
↓
Payment Method
↓
Cash Effect if applicable
↓
Historical Payment
```

```text
HISTORY

Future Wage Rate Changes
↓
Must NOT alter
↓
Completed Shift Calculations
or
Historical Payments
```

All implementation decisions must preserve:

- Wage calculation correctness
- Historical integrity
- Payment traceability
- Branch isolation
- Cash integration
- Idempotency
- Concurrency safety
- Auditability