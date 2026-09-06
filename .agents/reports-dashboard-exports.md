# Reports, Dashboard and CSV Exports Module

## Purpose

This document defines the business rules, data semantics, metrics, aggregation behavior and expected implementation for:

- Operational dashboard
- Sales reports
- Product performance reports
- Profitability reports
- Inventory reports
- Purchase reports
- Expense reports
- Cash reports
- Payment-method reports
- Employee reports
- Customer reports
- Table and dining-area reports
- CSV exports
- Date filtering
- Historical snapshot usage
- Current-state vs historical-state reporting
- Permission requirements
- Performance considerations

This document must be treated as authoritative context when implementing or modifying reporting, dashboard or data-export functionality.

All financial and operational reports must respect the historical integrity rules defined by the source modules.

Do not recalculate historical business facts using current mutable catalog data.

---

# 1. Core Reporting Principle

Reports must distinguish between:

```text
CURRENT STATE
```

and:

```text
HISTORICAL FACT
```

Examples of current state:

```text
Current inventory stock
Current inventory cost
Current product price
Current product margin
Current table status
Open cash sessions
```

Examples of historical facts:

```text
Sale price at sale time
Product cost at sale time
Payment method used
Discount applied
Service charged
Inventory movement
Employee payment
Cash close
```

Historical reports must use historical snapshots and transactional records.

---

# 2. Never Recalculate History From Current Catalog Data

Invalid historical calculation:

```text
Historical Sale
↓
Join current product
↓
Use current product price/cost
```

Correct:

```text
Historical Sale
↓
Use account item sale snapshot
```

For historical sales use:

```text
account_items.unit_price
account_items.unit_cost
account_items.quantity
historical discount fields
historical tax fields
historical additional fields
```

Do not use current `products.sale_price` or `products.calculated_cost`.

---

# 3. Report Scope

All reports must be scoped by:

- Company
- Branch
- User permissions
- Date filters where applicable

A user must never receive report data from a branch they cannot access.

---

# 4. Date Filters

Standard dashboard/report filters should include:

```text
TODAY
YESTERDAY
THIS_WEEK
THIS_MONTH
CUSTOM
```

Custom filter:

```text
start_date
end_date
```

Date calculations must use branch-local timezone.

Do not use database-server timezone implicitly.

---

# 5. Date Range Semantics

For a local date range:

```text
2026-09-01
to
2026-09-06
```

the backend should convert this to the appropriate branch-timezone timestamp range.

Conceptually:

```text
start:
2026-09-01 00:00:00 branch local

end exclusive:
2026-09-07 00:00:00 branch local
```

Prefer half-open intervals:

```text
[start, end)
```

This avoids end-of-day precision errors.

---

# 6. Historical Sale Date

Sales reporting should normally use the account's financial completion timestamp.

Recommended:

```text
accounts.closed_at
```

for completed sales.

A sale belongs to reporting when:

```text
accounts.status = PAID
```

Do not count OPEN accounts as completed revenue.

---

# 7. Voided Accounts

Accounts with:

```text
status = VOID
```

must not contribute to sales revenue.

They may be included in a dedicated operational cancellation report.

---

# 8. Sales Dashboard Metrics

Dashboard should provide at minimum:

```text
Sales Today
Paid Accounts
Average Ticket
Historical Product Cost
Gross Profit
Gross Margin
Tables Occupied
Expenses Today
```

Additional useful metrics:

```text
Service Collected
Discounts Given
Cash Sales
Card Sales
QR Sales
```

---

# 9. Sales Metric

Sales for a period:

```text
sales =
sum(final amount actually charged on PAID accounts)
```

For direct settlement:

Use authoritative final account values.

For split settlement:

Use the finalized charged split totals.

Do not double-count parent account totals and split totals.

---

# 10. Net Sales vs Service

Reports should distinguish:

```text
product/service consumption revenue
```

from:

```text
service charge collected
```

Recommended metrics:

```text
Net Sales Before Service
Service Collected
Final Charged Total
```

Example:

```text
Net sales:
1,000,000

Service:
100,000

Final charged:
1,100,000
```

---

# 11. Tax Separation

Taxes must be reported separately where applicable.

Recommended:

```text
Net Sales
Tax
Service
Final Charged Amount
```

Do not mix service and tax into one field.

---

# 12. Historical Cost of Sales

Historical product cost for a period:

```text
cost_of_sales =
sum(
    account_item.unit_cost
    * active sold quantity
)
```

Use sale-time snapshots.

Voided account items must not contribute to finalized cost of sales.

---

# 13. Gross Profit

Gross profit:

```text
gross_profit =
net_sales_before_service_and_operating_expenses
-
historical_cost_of_sales
```

Service may be reported separately.

Do not subtract general operational expenses when calculating gross product profit.

---

# 14. Gross Margin

Formula:

```text
gross_margin =
gross_profit / net_sales
```

For percentage display:

```text
gross_margin_percentage =
gross_margin * 100
```

If net sales are zero:

```text
margin = null
```

or equivalent undefined value.

Do not divide by zero.

---

# 15. Average Ticket

Average ticket:

```text
average_ticket =
final charged sales
/
number of paid accounts
```

Use accounts, not account items.

If there are no paid accounts:

```text
average_ticket = 0
```

---

# 16. Account Count

Dashboard "orders" or "accounts" metric should represent:

```text
number of PAID accounts
```

for completed-sales reporting.

Operational views may separately show:

```text
currently OPEN accounts
```

Do not confuse these metrics.

---

# 17. Sales By Day

Recommended output:

```text
Date
Paid Accounts
Net Sales
Service
Final Total
Cost
Gross Profit
Margin
```

Useful for line/bar charts.

---

# 18. Sales By Hour

Use account financial completion time unless another report explicitly asks for order-entry hour.

Recommended grouping:

```text
hour(accounts.closed_at in branch timezone)
```

Example:

```text
11:00
12:00
13:00
...
```

This answers:

```text
At what times is revenue actually completed?
```

A separate future operational report may group consumption by item-confirmation time.

---

# 19. Sales By Product

For each product snapshot/product ID:

```text
Product
Quantity Sold
Net Revenue
Historical Cost
Gross Profit
Gross Margin
```

Use active non-void account items from PAID accounts.

---

# 20. Product Rename Behavior

If a product is renamed:

Historical sales still preserve the sale-time name.

Reports may offer either:

```text
Current Product Name
```

or:

```text
Historical Product Name
```

Preferred default:

Group by stable `product_id` where available and display current name, while preserving historical snapshot name in detail exports.

If the product no longer exists or is unavailable, use snapshot name.

---

# 21. Product Quantity Sold

Formula:

```text
quantity_sold =
sum(account_items.quantity)
```

for valid, non-void items on PAID accounts.

---

# 22. Product Revenue

Product revenue should include commercial product/additional revenue attributable to the item.

Do not use current price.

Use historical line values.

---

# 23. Product Profitability

Product profitability report should include:

```text
Product
Quantity Sold
Historical Revenue
Historical Cost
Gross Profit
Gross Margin
```

This differs from current product profitability.

Historical report:

```text
uses sales snapshots
```

Current catalog profitability:

```text
uses products.sale_price
products.calculated_cost
```

Do not mix them.

---

# 24. Most Sold Products

Rank by:

```text
quantity sold
```

Example:

```text
1. Churrasco
2. Soda
3. Lomo
```

Allow configurable top-N display, such as:

```text
Top 5
Top 10
```

---

# 25. Least Sold Products

Rank products with actual sales in selected period by ascending quantity.

Do not automatically include every unsold inactive product unless the report explicitly asks for zero-sale catalog items.

---

# 26. Most Profitable Products

Possible ranking metrics:

```text
Total Gross Profit
Gross Margin %
Profit Per Unit
```

Default recommended metric:

```text
Total Gross Profit
```

because a high-margin product with almost no sales may contribute little to actual business profit.

The UI may allow changing ranking metric.

---

# 27. Current Product Profitability Report

Separately provide a current catalog report:

```text
Product
Current Sale Price
Current Calculated Cost
Current Profit
Current Margin
Active
```

This report is not date-based.

It uses current catalog state.

---

# 28. Discount Reporting

Report at minimum:

```text
Total Discounts
Account Discounts
Item Discounts
Discounts by User
Discounts by Rule
```

Use historical applied amounts.

Do not recompute from current discount-rule definitions.

---

# 29. Service Reporting

Report:

```text
Service Collected
Average Service Percentage
Accounts With Service
Accounts Without Service
```

For split-settlement accounts:

```text
actual service =
sum(split.service_total)
```

Do not use parent default service amount.

---

# 30. Payment Method Reporting

Report:

```text
CASH
CARD
QR
```

and optionally configured payment-method names:

```text
Cash
Bold
Nequi
Bancolombia QR
```

Metrics:

```text
Transaction count
Amount
Percentage of received payments
```

---

# 31. Mixed Payment Reporting

Mixed payments must be reported by actual payment records.

Example account:

```text
Cash:
50,000

Card:
100,000
```

Reports count:

```text
50,000 CASH
100,000 CARD
```

Do not classify the whole account under one method.

---

# 32. Cash Sales Reporting

Cash sales:

```text
sum(CONFIRMED payments where method type = CASH)
```

Do not derive this merely from cash movements if payment-level reporting is requested.

Cash movements remain useful for cash-register reconciliation.

---

# 33. Sales By User

Report account/order-taking attribution.

Possible metrics:

```text
Accounts Opened
Items Added
Quantity Sold
Revenue Attributed
```

Use:

```text
accounts.opened_by_user_id
account_items.added_by_user_id
```

Clearly label which attribution is being shown.

Do not assume these two are always the same person.

---

# 34. Waiter Reporting

Because employees and users are independent, waiter sales reporting is based on authenticated users.

Example:

```text
User:
Carlos

Items Added:
45

Revenue Attributed:
1,500,000
```

Do not join to `employees` unless an explicit relationship is introduced later.

---

# 35. Sales By Table

Report:

```text
Table
Paid Accounts
Revenue
Average Ticket
```

Optional:

```text
Average account duration
```

using:

```text
opened_at
closed_at
```

---

# 36. Sales By Dining Area

Report:

```text
Dining Area
Paid Accounts
Revenue
Average Ticket
```

This helps compare salon/terrace/etc.

---

# 37. Customer Reports

Customer reports may include:

```text
Customer
Number of Paid Accounts
Total Spend
Average Ticket
Last Visit
```

Only accounts explicitly associated with a customer contribute.

Anonymous accounts remain anonymous.

---

# 38. Customer Purchase History

Customer detail view may show:

```text
Date
Table
Products
Total
Payment Methods
```

History is derived from relational sales data.

Do not maintain a duplicated customer-history table.

---

# 39. Inventory Current Report

Current inventory report:

```text
Inventory Item
Unit
Current Stock
Minimum Stock
Stock Status
Current Unit Cost
Current Inventory Value
Active
```

Current inventory value:

```text
current_stock * current_unit_cost
```

for positive stock.

Negative stock should be clearly identified.

---

# 40. Inventory Stock Status Report

Group inventory into:

```text
NEGATIVE_STOCK
OUT_OF_STOCK
LOW_STOCK
OK
```

Use the inventory module's established precedence.

---

# 41. Inventory Consumption Report

Inventory consumption over a period should come from:

```text
inventory_movements
```

with relevant movement type:

```text
SALE
```

Report:

```text
Inventory Item
Quantity Consumed
Historical Movement Cost
Estimated Consumption Value
```

Do not infer consumption by re-expanding current recipes from historical product sales.

---

# 42. Inventory Adjustment Report

Report:

```text
Inventory Item
Adjustment Quantity
Movement Type
Reason
User
Date
Stock Before
Stock After
```

Include:

```text
MANUAL_ADJUSTMENT
CORRECTION
RETURN
```

as appropriate.

---

# 43. Kardex Report

The Kardex report is chronological.

Recommended columns:

```text
Date/Time
Inventory Item
Movement Type
Quantity
Unit
Stock Before
Stock After
Unit Cost
Source Type
Source Reference
User
Reason
```

Filters:

```text
Branch
Inventory Item
Date Range
Movement Type
User
```

---

# 44. Inventory Purchase Report

Report:

```text
Purchase Date
Supplier
Inventory Item
Quantity
Unit
Purchase Unit Cost
Subtotal
Purchase
```

Historical purchase cost comes from:

```text
purchase_items.unit_cost
```

---

# 45. Purchase Summary Report

Report by:

```text
Date
Supplier
Inventory Item
```

Metrics:

```text
Purchase Count
Quantity Purchased
Purchase Spend
Average Purchase Unit Cost
```

---

# 46. Supplier Report

Possible supplier metrics:

```text
Supplier
Purchase Count
Purchase Spend
Expense Spend
Last Purchase
```

Do not merge inventory purchase spend and operational expense spend without clearly labeling them.

---

# 47. Expense Report

Report:

```text
Date
Concept
Supplier
Amount
Payment Method
User
Status
```

Summary metrics:

```text
Total Expenses
Expense Count
Expenses by Supplier
Expenses by Payment Method
```

VOID expenses must not contribute to finalized expense totals.

---

# 48. Operational Profit Estimate

A high-level business metric may calculate:

```text
Net Sales
- Historical Cost of Sales
- Operational Expenses
- Confirmed Employee Payments
=
Estimated Operating Result
```

This is an internal management estimate.

It is not formal accounting net income.

Do not label it as audited profit or tax profit.

---

# 49. Purchases vs Expenses in Profitability

Do not calculate:

```text
Sales
- Purchases
```

as product profit.

Purchases increase inventory.

Use:

```text
historical cost of sold products
```

for gross product profitability.

Operational expenses are separate.

---

# 50. Employee Report

Employee reporting should include:

```text
Employee
Completed Shifts
Worked Hours
Calculated Base Pay
Bonuses Paid
Total Paid
Pending Completed Shifts
```

---

# 51. Employee Daily Report

Recommended:

```text
Date
Employee
Clock In
Clock Out
Hours
Base Pay
Bonuses
Total Due
Payment Status
Paid Amount
```

---

# 52. Employee Payment Report

Report:

```text
Payment Date
Employee
Shift
Base Amount
Bonus Amount
Total
Payment Method
Paid By User
Status
```

VOID employee payments must not contribute to actual paid totals.

---

# 53. Labor Cost Report

Labor cost may be viewed by:

```text
Date
Employee
Position
Branch
```

Metrics:

```text
Base Pay
Bonuses
Total Paid
```

Do not include calculated but unpaid wages in "actual paid labor" unless explicitly requested.

---

# 54. Calculated Labor vs Paid Labor

Reports must distinguish:

```text
Calculated Labor Cost
```

from:

```text
Actual Employee Payments
```

Example:

```text
Completed shift due:
100,000

Paid:
0
```

Calculated labor:

```text
100,000
```

Actual paid labor:

```text
0
```

---

# 55. Cash Session Report

Report:

```text
Register
Opened At
Closed At
Opened By
Closed By
Opening Amount
Expected Cash
Counted Cash
Difference
Status
```

---

# 56. Cash Difference Report

Report sessions where:

```text
difference != 0
```

Recommended columns:

```text
Date
Register
Expected
Counted
Difference
Closed By
Closing Notes
```

---

# 57. Cash Movement Report

Report:

```text
Date
Register
Session
Movement Type
Amount
Direction
Source
User
Reason
```

---

# 58. Payment Reconciliation Report

Within a cash session:

```text
Cash Payments
Card Payments
QR Payments
Cash Purchases
Cash Expenses
Withdrawals
Deposits
Adjustments
```

This helps explain the session close.

---

# 59. Open Operational Alerts

Dashboard should expose operational alerts such as:

```text
Negative Stock
Out of Stock
Low Stock
Open Cash Session
Cash Difference
Occupied Tables
Pending Print Failures
Completed Employee Shifts Pending Payment
```

These are current operational state, not historical period metrics.

---

# 60. Dashboard Current Table Metrics

Recommended:

```text
Total Active Tables
Available Tables
Occupied Tables
Reserved Tables
```

Current values come from:

```text
restaurant_tables.status
```

---

# 61. Occupancy Percentage

Optional:

```text
occupancy_percentage =
occupied_tables / active_tables * 100
```

Reserved tables should not count as occupied unless explicitly intended.

---

# 62. Open Accounts

Dashboard may display:

```text
Current Open Accounts
Current Open Account Value
```

These are operational metrics only.

Do not add open-account values into finalized sales revenue.

---

# 63. Print Failure Alert

Dashboard may show:

```text
Failed Print Jobs
```

with links to print-job troubleshooting.

Do not classify print failures as financial failures.

---

# 64. Dashboard Charts

Recommended charts:

```text
Sales by Hour
Sales by Day
Top Products
Payment Method Mix
Gross Profit Trend
Expense Trend
```

Additional optional charts:

```text
Inventory Consumption
Labor Cost
Table Performance
```

---

# 65. Dashboard Performance

Dashboard endpoints should avoid running dozens of unrelated client queries.

Prefer one or a few purpose-built dashboard queries/endpoints.

Example:

```text
GET /dashboard?range=today
```

may return grouped sections:

```json
{
  "summary": {},
  "sales_by_hour": [],
  "top_products": [],
  "payment_methods": [],
  "alerts": {}
}
```

The exact API design may vary.

---

# 66. Report Pagination

Detailed reports may contain many rows.

Backend endpoints must support pagination.

Recommended:

```text
page
page_size
```

or cursor-based pagination where more appropriate.

Do not load complete historical datasets into frontend memory unnecessarily.

---

# 67. Sorting

Reports should support deterministic sorting.

Examples:

```text
date desc
sales desc
quantity desc
profit desc
name asc
```

The backend should validate allowed sort fields.

Do not directly interpolate arbitrary client field names into SQL.

---

# 68. Filtering

Relevant report filters may include:

```text
Date Range
Branch
Product
Inventory Item
Supplier
Customer
User
Employee
Payment Method
Movement Type
Cash Register
Status
Dining Area
Table
```

Only expose filters meaningful to each report.

---

# 69. CSV Export Principle

CSV exports are structured data exports.

They should represent authoritative database values in a stable, machine-readable format.

Do not export formatted dashboard cards or chart labels as CSV.

---

# 70. Required CSV Exports

The system should support CSV export for at least:

```text
Sales
Sale Details
Products
Inventory
Inventory Movements
Purchases
Purchase Items
Expenses
Customers
Employees
Employee Shifts
Employee Payments
Payments
Cash Sessions
Cash Movements
Audit Logs
```

---

# 71. Sales CSV

Recommended columns:

```text
account_id
branch
table
customer
opened_at
closed_at
status
subtotal
discount_total
tax_total
service_total
final_total
opened_by_user
settlement_mode
```

---

# 72. Sale Details CSV

Recommended columns:

```text
account_id
account_item_id
sale_date
product_id
product_name_snapshot
quantity
unit_price
unit_cost
line_subtotal
discount_total
tax_total
line_total
added_by_user
status
```

Optional additional details may be exported separately or serialized carefully.

---

# 73. Products CSV

Current catalog export:

```text
product_id
branch
name
sale_price
calculated_cost
profit
margin
tax
active
```

This represents current state.

---

# 74. Inventory CSV

Recommended:

```text
inventory_item_id
branch
name
unit
current_stock
minimum_stock
stock_status
unit_cost
current_value
active
```

---

# 75. Inventory Movements CSV

Recommended:

```text
movement_id
date
branch
inventory_item
movement_type
quantity
unit_cost
stock_before
stock_after
source_type
source_id
reason
created_by_user
```

---

# 76. Purchases CSV

Recommended:

```text
purchase_id
purchase_date
branch
supplier
document_number
subtotal
tax_total
discount_total
total
payment_method
status
created_by_user
```

---

# 77. Purchase Items CSV

Recommended:

```text
purchase_id
purchase_item_id
purchase_date
supplier
inventory_item
quantity
unit
unit_cost
subtotal
```

---

# 78. Expenses CSV

Recommended:

```text
expense_id
expense_date
branch
supplier
concept
amount
payment_method
cash_session
status
created_by_user
```

---

# 79. Customers CSV

Recommended:

```text
customer_id
branch
name
phone
email
notes
active
```

Do not include derived purchase history in the base customer export unless explicitly requested.

---

# 80. Employees CSV

Recommended:

```text
employee_id
branch
first_name
last_name
document
phone
email
position
active
```

---

# 81. Employee Shifts CSV

Recommended:

```text
shift_id
employee
work_date
clock_in
clock_out
hours
calculated_pay
status
```

---

# 82. Employee Payments CSV

Recommended:

```text
payment_id
payment_date
employee
shift_id
base_amount
bonus_amount
total_amount
payment_method
status
paid_by_user
```

---

# 83. Payments CSV

Recommended:

```text
payment_id
date
account_id
split_id
payment_method_name
payment_method_type
amount
reference
cash_session_id
received_by_user
status
```

---

# 84. Cash Sessions CSV

Recommended:

```text
cash_session_id
cash_register
opened_at
closed_at
opening_amount
expected_cash
counted_cash
difference
status
opened_by_user
closed_by_user
```

---

# 85. Audit CSV

Audit export may include:

```text
audit_id
timestamp
company
branch
user
action
entity_type
entity_id
ip_address
```

Large JSON before/after values may be:

- Included as JSON strings
- Omitted from default export
- Offered in a detailed audit export

Do not flatten arbitrary JSON structures into unstable columns.

---

# 86. CSV Encoding

CSV files should use:

```text
UTF-8
```

Prefer UTF-8 with BOM only if required for Excel compatibility in target environments.

The export service should correctly escape:

- Commas
- Quotes
- New lines

---

# 87. CSV Delimiter

Recommended default:

```text
,
```

If regional Excel compatibility becomes problematic, semicolon export may be configurable.

Do not silently vary delimiter between exports.

---

# 88. CSV Dates

Use a stable ISO-like representation.

Example:

```text
2026-09-06T17:30:00-05:00
```

or:

```text
2026-09-06 17:30:00
```

with documented timezone semantics.

Prefer explicit offset for timestamps.

---

# 89. CSV Monetary Values

Export raw numeric values without currency symbols.

Preferred:

```text
65000.00
```

not:

```text
$65.000
```

This improves machine readability.

---

# 90. CSV Decimal Separator

Use:

```text
.
```

as decimal separator in machine-readable exports.

Locale formatting belongs to UI, not raw export values.

---

# 91. Export Permissions

Exports require explicit permission.

Recommended:

```text
reports.export
```

Cost-sensitive exports also require:

```text
reports.view_costs
```

or:

```text
reports.view_profitability
```

Example:

A user may export sales revenue but not historical product cost.

---

# 92. Cost Visibility

If a user lacks cost permission:

Do not include:

```text
unit_cost
historical_cost
gross_profit
margin
inventory valuation
```

in report responses or exports.

Do not merely hide these frontend columns while still sending values in the API.

---

# 93. Report Permissions

Recommended permissions:

```text
reports.view

reports.sales
reports.products
reports.inventory
reports.purchases
reports.expenses
reports.cash
reports.employees
reports.customers

reports.view_costs
reports.view_profitability

reports.export
```

Exact naming must remain consistent with the authorization module.

---

# 94. Dashboard Permission Behavior

Dashboard cards should adapt to permissions.

Example:

User has:

```text
reports.sales
```

but not:

```text
reports.view_costs
```

Show:

```text
Sales Today
Accounts
Average Ticket
```

Hide:

```text
Product Cost
Gross Profit
Gross Margin
```

The backend response should also omit unauthorized sensitive values.

---

# 95. Current vs Historical Product Cost

There are two distinct product-cost reports.

## Current

```text
products.calculated_cost
```

Answers:

```text
What would this product cost to make now?
```

## Historical

```text
account_items.unit_cost
```

Answers:

```text
What did sold products cost when they were sold?
```

Never substitute one for the other.

---

# 96. Current vs Historical Inventory Cost

Similarly:

Current:

```text
inventory_items.unit_cost
```

Historical acquisition:

```text
purchase_items.unit_cost
```

Historical sale consumption:

```text
inventory movement/sale snapshot costs
```

Reporting must label these correctly.

---

# 97. Snapshot Integrity

Reports should not mutate or "repair" historical snapshots.

If historical data appears unusual because inventory was negative or configuration was incorrect at the time, report what was actually recorded.

Data correction belongs to explicit administrative processes.

---

# 98. Materialized Views

The initial scale likely does not require materialized views for all reporting.

Start with:

- Proper indexes
- SQL aggregates
- Purpose-built reporting queries

Introduce materialized views only when actual performance data justifies them.

Do not prematurely create duplicate reporting stores.

---

# 99. Reporting Database

PostgreSQL remains the reporting source for the initial system.

Do not introduce a second analytics database merely for dashboard queries at current expected scale.

A separate analytics pipeline may be added later if volume warrants it.

---

# 100. Read Models

Purpose-built SQL views/read models are encouraged where they simplify reporting.

Existing examples:

```text
product_profitability
inventory_stock_alerts
table_overview
daily_sales_summary
```

Views must respect the domain's historical/current semantics.

---

# 101. Daily Sales Summary

A daily summary should use:

```text
PAID accounts
```

grouped by:

```text
branch-local close date
```

Recommended metrics:

```text
accounts
net_sales
service
tax
final_total
cost_of_sales
gross_profit
```

---

# 102. Dashboard Caching

Short-lived caching may be used for expensive dashboard aggregates.

However:

- Current operational alerts should remain reasonably fresh.
- Cache must be branch-aware.
- Cache must be permission-aware or store only non-sensitive shared aggregates.

Do not accidentally serve cost/profitability data from a shared cache to unauthorized users.

---

# 103. Cache Invalidation

Exact real-time invalidation is not required for every dashboard metric.

A short TTL may be acceptable.

However, critical current state such as:

```text
table status
open cash session
negative stock
```

should be refreshed frequently or queried directly.

---

# 104. Large Export Behavior

For very large exports, generating all rows synchronously may become expensive.

The initial implementation may support synchronous export for expected restaurant-scale data.

If data grows substantially later, introduce an asynchronous export job.

Do not add unnecessary job infrastructure until needed.

---

# 105. Report API Design

Prefer report-specific read endpoints over exposing arbitrary SQL/query capabilities.

Examples:

```text
GET /reports/sales
GET /reports/product-performance
GET /reports/profitability
GET /reports/inventory
GET /reports/purchases
GET /reports/expenses
GET /reports/cash
GET /reports/employees
```

Do not expose generic user-controlled database query endpoints.

---

# 106. Export API Design

Example:

```text
GET /reports/sales/export?format=csv
```

or equivalent.

The export must reuse the same filtering and authorization semantics as the on-screen report.

Do not implement separate inconsistent calculation logic for CSV.

---

# 107. Drill-Down

Dashboard and reports should allow drill-down where practical.

Example:

```text
Sales Today
↓
Sales Report
↓
Account
↓
Account Items
↓
Payments
```

Inventory:

```text
Low Stock
↓
Inventory Item
↓
Kardex
```

Cash:

```text
Difference
↓
Cash Session
↓
Movements
```

---

# 108. Account Detail From Reports

A historical paid-account detail should show:

```text
Table
Customer
Opened by
Opened at
Closed at
Items
Additional accompaniments
Discounts
Taxes
Service
Splits if any
Payments
Historical cost
Profitability if authorized
```

Use snapshots.

---

# 109. Cancellation Reports

Optional operational report:

```text
Voided Accounts
Voided Account Items
Voided Payments
Voided Purchases
Voided Expenses
```

Useful metrics:

```text
Count
Original amount
Reason
User
Date
```

This is especially useful for management/audit.

---

# 110. Audit Reports

Authorized administrators may search audit history by:

```text
Date Range
User
Action
Entity Type
Entity ID
Branch
```

Audit is not an ordinary employee-facing report.

Require:

```text
audit.view
```

---

# 111. Sensitive Audit Data

Audit metadata may contain sensitive operational information.

Do not expose audit logs broadly.

Audit export should also require appropriate permissions.

---

# 112. Dashboard Alerts

Recommended alert structure:

```json
{
  "inventory": {
    "negative_stock_count": 2,
    "out_of_stock_count": 4,
    "low_stock_count": 8
  },
  "cash": {
    "open_sessions": 1,
    "sessions_with_difference": 1
  },
  "tables": {
    "occupied": 5,
    "reserved": 1
  },
  "printing": {
    "failed_jobs": 2
  },
  "employees": {
    "unpaid_completed_shifts": 3
  }
}
```

Only include alert sections the user is permitted to view.

---

# 113. Current Stock Alert Drill-Down

From:

```text
Low Stock: 8
```

user should be able to reach a report/list showing:

```text
Inventory Item
Current Stock
Minimum Stock
Status
```

---

# 114. Revenue vs Payments

Revenue and payments are related but distinct.

A PAID account produces recognized completed sale.

Payments explain how it was settled.

Do not calculate sales revenue merely as:

```text
sum(payments)
```

because payment corrections, service allocation and settlement details may require account context.

Use account/split finalized billing state for sales metrics.

Use payments for payment-method reconciliation.

---

# 115. Account Split Reporting

For split-settlement accounts, report:

```text
Account ID
Split Count
Split Type
Actual Service Collected
Final Settled Total
```

Detailed split report may include:

```text
Split Number
Subtotal
Discount
Tax
Service %
Service
Total
Payment Methods
```

---

# 116. Service in Sales Reports

For direct settlement:

```text
service =
account.service_total
```

For split settlement:

```text
service =
sum(account_splits.service_total)
```

Do not add both.

---

# 117. Discount in Split Reporting

Discounts originate from account/item billing rules.

Do not duplicate discounts simply because the account is split.

Split allocation distributes already established payable values.

---

# 118. Inventory Movement Cost Reporting

Inventory movements may store unit-cost metadata representing:

- Purchase acquisition cost
- Sale consumption cost
- Adjustment context

Report labels must make context clear.

Do not treat every `inventory_movements.unit_cost` as a purchase cost.

---

# 119. Negative Inventory Reporting

Negative stock should be reported as an operational anomaly.

Current valuation for negative stock should not be presented as ordinary positive inventory asset value.

Recommended:

```text
current_value = null
```

or:

```text
flagged negative valuation
```

depending on UI.

---

# 120. Report Accuracy Principle

When report values disagree with current catalog state, historical transactional data wins for historical reporting.

Example:

```text
Current Churrasco price:
70,000

Historical sale:
65,000
```

Report the historical sale as:

```text
65,000
```

---

# 121. Report Timezone

All human-facing report grouping should use branch-local timezone.

Store timestamps in timezone-aware format.

Convert during grouping/display.

---

# 122. Multi-Branch Reporting

The initial architecture supports multiple branches.

A user with permission across multiple branches may eventually request aggregate company reports.

Recommended support:

```text
branch_id optional
```

If omitted and user has multi-branch reporting permission, aggregate authorized branches.

Do not aggregate unauthorized branches.

---

# 123. Cross-Branch Aggregate Labels

When aggregating multiple branches, reports should preserve branch dimension where useful.

Example:

```text
Branch
Sales
Cost
Profit
```

Do not make it impossible to drill down into branch performance.

---

# 124. Dashboard Default Scope

Dashboard defaults to the active branch.

Company-wide dashboard should be an explicit scope switch.

Do not unexpectedly mix multiple branches while user is operating a specific branch.

---

# 125. Report Data Consistency

A single report request should ideally operate against a consistent database snapshot.

For complex multi-query reports, use appropriate transaction isolation or carefully structured queries when necessary.

Avoid dashboard cards that disagree because they were calculated using incompatible conditions.

---

# 126. Export Filename

Recommended deterministic human-readable filenames:

```text
sales_2026-09-01_2026-09-06.csv
inventory_2026-09-06.csv
employee_payments_2026-09.csv
```

No sensitive user information should be unnecessarily embedded in filenames.

---

# 127. Export Audit

Exports of sensitive datasets may be audited.

Recommended audit for:

```text
Sales export
Profitability export
Inventory cost export
Employee payment export
Audit-log export
```

Record:

```text
User
Branch
Report type
Filters
Timestamp
```

---

# 128. Backend Invariants

The backend must enforce all of the following:

1. Historical reports use historical transactional snapshots.
2. Current-state reports use current state.
3. OPEN accounts do not count as finalized sales.
4. VOID accounts/items do not count as finalized revenue.
5. Product historical cost comes from sale-time snapshot.
6. Current product cost must not be used for historical profitability.
7. Purchases are not equivalent to cost of goods sold.
8. Expenses are separate from product cost.
9. Employee payments are separate labor expenses.
10. Split service must not be double-counted with parent account service.
11. Mixed payments are reported by individual payment records.
12. CARD and QR must not be treated as physical cash.
13. Historical cash closes must not be recalculated.
14. Historical employee payments must not be recalculated from current wage rates.
15. Date grouping uses branch-local timezone.
16. Branch authorization applies to all reports.
17. Sensitive cost/profitability data requires explicit permission.
18. Export permissions must be enforced by backend.
19. CSV exports must reuse authoritative report semantics.
20. Monetary calculations use decimal arithmetic.
21. Percentage/margin calculations must handle zero denominators safely.
22. Large datasets must support pagination/filtering.
23. Client must not be able to submit arbitrary SQL/report expressions.
24. Current dashboard alerts must not be confused with historical period metrics.

---

# 129. Main Dashboard Use Cases

Dashboard must support at minimum:

```text
View sales today
View paid-account count
View average ticket
View historical cost of sales
View gross profit
View gross margin
View service collected
View expenses
View payment-method mix

View sales by hour
View sales by day
View top products

View current table occupancy
View inventory alerts
View open cash sessions
View cash differences
View failed print jobs
View unpaid completed employee shifts
```

---

# 130. Main Report Use Cases

The system must support at minimum:

```text
Sales summary report
Sales detail report
Sales by product
Sales by user
Sales by table
Sales by dining area
Sales by payment method

Current product profitability
Historical product profitability

Inventory current state
Inventory alerts
Inventory consumption
Inventory Kardex
Inventory adjustments

Purchases
Purchase details
Supplier spending

Expenses

Customers
Customer purchase history

Employee shifts
Employee payments
Labor cost

Cash sessions
Cash movements
Cash differences

Audit history
```

---

# 131. Main Export Use Cases

Export at minimum:

```text
Sales
Sale Details
Products
Inventory
Inventory Movements
Purchases
Purchase Items
Expenses
Customers
Employees
Employee Shifts
Employee Payments
Payments
Cash Sessions
Cash Movements
Audit Logs
```

---

# 132. Integration With Sales

Sales module provides:

```text
Paid accounts
Historical account items
Historical prices
Historical costs
Discounts
Taxes
Service
Splits
```

This module reads them.

It must not mutate sales data.

---

# 133. Integration With Inventory

Inventory provides:

```text
Current Stock
Current Cost
Kardex
Historical Movement Costs
Stock Alerts
```

Reports must distinguish current and historical values.

---

# 134. Integration With Purchases and Expenses

Purchases provide inventory acquisition data.

Expenses provide non-inventory operational cost data.

Do not merge them into one undefined "cost" metric.

---

# 135. Integration With Employees

Employee module provides:

```text
Worked Hours
Calculated Shift Cost
Bonuses
Actual Payments
```

Reports distinguish calculated labor from actual paid labor.

---

# 136. Integration With Cash

Cash provides:

```text
Sessions
Movements
Expected Cash
Counted Cash
Difference
```

Historical close snapshots remain immutable.

---

# 137. Integration With Printing

Printing provides technical operational metrics such as:

```text
Failed Print Jobs
Reprints
```

These may be shown as alerts but are not financial metrics.

---

# 138. Non-Goals

This module intentionally does not implement:

- Formal accounting statements
- Tax returns
- Balance sheet
- Formal income statement
- Accounts receivable aging
- Accounts payable aging
- Forecasting
- Machine-learning predictions
- BI warehouse
- External BI synchronization
- Custom SQL builder
- User-authored report formulas
- Complex OLAP cube

These may be added later if explicitly required.

---

# 139. Critical Implementation Principle

Do not build reports by joining historical transactions to current mutable state and assuming values are still the same.

Correct historical flow:

```text
Historical Transaction
↓
Historical Snapshot
↓
Report
```

Correct current-state flow:

```text
Current Entity State
↓
Current Report / Dashboard Alert
```

Profitability:

```text
Historical Sale Revenue
-
Historical Sale Cost Snapshot
=
Historical Gross Profit
```

Operational business result:

```text
Historical Net Sales
-
Historical Cost of Sales
-
Operational Expenses
-
Actual Employee Payments
=
Estimated Operating Result
```

Dashboard:

```text
Historical Period Metrics
+
Current Operational Alerts
↓
One Read Model
```

All implementation decisions must preserve:

- Historical accuracy
- Clear metric semantics
- Permission isolation
- Branch isolation
- Deterministic calculations
- Consistent timezone behavior
- Export consistency
- Query performance