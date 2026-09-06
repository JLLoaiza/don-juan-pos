# Kitchen and Printing Module

## Purpose

This document defines the business rules, domain model, transactional behavior and expected implementation for:

- Kitchen orders
- Kitchen print snapshots
- Incremental kitchen tickets
- Kitchen cancellation tickets
- Thermal printer routing
- Account preview printing
- Payment receipt printing
- Day-close printing
- Reprinting
- Print jobs
- Print failures
- Print retry behavior
- Audit requirements
- Offline printing considerations

This document must be treated as authoritative context when implementing or modifying kitchen communication or printing functionality.

The Tables, Accounts and Order Taking module remains authoritative for account lifecycle and consumption confirmation.

The Cash and Payments modules remain authoritative for financial completion and day-close data.

Do not reinterpret the concepts described here without an explicit requirement change.

---

# 1. Core Domain Principle

Kitchen printing is operational communication.

It is not the commercial source of truth.

The commercial source of truth remains:

```text id="e1o3l6"
Account
↓
Account Items
```

Kitchen communication is derived from confirmed consumption:

```text id="vpf53o"
Confirmed Account Items
↓
Kitchen Order Snapshot
↓
Print Job
↓
Thermal Printer
```

A kitchen ticket must never replace or duplicate the financial account model.

---

# 2. Kitchen Order

A kitchen order represents a snapshot of newly confirmed restaurant consumption that must be communicated to kitchen staff.

It may include:

- Table
- Dining area
- Account
- Waiter/user
- Ticket number
- Creation timestamp
- Newly confirmed items
- Item quantities
- Additional accompaniments
- Notes
- Cancellation instructions when applicable

A kitchen order is immutable after creation.

---

# 3. Kitchen Order Is Not a Customer Order

The application does not use multiple financial orders per table.

Example:

```text id="dpw1zt"
Mesa 5
Account ABC

12:00
Churrasco x2

12:30
Soda x2

12:45
Lomo x1
```

This remains one account:

```text id="3iz6xy"
Account ABC
```

but may produce multiple kitchen snapshots:

```text id="wrkupu"
Kitchen ticket #1001
Churrasco x2
```

```text id="5nhlhb"
Kitchen ticket #1002
Soda x2
```

```text id="0dmm4v"
Kitchen ticket #1003
Lomo x1
```

Kitchen tickets are incremental operational events.

---

# 4. Kitchen Ticket Creation

A kitchen ticket should be created when confirmed consumption requires kitchen communication.

Conceptual flow:

```text id="365iru"
Waiter confirms account items
↓
Account item snapshots created
↓
Inventory consumption created
↓
Kitchen snapshot built
↓
Kitchen order persisted
↓
Print job created
```

Kitchen ticket creation should participate in the same logical domain operation as consumption confirmation.

The business operation should not lose the kitchen instruction if the account item was successfully confirmed.

---

# 5. Kitchen Order Persistence

The persisted kitchen order should contain:

- ID
- Branch
- Account ID
- Ticket number
- Immutable content snapshot
- User who created it
- Created timestamp
- First printed timestamp, nullable
- Reprint count

The existing `kitchen_orders.content JSONB` is appropriate for the immutable printable snapshot.

---

# 6. Kitchen Snapshot

The kitchen snapshot should contain all information required to reproduce the ticket without re-reading mutable catalog data.

Recommended structure:

```json id="qd6w7e"
{
  "type": "KITCHEN_ORDER",
  "ticket_number": "K-00125",
  "branch": {
    "id": "uuid",
    "name": "Don Juan Centro"
  },
  "dining_area": {
    "id": "uuid",
    "name": "Main Salon"
  },
  "table": {
    "id": "uuid",
    "name": "Mesa 5"
  },
  "account": {
    "id": "uuid"
  },
  "user": {
    "id": "uuid",
    "name": "Juan"
  },
  "created_at": "2026-09-06T17:00:00-05:00",
  "items": [
    {
      "account_item_id": "uuid",
      "product_name": "Churrasco de res",
      "quantity": 2,
      "notes": "Uno bien asado",
      "accompaniments": [
        {
          "name": "Extra antipasto",
          "quantity": 1
        }
      ]
    }
  ]
}
```

The printer should not need to query the current product catalog to render a historical kitchen ticket.

---

# 7. Kitchen Snapshot Source

The kitchen snapshot must be generated from the confirmed sale/account-item snapshot, not from current product definitions after the fact.

If the product is renamed later:

```text id="jken9n"
Churrasco de res
→ Churrasco Premium
```

a previous kitchen ticket must still reproduce the original item name.

---

# 8. Ticket Number

Kitchen tickets should have a human-readable ticket number in addition to their UUID.

Example:

```text id="lx4iqx"
K-000123
```

The UUID remains the technical identifier.

The ticket number exists for kitchen/operator usability.

Ticket numbering may be branch-specific.

The exact numbering format should be configurable or deterministic.

---

# 9. Kitchen Ticket Immutability

Once created, a kitchen order must not be edited.

If a mistake occurs:

- Keep the original ticket.
- Create a new cancellation or correction ticket.

Do not modify old kitchen snapshots.

This is important for operational traceability.

---

# 10. Kitchen Cancellation Ticket

When a previously confirmed account item is voided after being sent to kitchen, create a new kitchen instruction.

Example:

```text id="9j4vsg"
CANCEL

Mesa 5

1 x Churrasco de res

Reason:
Customer cancelled
```

The original ticket remains preserved.

The cancellation ticket represents a new operational fact.

---

# 11. Cancellation Snapshot

Recommended cancellation content:

```json id="zetw13"
{
  "type": "KITCHEN_CANCELLATION",
  "ticket_number": "K-00126",
  "original_account_item_id": "uuid",
  "table": {
    "name": "Mesa 5"
  },
  "user": {
    "name": "Juan"
  },
  "reason": "Customer cancelled",
  "items": [
    {
      "product_name": "Churrasco de res",
      "quantity": 1
    }
  ]
}
```

---

# 12. Kitchen Status

The initial system does NOT implement a kitchen display workflow with statuses such as:

```text id="7qr2sh"
PENDING
PREPARING
READY
DELIVERED
```

Do not add these states unless explicitly requested later.

The kitchen module is print-oriented.

---

# 13. Product Routing

Initial implementation may use a single kitchen printer for all confirmed consumption.

However, design the printing abstraction so later routing can support:

```text id="nfddpv"
Grill printer
Bar printer
Kitchen printer
Dessert printer
```

Do not hardcode:

```text id="83l7f8"
all kitchen tickets → printer IP X
```

inside account/order business logic.

---

# 14. Printer Configuration

Printer configuration belongs to branch operational settings.

A printer should conceptually contain:

- ID
- Branch
- Name
- Printer type
- Connection configuration
- Active/inactive state
- Optional routing configuration

Printer types currently required:

```text id="kojn1v"
KITCHEN
CASH
ACCOUNT
PAYMENT
```

Additional printer types may be introduced later.

---

# 15. Missing Printer Entity in Current DDL

The current DDL has:

```text id="mwm93v"
print_jobs.printer_type
```

but does not define individual physical printer records.

A physical printer configuration entity is required.

Recommended table:

```text id="c30ujk"
printers
```

Suggested fields:

```text id="njny9z"
id
branch_id
name
printer_type
connection_type
configuration JSONB
active
created_at
updated_at
```

Example:

```json id="po2yrd"
{
  "connection_type": "NETWORK",
  "configuration": {
    "host": "192.168.1.50",
    "port": 9100
  }
}
```

Do not store printer connection details inside arbitrary account or kitchen records.

---

# 16. Printer Connection Types

The printing abstraction should be capable of supporting at least:

```text id="d863ui"
NETWORK
LOCAL_AGENT
SYSTEM
```

Potential future support may include Bluetooth or USB-specific strategies.

The domain layer should not depend directly on these protocols.

Use a printer adapter/service abstraction.

---

# 17. Recommended Printing Architecture

Preferred architecture:

```text id="bnkhaz"
Frontend
↓
Backend
↓
Print Job
↓
Print Service / Local Print Agent
↓
Thermal Printer
```

The browser/mobile frontend should not contain the authoritative printing workflow.

This is especially important for:

- Retry
- Reprint
- Offline handling
- Multiple printers
- Auditability

---

# 18. Local Print Agent

For printers accessible only from the restaurant's local network, a lightweight local print agent may be used.

Conceptually:

```text id="4kxfsx"
Cloud/Local Backend
↓
Print Job
↓
Restaurant Print Agent
↓
LAN / USB Printer
```

The agent may poll or receive jobs intended for printers in its branch.

The exact transport is an infrastructure decision.

The domain contract remains based on print jobs.

---

# 19. Print Job

A print job represents an attempt/request to print a specific immutable document snapshot.

A print job contains at least:

- ID
- Branch
- Target printer/printer type
- Document type
- Reference type
- Reference ID
- Immutable payload
- Status
- Attempt count
- Error message
- Printed timestamp
- Created timestamp

---

# 20. Print Document Types

Required document types:

```text id="9zw11r"
KITCHEN_ORDER
KITCHEN_CANCELLATION
ACCOUNT_RECEIPT
PAYMENT_RECEIPT
DAY_CLOSE
```

The current DDL must be expanded to include:

```text id="gtv8as"
KITCHEN_CANCELLATION
```

---

# 21. Print Job Status

Supported status:

```text id="5xmgpr"
PENDING
PRINTED
FAILED
CANCELLED
```

Meaning:

## PENDING

Waiting for a print worker/agent.

## PRINTED

Printer service reports successful transmission/printing.

## FAILED

Printing failed after an attempt.

## CANCELLED

Job intentionally cancelled before successful printing.

---

# 22. Print Attempt Behavior

A print job tracks:

```text id="kadrdv"
attempts
```

Every actual printing attempt increments it.

If printing fails:

```text id="ltlszy"
status = FAILED
error_message = ...
```

A retry may transition:

```text id="9oql0m"
FAILED
↓
PENDING
↓
PRINTED
```

Do not create duplicate business documents merely because the physical print attempt failed.

---

# 23. Printing Failure Does Not Roll Back Sale

A physical printer failure must not roll back a valid sale/account confirmation.

Example:

```text id="bd3jge"
Account item confirmed ✅
Inventory deducted ✅
Kitchen order created ✅
Printer offline ❌
```

Correct state:

```text id="g2v3ut"
Business transaction remains valid
Print job = FAILED
```

The UI must clearly notify the user that printing failed and allow retry/reprint.

Do not reverse the sale because paper printing failed.

---

# 24. Kitchen Order Creation vs Physical Printing

The logical kitchen order must be created transactionally with consumption confirmation.

Physical printing happens after the database transaction commits.

Recommended flow:

```text id="dthpwu"
BEGIN

Confirm account items
Consume inventory
Create kitchen_order
Create print_job PENDING

COMMIT

Print worker attempts physical printing
```

Do not make a database transaction wait for a physical printer response.

---

# 25. Outbox-Like Behavior

The `print_jobs` table acts as a reliable outbox for printing.

Once the business transaction commits:

```text id="1khp12"
PENDING print job
```

exists persistently.

If the print service crashes, it can later continue processing pending jobs.

This is preferred over directly calling the printer synchronously from request handling without persistence.

---

# 26. Reprint

Authorized users may reprint historical documents.

Required use cases:

- Kitchen order
- Kitchen cancellation
- Account preview
- Payment receipt
- Day close

Reprint must use the historical print/document snapshot.

Do not rebuild old receipts from current product/customer/settings data when an immutable snapshot already exists.

---

# 27. Reprint Behavior

Reprinting creates a new print job referencing the same logical document.

Example:

```text id="s7mq1l"
Kitchen order:
K-00123

Original print job:
PRINTED

Reprint:
new print_job
```

The kitchen order itself is not duplicated.

Increment:

```text id="8wopem"
kitchen_orders.reprint_count
```

where applicable.

---

# 28. Reprint Label

Kitchen reprints should clearly indicate:

```text id="enw701"
REPRINT
```

to avoid accidental duplicate preparation.

Example:

```text id="qfq5ol"
*** REPRINT ***

K-00123
Mesa 5

2 x Churrasco
```

This is especially important for kitchen documents.

---

# 29. Kitchen Cancellation Reprint

Cancellation ticket reprints should also clearly indicate:

```text id="2oy7l3"
REPRINT - CANCELLATION
```

Do not make a reprinted cancellation look like a new cancellation event.

---

# 30. Account Receipt

An account receipt is the bill/check taken to the table before payment.

It is NOT a payment receipt.

It may show:

- Business/branch name
- Table
- Date/time
- Account items
- Additional accompaniments
- Quantities
- Item prices
- Discounts
- Subtotal
- Taxes
- Service percentage
- Service amount
- Total with service
- Total without service
- Optional customer
- Footer

This is an internal commercial receipt, not an electronic tax invoice.

---

# 31. Account Receipt and Service

Because service is optional/configurable, the account receipt should clearly show:

```text id="0jdmnb"
Subtotal:              $100,000

Service 10%:           $10,000

Total with service:    $110,000

Total without service: $100,000
```

If service is disabled:

```text id="l8p3j1"
Service should not be included in total
```

The specific service calculation rules belong to the split/service/payment module.

---

# 32. Account Receipt Is a Snapshot

When an account receipt is requested:

```text id="9gs4lt"
Build receipt snapshot
↓
Persist print job payload
↓
Print
```

If the account remains open and more items are added later, an old account receipt must still represent what was printed at that time.

A new print request generates a new snapshot.

---

# 33. Account Preview Reprint

If reprinting a specific previously generated account receipt, use the original snapshot.

If the user instead selects:

```text id="t02s6c"
Print current account
```

generate a new snapshot from the current account.

These are different actions.

---

# 34. Payment Receipt

A payment receipt is generated after successful payment.

It may represent:

- Full account payment
- One split payment
- Mixed payment methods

It must preserve the exact financial state at payment time.

Recommended content:

```text id="yx9e22"
Business
Branch
Receipt number
Date/time

Table
Customer optional

Items / split summary

Subtotal
Discounts
Taxes
Service
Total

Payments:
Cash       $40,000
Card       $30,000
QR         $20,000

Total paid $90,000
```

Detailed payment rules belong to the Payments module.

---

# 35. Split Payment Receipts

When an account is divided:

```text id="umzhls"
Split A
Split B
Split C
```

each split may generate its own payment receipt.

This supports the requirement that each person can take their own receipt.

Each payment receipt must identify the split/account context.

---

# 36. Receipt Number

Internal payment receipts should have a human-readable unique identifier.

Example:

```text id="atlo7t"
R-00001234
```

The system does not currently require DIAN fiscal numbering.

Do not model internal receipt numbers as electronic invoice numbers.

---

# 37. Receipt Historical Integrity

A historical payment receipt must not change if later:

- Product name changes
- Product price changes
- Branch logo changes
- Receipt footer changes
- Service default changes
- Customer data changes

Persist the printable snapshot.

---

# 38. Day Close Print

The system must support printing a day/cash-session close report.

The actual financial calculation belongs to the Cash module.

The printing module receives a finalized snapshot.

Example:

```text id="zr8s1l"
DAY CLOSE

Cash Register:
Caja Principal

Opened:
09:00

Closed:
23:15

Opening cash:
$200,000

Cash sales:
$800,000

QR sales:
$500,000

Card sales:
$700,000

Cash expenses:
-$100,000

Withdrawals:
-$200,000

Expected cash:
$700,000

Counted cash:
$695,000

Difference:
-$5,000
```

---

# 39. Day Close Snapshot

Day-close print payload must be immutable after the close is completed.

Reprinting must use the same historical close snapshot.

Do not recalculate a past close using current database state.

---

# 40. Thermal Printer Formatting

The printing layer should support thermal printer-friendly formatting.

Do not assume fixed desktop-paper dimensions.

Recommended capabilities:

- 58 mm
- 80 mm
- Configurable character width
- Text alignment
- Bold/emphasis
- Horizontal separators
- Quantity formatting
- Line wrapping
- Paper cut command where supported

---

# 41. Printer Paper Width

Printer configuration should contain paper width or printable column width.

Example:

```json id="n95i3d"
{
  "paper_width_mm": 80,
  "characters_per_line": 48
}
```

Formatting should adapt to printer configuration.

---

# 42. ESC/POS

Thermal printer implementation may use ESC/POS when supported by target hardware.

Do not expose ESC/POS commands to the domain/application layer.

Use a printer adapter.

Conceptually:

```text id="smr3g7"
Document Snapshot
↓
Receipt Renderer
↓
Printer Adapter
↓
ESC/POS
```

---

# 43. Document Renderer

Each document type should have its own renderer.

Examples:

```text id="5psqvs"
KitchenOrderRenderer
KitchenCancellationRenderer
AccountReceiptRenderer
PaymentReceiptRenderer
DayCloseRenderer
```

Do not scatter receipt formatting logic throughout unrelated services.

---

# 44. Render Input

Renderers should receive immutable document DTOs/snapshots.

They should not directly perform domain queries.

Preferred:

```text id="93p7v5"
Renderer(snapshot)
```

Avoid:

```text id="k1xemf"
Renderer(account_id)
→ performs many live DB queries
```

The application service should build the snapshot.

---

# 45. Print Job Payload

`print_jobs.payload JSONB` should contain the full data required to render or reproduce the document.

This supports:

- Reliable retries
- Reprints
- Historical accuracy
- Offline/local printer agents

---

# 46. Print Job Target

The current DDL identifies only `printer_type`.

Once a `printers` table is introduced, `print_jobs` should also reference:

```text id="5mqvvb"
printer_id
```

The selected printer must belong to the same branch.

---

# 47. Default Printer Resolution

Branch configuration should support default printers by document type.

Example:

```text id="n5v0xd"
KITCHEN_ORDER
→ Cocina Principal

ACCOUNT_RECEIPT
→ Caja Principal

PAYMENT_RECEIPT
→ Caja Principal

DAY_CLOSE
→ Caja Principal
```

Printer selection should be resolved before creating the print job.

---

# 48. Missing Printer

If no suitable active printer is configured:

- Business operation remains valid.
- Document snapshot remains available.
- Print job may remain failed/unroutable.
- User receives a clear operational error.

Do not fail a sale solely because printer configuration is missing.

---

# 49. Inactive Printer

Do not route new print jobs to inactive printers.

Historical jobs may continue referencing inactive printer records.

---

# 50. Printer Failover

Automatic printer failover is not required for the initial version.

Do not silently redirect a kitchen ticket to another printer unless explicit fallback configuration exists.

A future configuration may support:

```text id="pi1qj8"
Primary kitchen printer
Fallback kitchen printer
```

---

# 51. Print Retry

Authorized users or automated workers may retry failed jobs.

Retry behavior:

```text id="ynlqpc"
FAILED
↓
PENDING
↓
Attempt
```

Do not create another logical kitchen order or financial receipt merely to retry printing.

---

# 52. Automatic Retry

A limited automatic retry policy may be implemented.

Example:

```text id="ij4g0n"
Attempt 1
↓
Failure
↓
Attempt 2
↓
Failure
↓
Attempt 3
↓
FAILED
```

Exact retry timing belongs to infrastructure configuration.

Avoid infinite retry loops.

---

# 53. Print Job Idempotency

A print worker must avoid accidentally processing the same job concurrently.

Use a claim/lock mechanism.

Conceptually:

```text id="fn91p5"
PENDING job
↓
Worker claims job
↓
Attempt print
↓
PRINTED or FAILED
```

Multiple workers must not print the same pending job simultaneously.

---

# 54. Physical Printing Cannot Be Perfectly Exactly-Once

The application cannot always know with certainty whether a physical printer printed a document if the network connection fails after transmission.

Therefore the printing system must distinguish:

```text id="4hmwnl"
Business document exactly-once
```

from:

```text id="vs2sw3"
Physical paper exactly-once
```

The second cannot always be guaranteed.

This is why reprints must clearly display `REPRINT`.

---

# 55. Kitchen Printing Permission

Sending initial confirmed consumption to kitchen is part of normal order-taking workflow and may use:

```text id="n1tzr0"
kitchen.send
```

Reprinting should use a separate permission:

```text id="umzb2w"
kitchen.reprint
```

because reprints can cause operational confusion.

---

# 56. Account Printing Permission

Recommended permissions:

```text id="vp29xd"
receipts.account.print
receipts.account.reprint
```

---

# 57. Payment Receipt Permissions

Recommended:

```text id="a0c872"
receipts.payment.print
receipts.payment.reprint
```

---

# 58. Day Close Printing Permission

Recommended:

```text id="0llafr"
cash.print_close
cash.reprint_close
```

Exact naming must remain consistent with the centralized permission catalog.

---

# 59. Reprint Audit

Reprinting operationally sensitive documents should be audited.

At minimum audit:

- Kitchen ticket reprint
- Kitchen cancellation reprint
- Payment receipt reprint
- Day-close reprint

Record:

- User
- Document
- Branch
- Reason if required
- Timestamp

---

# 60. Reprint Reason

Kitchen and payment reprints may optionally require a reason.

Recommended for:

```text id="0wpdlv"
Kitchen reprint
Payment receipt reprint
Day-close reprint
```

Example:

```text id="chdud5"
Printer jam
Customer requested copy
Original receipt damaged
```

This is especially useful for auditability.

---

# 61. Print Audit vs Print Job

Do not confuse:

```text id="dwkowi"
print_jobs
```

with:

```text id="it7qty"
audit_logs
```

Print job records technical printing behavior.

Audit records user/business actions.

Example:

```text id="wt2i2e"
User requests reprint
→ audit_logs
→ new print_job
```

---

# 62. Kitchen Ticket Content

Recommended kitchen print layout:

```text id="o37m5e"
DON JUAN
KITCHEN ORDER

K-00125

MESA 5
SALON PRINCIPAL

MESERO: Juan
17:21

----------------------------

2 x CHURRASCO DE RES
    Extra antipasto
    Nota: Uno bien asado

1 x LOMO DE CERDO
    Nota: Sin queso

----------------------------

ACCOUNT: ABC123
```

Do not show product cost, margin or financial profitability on kitchen tickets.

---

# 63. Kitchen Additional Display

Selected additional accompaniments should be clearly visible.

Example:

```text id="o6px27"
1 x CHURRASCO

+ EXTRA ANTIPASTO
+ EXTRA AREPA
```

Free vs paid status is generally irrelevant to kitchen and does not need to be shown unless operationally useful.

Kitchen cares about what to prepare.

---

# 64. Included Accompaniments

Base included accompaniments do not necessarily need to be printed separately if they are standard parts of the dish.

Only print them when the kitchen operationally needs that detail.

Initial implementation may print:

- Product name
- Selected additional accompaniments
- Notes

Do not automatically dump the full internal recipe onto kitchen tickets.

---

# 65. Recipe Privacy in Kitchen Tickets

Inventory recipe details such as:

```text id="7pccua"
10 G onion
10 G pepper
350 G beef
```

are internal costing/inventory data.

They should not automatically appear on kitchen order tickets.

The kitchen ticket represents requested menu items, additions and notes.

---

# 66. Account Receipt Content

Recommended account receipt:

```text id="f54z6d"
CHURRASQUERÍA DON JUAN

Mesa 5
06/09/2026 17:25

----------------------------

2 x Churrasco        $130,000
1 x Gaseosa            $8,000
1 x Extra antipasto    $2,000

----------------------------

Subtotal             $140,000
Descuento                  $0
Impuestos                   $0

Servicio 10%          $14,000

TOTAL CON SERVICIO   $154,000
TOTAL SIN SERVICIO   $140,000

----------------------------

Gracias por su visita
```

Exact tax formatting depends on configured tax behavior.

---

# 67. Payment Receipt Content

Recommended:

```text id="trfv2m"
CHURRASQUERÍA DON JUAN

COMPROBANTE DE PAGO
R-000123

Mesa 5
06/09/2026 17:40

----------------------------

Subtotal             $140,000
Servicio              $14,000
Total                 $154,000

PAGOS

Efectivo               $54,000
Tarjeta               $100,000

TOTAL PAGADO          $154,000

----------------------------

Gracias por su visita
```

---

# 68. Internal Receipt Disclaimer

Because this system does not implement electronic invoicing, receipt templates should support an optional configurable text such as:

```text id="tywkqa"
Comprobante interno de pago
```

Do not falsely label it as a DIAN electronic invoice.

---

# 69. Branch Receipt Settings

Branch settings may include:

- Header name
- Logo behavior
- Address
- Phone
- Footer
- Internal receipt disclaimer
- Paper width
- Default printers

Use relational printer references where appropriate rather than hiding all printer configuration in JSONB.

---

# 70. Offline Kitchen Printing

When the waiter is offline but connected to the restaurant local network, local printing may still be possible depending on architecture.

The design should support two potential paths:

```text id="2t9plv"
Offline client
↓
Local print agent
↓
Kitchen printer
```

and:

```text id="a2r9ab"
Client
↓
Server
↓
Print job
↓
Print agent
```

Do not assume internet connectivity is required to physically print inside the restaurant.

---

# 71. Offline Kitchen Snapshot

If consumption is confirmed locally while offline, the client must create a stable local kitchen snapshot with:

- Operation ID
- Account ID
- Account item IDs
- Table
- User
- Items
- Additional accompaniments
- Notes
- Local timestamp

This allows local kitchen printing before server synchronization if supported.

---

# 72. Offline Duplicate Prevention

If a kitchen ticket was already printed locally while offline and later synchronizes to the server, the server must not cause an automatic second physical print without awareness.

The sync payload should preserve:

```text id="d3e8b2"
printed_locally = true
local_print_reference
```

or equivalent operational metadata.

The Offline module will define final reconciliation behavior.

---

# 73. Offline Reprint

Reprints performed offline should also receive globally unique operation IDs.

After synchronization, the audit trail must preserve the fact that the reprint occurred.

---

# 74. Print Jobs and Branch Isolation

A print job must reference a printer belonging to the same branch.

Invalid:

```text id="gb6322"
Account:
Branch A

Printer:
Branch B
```

The backend must reject this.

---

# 75. Print Job Security

A client must not be able to arbitrarily print any payload on any configured printer without permission.

The backend must validate:

- User
- Branch
- Permission
- Document type
- Reference ownership
- Printer ownership

Do not expose a generic unrestricted:

```text id="rm93ev"
POST /print
{
  "text": "anything"
}
```

endpoint to normal users.

---

# 76. Print Preview

The frontend may offer a preview before printing account/payment documents.

Preview should be rendered from the same structured snapshot used for actual printing when possible.

This reduces inconsistencies between preview and paper output.

---

# 77. Kitchen Print Preview

Kitchen tickets normally do not require confirmation preview because speed is more important.

When consumption is confirmed, kitchen print should be automatically queued according to configuration.

---

# 78. Printer Health

The system may track basic printer-agent health.

Potential states:

```text id="pf81on"
ONLINE
OFFLINE
UNKNOWN
```

This is operational metadata, not a business transaction.

It may be used to warn:

```text id="ifzp0a"
Kitchen printer offline
```

before or after order confirmation.

---

# 79. Printer Health Does Not Block Sale

Even if printer status is:

```text id="lo8t8r"
OFFLINE
```

valid account consumption should still be confirmable.

The user must receive a warning that manual kitchen communication may be required.

---

# 80. Kitchen History

Authorized users should be able to view recent kitchen tickets.

At minimum display:

- Ticket number
- Table
- User
- Timestamp
- Items
- Print status
- Reprint count
- Cancellation relationship where applicable

This assists troubleshooting.

---

# 81. Print History

Authorized users should be able to inspect print jobs.

Useful fields:

```text id="k956h9"
Document type
Reference
Printer
Status
Attempts
Created at
Printed at
Error
```

---

# 82. Backend Invariants

The backend must enforce all of the following:

1. Kitchen orders are operational snapshots, not financial orders.
2. An account may generate multiple kitchen tickets over time.
3. Kitchen orders are immutable.
4. Kitchen cancellations create new documents instead of editing previous tickets.
5. Print failure must not reverse a valid sale.
6. Print jobs must be persisted before asynchronous physical printing.
7. Print jobs belong to the same branch as their source document.
8. Reprints create new print jobs.
9. Reprints do not create duplicate logical sale/kitchen entities.
10. Kitchen reprints must be clearly distinguishable from original prints.
11. Historical document snapshots must not depend on current mutable catalog/settings.
12. Payment receipts represent successful payment state.
13. Day-close receipts represent finalized cash-session state.
14. Physical printer configuration must be separated from domain entities.
15. Client users must not send unrestricted raw printer payloads.
16. Print job retries must not duplicate business transactions.
17. Offline local prints must be reconciled without unintentional duplicate printing.
18. Costs and profitability must never appear on kitchen tickets unless explicitly requested.
19. Kitchen tickets must not expose internal ingredient-level recipe details by default.
20. Printer availability must not block otherwise valid restaurant operations.

---

# 83. Suggested Permissions

Recommended permissions:

```text id="ozvd20"
kitchen.view
kitchen.send
kitchen.reprint

printing.view_jobs
printing.retry
printing.manage_printers

receipts.account.print
receipts.account.reprint

receipts.payment.print
receipts.payment.reprint

cash.print_close
cash.reprint_close
```

Printer administration should be restricted to administrative users.

---

# 84. Audit Requirements

Audit at minimum:

- Kitchen ticket created indirectly through sale confirmation where relevant
- Kitchen cancellation requested
- Kitchen reprint requested
- Account receipt reprint
- Payment receipt reprint
- Day-close reprint
- Printer configuration created
- Printer configuration changed
- Printer activated/deactivated

Technical print attempts belong primarily in `print_jobs`, not in audit logs.

---

# 85. Source of Truth

Authoritative kitchen document:

```text id="5q88jq"
kitchen_orders
```

Authoritative print queue/history:

```text id="pw3c55"
print_jobs
```

Authoritative printer configuration:

```text id="on8u34"
printers
```

Authoritative sale information:

```text id="jy78s3"
accounts
account_items
```

Print payloads are historical snapshots.

Do not recalculate old printable documents from current mutable state unless explicitly generating a new current-state print.

---

# 86. Main Use Cases

The module must support at minimum:

```text id="i5r4io"
Automatically create kitchen ticket from confirmed consumption
Automatically queue kitchen print
Print kitchen cancellation
View kitchen ticket history
Reprint kitchen ticket
Retry failed kitchen print

Print current account receipt
Reprint previous account receipt

Print payment receipt
Reprint payment receipt

Print day-close receipt
Reprint day-close receipt

Configure printers
Activate/deactivate printers
Assign default printers
View print jobs
Retry failed print jobs
```

---

# 87. Integration With Order Taking

Order-taking flow:

```text id="a1hzo7"
Waiter confirms consumption
↓
Account items persisted
↓
Inventory consumed
↓
Kitchen snapshot created
↓
Print job PENDING
↓
Database transaction commits
↓
Physical printing attempted
```

The account module owns the confirmed consumption.

The kitchen module owns operational kitchen communication.

---

# 88. Integration With Account Item Cancellation

When confirmed consumption is voided:

```text id="985g6t"
Account item VOID
↓
Inventory compensation
↓
Kitchen cancellation snapshot
↓
Print job
```

Do not erase the original kitchen order.

---

# 89. Integration With Service and Payments

The Account Receipt renderer consumes current account billing information.

The Payment Receipt renderer consumes finalized payment/split information.

The printing module does not own:

- Service calculation
- Discount calculation
- Split allocation
- Payment settlement

It only renders the authoritative snapshot supplied by those modules.

---

# 90. Integration With Cash

Day-close printing consumes a finalized cash-session close snapshot.

The Cash module owns:

- Expected cash
- Counted cash
- Difference
- Sales aggregation
- Cash movements

The printing module renders the result.

---

# 91. Non-Goals

This module intentionally does not implement:

- Kitchen preparation statuses
- Kitchen display system
- Recipe production workflow
- Inventory costing
- Account payment logic
- Account splitting
- Cash calculation
- Electronic invoicing
- DIAN integration
- Automatic printer failover
- Advanced printer monitoring
- Ingredient-level kitchen production instructions

These concerns belong elsewhere or are excluded from current scope.

---

# 92. Required Schema Adjustments

The current DDL requires a few additions to fully support this specification.

Implement them through migrations.

## 92.1 Add Printers Table

Recommended structure:

```sql id="o7w64l"
CREATE TYPE printer_connection_type AS ENUM (
    'NETWORK',
    'LOCAL_AGENT',
    'SYSTEM'
);

CREATE TABLE printers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id UUID NOT NULL
        REFERENCES branches(id),

    name VARCHAR(150) NOT NULL,

    printer_type printer_type NOT NULL,

    connection_type printer_connection_type NOT NULL,

    configuration JSONB NOT NULL DEFAULT '{}'::JSONB,

    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (branch_id, name)
);
```

---

# 93. Reference Printer From Print Jobs

Add:

```sql id="6phyni"
ALTER TABLE print_jobs
ADD COLUMN printer_id UUID
REFERENCES printers(id);
```

For new normal print jobs, `printer_id` should be resolved before processing.

---

# 94. Add Kitchen Cancellation Document Type

Extend:

```text id="sehusb"
print_document_type
```

with:

```text id="ytj4mo"
KITCHEN_CANCELLATION
```

---

# 95. Kitchen Order Type

Recommended addition to `kitchen_orders`:

```text id="3ralur"
order_type
```

Values:

```text id="on0txv"
ORDER
CANCELLATION
```

Alternatively, separate cancellation relation metadata may be used.

A cancellation should optionally reference the original kitchen order or account item it compensates.

---

# 96. Reprint Metadata

Consider adding to `print_jobs`:

```text id="ct0s38"
is_reprint BOOLEAN NOT NULL DEFAULT FALSE
original_print_job_id UUID NULL
reprint_reason TEXT NULL
requested_by_user_id UUID NULL
```

This improves operational traceability.

---

# 97. Printed Account Receipt Persistence

The current schema does not define a separate immutable document entity for account/payment/day-close receipts.

For a first implementation, `print_jobs.payload` can serve as the immutable printed snapshot.

If document lifecycle becomes more complex later, introduce dedicated receipt/document tables.

Do not add unnecessary complexity now.

---

# 98. Critical Implementation Principle

The printing system must be based on persistent document snapshots and print jobs.

Correct flow:

```text id="u5y8nb"
Business operation
↓
Immutable document snapshot
↓
Persist print job
↓
Commit
↓
Physical printing
```

Not:

```text id="782ikq"
Business operation
↓
Direct printer call
↓
Hope it worked
```

The three critical relationships are:

```text id="3q4wmx"
CONFIRMED CONSUMPTION
↓
Kitchen Snapshot
↓
Print Job
↓
Kitchen Printer
```

```text id="0xaj8j"
CURRENT ACCOUNT
↓
Account Receipt Snapshot
↓
Print Job
↓
Account Printer
```

```text id="7h2s3r"
FINALIZED PAYMENT / CASH CLOSE
↓
Historical Receipt Snapshot
↓
Print Job
↓
Receipt Printer
```

All implementation decisions must preserve:

- Historical integrity
- Print retryability
- Reprint traceability
- Branch isolation
- Failure tolerance
- Offline compatibility
- Separation between business transactions and physical printer behavior