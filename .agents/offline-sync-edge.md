# Offline, Edge Server and Synchronization Module

> **Nota de vigencia (2026-09-08).** La topología, la autoridad de datos y el
> alcance de esta arquitectura quedaron formalizados en
> `.agents/architecture/local-first-edge-replication.md`, que es ahora el
> documento autoritativo para esos temas. Este documento sigue vigente como
> referencia técnica del protocolo de sincronización operación por operación
> (idempotencia, `operation_id`, outbox, cursores, PUSH/PULL, tipos de
> conflicto, niveles de capacidad offline). Las secciones 84-87 (cambios de
> catálogo iniciados desde la nube) quedan **reemplazadas**: no existe
> catálogo, receta, acompañante ni precio global administrado por la nube;
> cada sede es la única autoridad de su catálogo y la nube no lo edita
> remotamente. Ver ese documento para el alcance completo y sus límites
> explícitos.

## Purpose

This document defines the architecture, domain rules, synchronization behavior and conflict policies required for reliable restaurant operation when Internet connectivity is unavailable or unstable.

This module covers:

- Edge server architecture
- Local PostgreSQL
- Cloud PostgreSQL
- Local API
- Cloud API
- PWA offline behavior
- IndexedDB local cache
- Device registration
- Operation-based synchronization
- PUSH synchronization
- PULL synchronization
- Idempotency
- UUID generation
- Entity versioning
- Conflict detection
- Conflict resolution
- Offline sales
- Offline accounts
- Offline inventory
- Offline purchases
- Offline payments
- Offline cash behavior
- Offline printing
- Catalog synchronization
- Edge-to-cloud synchronization
- Connectivity states
- Split-brain prevention
- Recovery behavior

This document must be treated as authoritative context when implementing offline behavior, synchronization or deployment topology.

Do not implement row-level database replication as the primary application synchronization mechanism.

Do not allow multiple independent authoritative writers for the same branch.

---

# 1. Core Architecture

The system uses an Edge-first architecture.

Each restaurant branch should have a local Edge Server.

Normal operational flow:

```text
Client Device
↓
Local Network
↓
Edge API
↓
Edge PostgreSQL
```

The Edge Server synchronizes with the cloud:

```text
Edge PostgreSQL
↓
Sync Worker
↓
Cloud API
↓
Cloud PostgreSQL
```

The restaurant must remain operational when Internet connectivity is lost.

---

# 2. Infrastructure Topology

Recommended architecture:

```text
                     CLOUD
         ┌────────────────────────┐
         │ Cloud API              │
         │ PostgreSQL             │
         │ Sync Processor         │
         │ Backup Worker          │
         │ Object Storage         │
         └────────────▲───────────┘
                      │
                      │ HTTPS
                      │
         ┌────────────┴───────────┐
         │      EDGE SERVER       │
         │                        │
         │ Reverse Proxy          │
         │ Frontend PWA           │
         │ Backend API            │
         │ PostgreSQL             │
         │ Sync Worker            │
         │ Print Worker           │
         └────────────┬───────────┘
                      │
                  Local LAN
          ┌───────────┼───────────┐
          │           │           │
       Tablet       PC Caja     Phone
          │
       IndexedDB

                      │
                Local Printers
```

---

# 3. Edge Server

Each branch has one primary Edge Server.

The Edge Server runs:

- Backend API
- PostgreSQL
- Frontend static assets/PWA
- Sync worker
- Print worker
- Reverse proxy

Recommended deployment:

```text
Docker Compose
```

Do not require Kubernetes.

---

# 4. Edge Server Responsibility

The Edge Server is the authoritative operational writer for its branch while it is active.

The branch's operational devices should write to the Edge Server.

Examples:

```text
Open account
Add account items
Register payment
Create expense
Adjust inventory
Open cash session
```

are executed against Edge.

The cloud receives synchronized operations.

---

# 5. Cloud Responsibility

The cloud provides:

- Centralized persistence
- Multi-branch consolidation
- Remote administration
- Backups
- Central reporting
- Historical data
- Sync processing

Cloud PostgreSQL is the consolidated source of truth.

However, the branch Edge Server is the primary operational writer for branch activity.

---

# 6. Edge-First Principle

Within a branch:

```text
Edge
=
Primary Operational Authority
```

Cloud:

```text
Cloud
=
Central Consolidated Authority
```

The cloud may temporarily lag behind Edge.

This is acceptable.

The architecture uses eventual consistency between Edge and Cloud.

---

# 7. Do Not Use Multi-Master PostgreSQL Replication

Do not implement application synchronization as:

```text
Edge PostgreSQL
↔
Cloud PostgreSQL
```

using unrestricted multi-master replication.

This creates unacceptable conflict and split-brain complexity.

Synchronize domain operations through application APIs.

---

# 8. Operation-Based Synchronization

Synchronization sends business operations.

Examples:

```text
OPEN_ACCOUNT
ADD_ACCOUNT_ITEMS
VOID_ACCOUNT_ITEM
MOVE_ACCOUNT
REGISTER_PAYMENT
CREATE_PURCHASE
CREATE_EXPENSE
ADJUST_INVENTORY
CLOCK_IN
CLOCK_OUT
```

Do not synchronize arbitrary SQL statements.

Do not synchronize entire mutable entities using blind replacement.

---

# 9. Command-Based APIs

Prefer domain commands.

Good:

```text
POST /accounts/{id}/items
POST /accounts/{id}/void-item
POST /accounts/{id}/move
POST /payments
POST /inventory/{id}/adjust
```

Avoid synchronization based on:

```text
PUT /account/{id}
{
    "entire_current_state": ...
}
```

Blind replacement creates lost updates.

---

# 10. Globally Unique IDs

Entities that may be created offline must use globally unique identifiers.

Prefer:

```text
UUIDv7
```

Examples:

```text
account_id
account_item_id
payment_id
purchase_id
expense_id
shift_id
operation_id
```

Do not depend on PostgreSQL auto-increment IDs.

---

# 11. Operation ID

Every synchronizable domain command must contain:

```text
operation_id
```

This ID uniquely identifies the business operation.

Example:

```json
{
  "operation_id": "uuid",
  "operation_type": "ADD_ACCOUNT_ITEMS",
  "entity_id": "uuid"
}
```

Operation IDs must never be reused for different operations.

---

# 12. Idempotency

Synchronization must be idempotent.

If the server receives the same `operation_id` twice:

```text
First request
↓
Process operation
↓
Persist result
```

Second request:

```text
Same operation_id
↓
Do not process again
↓
Return previous result
```

This prevents duplicate:

- Payments
- Sales
- Inventory movement
- Purchases
- Cash movements
- Expenses

---

# 13. Example Payment Retry

Client sends:

```text
REGISTER_PAYMENT
operation_id = ABC
amount = 65000
```

Server processes it successfully.

Network response is lost.

Client retries:

```text
operation_id = ABC
```

The server must not create another payment.

Return the original payment result.

---

# 14. Sync Device

Every operational device should be registered.

Examples:

```text
Tablet Mesero 1
Tablet Mesero 2
PC Caja
Phone Admin
```

Device record should contain:

- ID
- Branch
- Stable device identifier
- Name
- Type
- Active/inactive state
- Last sync timestamp
- Created timestamp

---

# 15. Device Identity

Every offline operation should preserve:

```text
device_id
```

This enables:

- Troubleshooting
- Audit
- Conflict resolution
- Device deactivation
- Sync monitoring

---

# 16. Device Deactivation

Inactive devices:

- Cannot submit new synchronization operations.
- May retain local data.
- Must be rejected by server synchronization.
- Remain visible in historical sync records.

---

# 17. Sync Operation

A sync operation represents one operation sent by a device.

It contains at least:

- Operation ID
- Device
- Branch
- Entity type
- Entity ID
- Operation type
- Payload
- Status
- Error
- Created timestamp
- Processed timestamp

---

# 18. Sync Status

Required statuses:

```text
PENDING
PROCESSING
PROCESSED
FAILED
CONFLICT
```

`CONFLICT` must be distinct from `FAILED`.

---

# 19. FAILED vs CONFLICT

Example FAILED:

```text
Database unavailable
Invalid internal dependency
Unexpected server error
```

Example CONFLICT:

```text
Table already has another OPEN account
Cash session already closed
Account already paid
Catalog version incompatible
```

These require different UX.

---

# 20. PUSH Synchronization

PUSH sends local operations to the server.

Flow:

```text
Client/Edge
↓
Pending Operations
↓
PUSH
↓
Server Validation
↓
Apply Operations
↓
Return Results
```

Operations may be submitted in batches.

---

# 21. PULL Synchronization

PULL downloads changes made elsewhere.

Flow:

```text
Client
↓
Last Sync Cursor
↓
Server
↓
Changes after cursor
↓
Apply locally
↓
Store new cursor
```

The client should not download the entire database on every sync.

---

# 22. Sync Cursor

Use a monotonically ordered server-side change cursor.

Conceptually:

```text
last_cursor = 12050
```

Client asks:

```text
changes after 12050
```

Server returns:

```text
12051
12052
12053

next_cursor = 12053
```

The exact implementation may use:

- Sequence number
- Change-log ID
- Ordered event ID

Do not use timestamps alone as the synchronization cursor.

---

# 23. Change Feed

The server should expose a branch-scoped change feed for local clients.

Changes may include:

```text
PRODUCT_UPDATED
PRODUCT_DEACTIVATED
TABLE_UPDATED
ACCOUNT_UPDATED
ACCOUNT_ITEM_ADDED
PAYMENT_CREATED
INVENTORY_UPDATED
```

This feed supports device refresh without full reload.

---

# 24. Client Local Database

The PWA uses IndexedDB for local persistence.

IndexedDB may cache:

- Active products
- Product compositions
- Accompaniments
- Additional options
- Taxes
- Dining areas
- Tables
- Relevant open accounts
- Permissions
- Branch settings
- Pending device operations

IndexedDB is not the shared branch database.

---

# 25. Shared Offline State

Shared branch state lives on Edge PostgreSQL.

Multiple devices operating inside the restaurant communicate through Edge.

Example:

```text
Tablet A
↓
Edge
↑
Tablet B
```

This allows both devices to see the same:

- Tables
- Accounts
- Items
- Payments
- Inventory

even when Internet is unavailable.

---

# 26. IndexedDB Role

IndexedDB provides device-level resilience.

Use it when:

```text
device temporarily loses connection to Edge
```

It is not a replacement for Edge PostgreSQL.

---

# 27. Connectivity States

Frontend should explicitly model connectivity.

Required states:

```text
ONLINE
LOCAL_ONLY
DEVICE_ONLY
```

Optional future state:

```text
CLOUD_FALLBACK
```

---

# 28. ONLINE

Meaning:

```text
Edge reachable
Cloud reachable by Edge
```

Normal operation.

All supported features available.

---

# 29. LOCAL_ONLY

Meaning:

```text
Edge reachable
Cloud unavailable
```

This is a fully supported operational state.

Restaurant operation continues normally.

Examples:

- Sales work
- Tables work
- Kitchen works
- Inventory works
- Cash works
- Printing works

Synchronization accumulates pending cloud operations.

---

# 30. DEVICE_ONLY

Meaning:

```text
Edge unreachable
Cloud not being used as active branch writer
```

The device operates from IndexedDB.

This is emergency isolated mode.

Capabilities must be restricted.

---

# 31. Device-Only Warning

Frontend must clearly show:

```text
LOCAL SERVER UNAVAILABLE

Device is operating in isolated mode.
Some operations are restricted.
```

Users must not believe they are sharing live state with other devices.

---

# 32. Do Not Automatically Fail Over Writes to Cloud

If Edge becomes unavailable but Internet remains available:

Do not automatically redirect branch writes to Cloud in the initial version.

This could create:

```text
Edge operations
and
Cloud operations
```

being accepted independently.

That creates split-brain.

---

# 33. Split-Brain Prevention

For a branch, only one operational writer topology should be active.

Normal:

```text
Clients
↓
Edge
↓
Cloud
```

Do not allow:

```text
Some clients → Edge
Some clients → Cloud
```

simultaneously without explicit leader/failover protocol.

Initial system avoids this complexity.

---

# 34. Offline Capability Levels

Operations should be classified.

## Level A: Safe Offline

Examples:

```text
View catalog
View cached tables
Create simple customer
Add account notes
Prepare account items
Local kitchen printing
```

## Level B: Offline With Reconciliation

Examples:

```text
Open account
Add account items
Move account
Clock in/out
Create purchase
```

## Level C: Financially Sensitive

Examples:

```text
Register payment
Cash expense
Cash purchase
Inventory physical count
```

## Level D: Initially Online/Edge Required

Examples:

```text
Close cash session
Employee payment
Major administrative changes
```

---

# 35. Edge Offline vs Device Offline

Do not confuse:

```text
Cloud offline
```

with:

```text
Edge offline
```

If cloud is offline but Edge works:

```text
Restaurant operates normally.
```

If Edge is offline:

```text
Shared branch state is unavailable.
```

This is much more restrictive.

---

# 36. Account Synchronization

Accounts are synchronized using operations.

Examples:

```text
OPEN_ACCOUNT
ADD_ACCOUNT_ITEMS
VOID_ACCOUNT_ITEM
MOVE_ACCOUNT
VOID_ACCOUNT
```

Do not synchronize entire account replacements.

---

# 37. Account Version

Accounts should have:

```text
version BIGINT
```

Each meaningful mutation increments version.

A client may submit:

```text
expected_version
```

This helps detect stale operations.

---

# 38. Version Conflict

Example:

Client loaded:

```text
version = 14
```

Server currently:

```text
version = 16
```

Operation:

```text
MOVE_ACCOUNT
```

may require conflict.

Operation:

```text
ADD_ACCOUNT_ITEMS
```

may still be safely applicable depending on current state.

Version mismatch does not always imply automatic rejection.

Conflict policy depends on operation type.

---

# 39. Additive Operations

Operations that are naturally additive are easier to reconcile.

Examples:

```text
ADD_ACCOUNT_ITEMS
ADD_NOTE
CREATE_PAYMENT
ADD_INVENTORY_DELTA
```

These should be preferred over state replacement.

---

# 40. Destructive Operations

Operations that replace or remove state require stricter checks.

Examples:

```text
VOID_ACCOUNT
REPLACE_SPLIT_CONFIGURATION
SET_PHYSICAL_STOCK
CHANGE_PRODUCT_RECIPE
```

These require version/conflict validation.

---

# 41. Open Account Conflict

Scenario:

```text
Device A offline:
OPEN_ACCOUNT Mesa 5

Device B:
OPEN_ACCOUNT Mesa 5
```

Server invariant:

```text
One OPEN account per table
```

When Device A syncs:

```text
CONFLICT
```

Do not create a second open account.

---

# 42. Open Account Conflict Resolution

Preserve the offline account and its pending consumption.

Potential manual resolution:

```text
Move offline account to another table
Merge pending items into authoritative account
Cancel offline account
```

Do not discard customer consumption automatically.

---

# 43. Adding Items Concurrently

Scenario:

```text
Device A:
+ Soda

Device B:
+ Chorizo
```

Both operations may succeed.

Final account:

```text
Soda
Chorizo
```

Do not overwrite one with the other.

---

# 44. Paid Account Conflict

If an offline operation tries to add items to an account that is already:

```text
PAID
```

the server must reject it as conflict.

Do not reopen the account automatically.

---

# 45. Catalog Cache

Offline clients need a catalog snapshot.

At minimum:

- Product ID
- Product name
- Sale price
- Product active state
- Product composition
- Accompaniment definitions
- Additional configurations
- Taxes
- Relevant inventory units

---

# 46. Catalog Version

Catalog snapshots should carry version metadata.

Potentially:

```text
catalog_version
```

or per-entity:

```text
updated_at
version
```

This allows server to understand whether an offline sale used stale catalog data.

---

# 47. Offline Sale Price

If a product was sold offline using a previously synchronized valid price, preserve the price offered to the customer.

Example:

Offline device:

```text
Churrasco = 65000
```

Cloud/current catalog later becomes:

```text
70000
```

Offline sale may still synchronize as:

```text
65000
```

provided the server can verify it came from a valid trusted catalog snapshot.

---

# 48. Do Not Trust Arbitrary Offline Price

The client must not simply submit:

```text
price = anything
```

The sync payload should preserve:

- Product ID
- Price snapshot
- Catalog/entity version used
- Device identity
- Operation ID

Server validates the snapshot context.

---

# 49. Offline Recipe Snapshot

If a product recipe changes while a device is offline, a sale should preserve the recipe snapshot actually used during the offline transaction.

Example:

Offline snapshot:

```text
Beef 350 G
```

New catalog:

```text
Beef 400 G
```

Offline sale uses:

```text
350 G
```

historically.

Do not retroactively consume 400 G.

---

# 50. Offline Inventory Consumption

Device may calculate provisional inventory consumption locally.

Authoritative server/Edge processing must persist immutable movements.

For Edge-first branch operation, Edge applies the inventory mutation immediately.

Cloud later receives synchronized operations.

---

# 51. Inventory Delta Synchronization

Prefer operations such as:

```text
CONSUME 350 G
ADD 100 G
REMOVE 50 G
```

Do not synchronize:

```text
SET stock = 4650
```

unless the operation explicitly represents a physical count.

---

# 52. Physical Count Conflict

Physical inventory counts are absolute observations.

Example:

Device thinks:

```text
stock = 100
```

Physical count:

```text
90
```

Server currently:

```text
80
```

Do not simply set:

```text
stock = 90
```

Mark conflict and require reconciliation.

---

# 53. Purchase Offline

A purchase may be created while Edge is disconnected from Cloud.

Edge applies purchase normally:

```text
Purchase
↓
Inventory
↓
Weighted Average Cost
↓
Kardex
↓
Product Cost
```

Cloud later receives the purchase domain operation.

---

# 54. Device-Only Purchase

If Edge itself is unavailable, device-only purchase entry may be stored locally as pending.

Do not authoritatively update shared branch inventory until Edge accepts the operation.

---

# 55. Payment Offline

Payments are financially sensitive.

If Edge is available but Cloud is not:

```text
Payments work normally.
```

Edge is authoritative.

If Edge is unavailable and device is isolated:

Payment support should be restricted.

Initial recommended behavior:

```text
Do not finalize payment in DEVICE_ONLY mode.
```

unless explicitly implemented later with stronger reconciliation rules.

---

# 56. Cash Session Offline

If Edge is available:

Cash sessions work without Internet.

If Edge is unavailable:

Do not allow final cash-session close.

---

# 57. Cash Close

Final:

```text
CLOSE_CASH_SESSION
```

requires authoritative Edge state.

It must include all branch cash operations known to Edge.

Do not finalize close using only device-local IndexedDB state.

---

# 58. Employee Payment

Employee payments are financially sensitive.

Initial behavior:

```text
Require Edge connectivity.
```

Cloud connectivity is not required.

---

# 59. Offline Clock-In and Clock-Out

Clock-in/out may be queued locally if Edge is unavailable.

Server later validates:

- Employee
- Shift state
- Overlapping shifts
- Timestamps
- Rate coverage

Server calculates authoritative pay.

---

# 60. Printing Architecture

Printing is local to Edge when possible.

Flow:

```text
Business Operation
↓
Edge PostgreSQL
↓
Print Job
↓
Print Worker
↓
Local Printer
```

Internet is not required.

---

# 61. Local Print During Cloud Outage

If:

```text
Cloud unavailable
Edge available
```

printing continues normally.

This is a core requirement.

---

# 62. Device-Only Printing

If Edge is unavailable but device can reach a local print agent directly, local emergency printing may be supported.

If implemented, preserve:

- Operation ID
- Local print ID
- Printed locally flag

to prevent duplicate printing later.

---

# 63. Duplicate Offline Print Prevention

When a locally printed offline ticket later synchronizes:

Do not automatically print it again.

Sync metadata should preserve:

```text
printed_locally
local_print_reference
```

---

# 64. Sync Order Dependencies

Some operations depend on previous operations.

Example:

```text
1 OPEN_ACCOUNT
2 ADD_ACCOUNT_ITEMS
3 REGISTER_PAYMENT
```

Payment cannot be processed before account exists.

Sync processor must respect explicit dependencies or entity causality.

---

# 65. Operation Dependencies

Recommended sync payload may contain:

```text
depends_on_operation_ids
```

or rely on entity version/causal ordering.

Do not assume arbitrary batch order is always sufficient.

---

# 66. Per-Entity Ordering

Operations affecting the same aggregate should preserve order.

Example:

```text
Account ABC

OPEN
ADD ITEMS
VOID ITEM
PAY
```

Do not process `PAY` before `ADD ITEMS`.

---

# 67. Independent Operations

Operations on unrelated entities may be processed independently.

Example:

```text
Account A
Purchase B
Employee Shift C
```

They do not require one global total ordering.

---

# 68. Retry Policy

Transient FAILED operations may be retried automatically.

Examples:

```text
Network timeout
Temporary service unavailable
```

Do not automatically retry logical conflicts indefinitely.

`CONFLICT` requires business-aware handling.

---

# 69. Backoff

Automatic retries should use bounded backoff.

Avoid:

```text
retry every millisecond forever
```

Use reasonable delay and maximum retry behavior.

---

# 70. Sync Batch

Operations may be sent in batches.

Example:

```json
{
  "device_id": "uuid",
  "operations": [
    {},
    {},
    {}
  ]
}
```

Each operation must receive its own result.

One failed operation should not necessarily reject unrelated operations in the same batch.

---

# 71. Sync Result

Recommended response:

```json
{
  "results": [
    {
      "operation_id": "uuid1",
      "status": "PROCESSED"
    },
    {
      "operation_id": "uuid2",
      "status": "CONFLICT",
      "conflict_type": "TABLE_ALREADY_OCCUPIED"
    }
  ]
}
```

---

# 72. Conflict Types

Use machine-readable conflict types.

Examples:

```text
TABLE_ALREADY_OCCUPIED
ACCOUNT_ALREADY_PAID
ACCOUNT_VERSION_MISMATCH
CASH_SESSION_CLOSED
INVENTORY_COUNT_STALE
CATALOG_VERSION_CONFLICT
PAYMENT_ALREADY_COMPLETED
SHIFT_ALREADY_CLOSED
```

Do not rely only on free-form error text.

---

# 73. Conflict Storage

Conflicted operations must remain stored.

Do not discard them.

Preserve:

- Operation
- Payload
- Device
- User
- Branch
- Conflict reason
- Server state reference
- Resolution status

---

# 74. Conflict Resolution

Resolution may result in:

```text
RETRY_WITH_NEW_CONTEXT
MERGED
MOVED
CANCELLED_BY_USER
SUPERSEDED
```

Do not delete original conflict history.

---

# 75. Sync Authorization

Every synchronized operation must be revalidated by server.

Validate:

- Device active
- User active
- Branch access
- Current permissions
- Domain invariants

Do not trust offline permission snapshot as final authorization.

---

# 76. Offline Permission Snapshot

Clients cache effective permissions for UX while offline.

Example:

```text
sales.add_items
tables.view
```

This enables local UI.

But synchronization performs current authorization again.

---

# 77. Permission Revocation During Offline Period

Example:

User had:

```text
inventory.adjust
```

while device went offline.

Permission later revoked.

Offline adjustment syncs afterward.

Server may reject:

```text
FORBIDDEN
```

Do not assume historical local permission remains permanently valid.

---

# 78. Branch Isolation

All sync operations are branch-scoped.

Server must validate that referenced entities belong to the branch.

A device registered to Branch A must not synchronize operational writes to Branch B unless explicitly authorized architecture exists.

---

# 79. Edge-to-Cloud Sync

Edge stores local domain operations.

Sync worker periodically:

```text
Find pending cloud operations
↓
Send to Cloud
↓
Receive acknowledgements
↓
Mark synchronized
```

Cloud connectivity failure does not invalidate local commits.

---

# 80. Local Commit First

For branch operations:

```text
BEGIN
Apply business operation locally
Create local sync event
COMMIT
```

After commit:

```text
Sync worker sends event
```

Do not require Cloud acknowledgement before completing normal restaurant operation.

---

# 81. Transactional Outbox

The Edge should use a transactional outbox pattern.

Business operation and outbound sync event are stored in the same PostgreSQL transaction.

Example:

```text
BEGIN

Create payment
Create cash movement
Update account
Create sync outbox operation

COMMIT
```

This ensures a committed business event cannot disappear before synchronization.

---

# 82. Do Not Send Sync Event Before Commit

Incorrect:

```text
Send Cloud request
↓
Local transaction later fails
```

Cloud would contain an operation that never actually committed locally.

Always commit local state and outbox together.

---

# 83. Cloud Idempotency

Cloud must also enforce `operation_id` uniqueness.

If Edge retries the same outbox event:

Cloud processes it once.

---

# 84. Cloud-to-Edge Changes

> **Reemplazado en parte (2026-09-08).** "Product configuration" ya no
> aplica: el catálogo (productos, recetas, acompañantes, precios) es
> autoridad exclusiva de cada sede y no se administra ni edita desde la nube.
> Usuarios, roles y configuración de sucursal sí siguen administrándose desde
> la nube y replicándose hacia el servidor local, como describe
> `.agents/architecture/local-first-edge-replication.md`.

Cloud-originated changes may include:

- ~~Product configuration~~ (reemplazado — ver nota arriba)
- User changes
- Role changes
- Branch settings
- Remote administrative changes

These must eventually propagate to Edge.

---

# 85. Cloud Write Restrictions

> **Reemplazado en parte (2026-09-08).** "Catalog configuration" ya no es
> dato administrado por la nube: cada sede es la única autoridad de su
> catálogo. Ver `.agents/architecture/local-first-edge-replication.md`.

Because Edge is branch operational authority, remote Cloud administration should avoid directly modifying highly active operational aggregates.

Safe cloud-managed data:

```text
~~Catalog configuration~~ (reemplazado — ver nota arriba)
Users
Roles
Settings
Reports
```

Sensitive branch-live entities require controlled synchronization.

Avoid remote direct edits to:

```text
Open accounts
Current cash sessions
Live table consumption
```

unless explicitly designed.

---

# 86. Catalog Cloud Updates

> **Reemplazado (2026-09-08).** Esta sección completa queda reemplazada por
> `.agents/architecture/local-first-edge-replication.md`: no hay
> actualizaciones de catálogo iniciadas desde la nube porque el catálogo es
> propio de cada sede y no existe un catálogo global.

Cloud catalog changes may sync to Edge.

Example:

```text
Product price changed
↓
Cloud change event
↓
Edge pulls
↓
Local catalog updated
↓
Devices pull/update
```

---

# 87. Edge Conflict With Cloud Catalog Edit

> **Reemplazado (2026-09-08).** Esta sección completa queda reemplazada por
> `.agents/architecture/local-first-edge-replication.md`: la nube no edita
> catálogo, por lo que este conflicto Edge/Cloud sobre catálogo no puede
> ocurrir en el alcance aprobado.

If both Edge and Cloud modify the same catalog entity concurrently:

Do not blindly use last-write-wins.

Use entity version.

If versions conflict:

```text
CONFLICT
```

and require administrative resolution.

---

# 88. Versioned Catalog Entities

Recommended for configurable entities:

```text
version BIGINT
```

Examples:

```text
products
inventory_items
accompaniments
branch_settings
roles
```

Each update increments version.

---

# 89. Soft Deactivation Synchronization

Prefer:

```text
active = false
```

over physical deletion.

This makes offline synchronization safer.

Devices can later receive:

```text
PRODUCT_DEACTIVATED
```

without losing historical references.

---

# 90. Tombstones

If hard deletion is ever required for synchronization-safe entities, a tombstone/change event is needed.

Current operational model should avoid hard delete.

---

# 91. PWA Application Cache

The frontend should use a Service Worker to cache:

- HTML shell
- JavaScript
- CSS
- Static assets

This allows application startup without Internet.

---

# 92. Data Cache

Dynamic data belongs in IndexedDB, not Service Worker static cache.

Examples:

```text
products
tables
open accounts
pending operations
```

---

# 93. Client Startup

Recommended startup flow:

```text
Load PWA shell
↓
Load local IndexedDB
↓
Render cached state
↓
Check Edge availability
↓
If Edge available:
    sync local pending operations
    pull latest changes
```

This gives fast startup and offline tolerance.

---

# 94. Edge Discovery

Clients need a stable way to reach Edge.

Options include:

```text
Local DNS
Static hostname
Configured LAN IP
```

Preferred:

```text
pos.local.donjuan
```

or equivalent stable local hostname.

Do not hardcode random DHCP addresses into frontend source code.

---

# 95. Edge Networking

Edge Server should use Ethernet where possible.

Printers and Edge should ideally use:

- Static DHCP reservations
- Stable LAN addresses

Operational infrastructure should not depend on frequently changing IPs.

---

# 96. Local HTTPS

Prefer HTTPS even on local network where practical.

This improves:

- PWA behavior
- Browser security
- Credential protection

Certificate strategy is an infrastructure concern.

---

# 97. Reverse Proxy

Use a reverse proxy such as:

```text
Caddy
```

or equivalent.

It may route:

```text
/       → frontend
/api    → backend
```

Avoid exposing PostgreSQL directly to client devices.

---

# 98. PostgreSQL Exposure

PostgreSQL should only be accessible to backend/services that require it.

Do not expose:

```text
5432
```

to restaurant guest/client networks unnecessarily.

---

# 99. Print Network Isolation

Local printers should be reachable from Edge.

Client devices do not need direct printer access under normal architecture.

---

# 100. Edge Monitoring

Track at minimum:

```text
Edge last seen
Cloud sync last successful
Pending sync count
Failed sync count
Conflict count
Print worker health
Database health
Disk space
```

---

# 101. Sync Health UI

Admin dashboard should expose:

```text
Cloud Sync:
Healthy

Last sync:
10 seconds ago

Pending:
3

Conflicts:
0
```

This is operationally important.

---

# 102. Long Cloud Outage

If Internet is unavailable for hours:

Edge continues operating.

Pending sync operations accumulate.

When connectivity returns:

```text
Sync progressively
```

Do not require restarting the restaurant system.

---

# 103. Edge Restart

After Edge restart:

- PostgreSQL persists local state.
- Sync outbox persists.
- Print jobs persist.
- Pending cloud sync resumes.

Do not keep critical queues only in memory.

---

# 104. Client Restart

After device/browser restart:

IndexedDB preserves:

- Pending local operations
- Cached catalog
- Cached operational context

Do not rely only on JavaScript memory for offline operations.

---

# 105. Local Backup

Edge PostgreSQL should be backed up periodically.

However, Cloud synchronization is not a substitute for a proper database backup.

Backups are defined in the backup module.

---

# 106. Cloud Backup

Cloud PostgreSQL must receive regular automated backups.

Cloud remains the primary disaster-recovery target.

---

# 107. Edge Failure

If Edge hardware fails completely:

Initial recovery strategy:

1. Restore/replace Edge server.
2. Load latest Cloud branch state.
3. Apply any available newer Edge backup.
4. Re-establish synchronization.
5. Resume branch operations.

Avoid automatic dual-writer failover in MVP.

---

# 108. Device-Only Pending Operations After Edge Recovery

Devices with pending DEVICE_ONLY operations reconnect to restored Edge.

They must PUSH operations.

Edge validates and either:

```text
PROCESSED
CONFLICT
FAILED
```

Do not assume local device state is authoritative.

---

# 109. Cloud Reporting Freshness

Cloud reports may be slightly behind Edge when synchronization is delayed.

The UI should indicate data freshness where relevant.

Example:

```text
Last branch sync:
2 minutes ago
```

---

# 110. Remote Administration During Branch Offline

If branch is disconnected from Cloud:

Remote admin changes cannot immediately reach Edge.

Cloud may accept safe configuration changes as pending.

They become effective after Edge reconnects.

Do not claim immediate application when branch is offline.

---

# 111. Sync Payload Versioning

Sync message contracts should have:

```text
schema_version
```

or equivalent protocol version.

This helps deployments where Edge and Cloud are temporarily running different application versions.

---

# 112. Backward Compatibility

Cloud should tolerate a limited supported range of Edge protocol versions during rolling upgrades.

Do not assume all installations update at exactly the same second.

---

# 113. Database Schema Version

Edge and Cloud should track database migration version.

Do not synchronize operations requiring a schema newer than the target system supports.

---

# 114. Deployment Order

Recommended update flow:

```text
Cloud updated
↓
Compatibility maintained
↓
Edge updated
↓
Clients receive new frontend
```

Exact release strategy may evolve.

---

# 115. Sync Logging

Operational sync logs should preserve:

- Device
- Operation ID
- Operation type
- Attempt count
- Status
- Error/conflict
- Processed timestamp
- Latency where useful

Do not expose excessive internal stack traces to normal users.

---

# 116. Security

All Edge-to-Cloud synchronization must be authenticated.

Potential mechanisms:

- Branch/Edge credentials
- Device certificates
- Signed service tokens

Do not accept anonymous sync requests.

---

# 117. Edge Authentication

Cloud must know:

```text
Which branch is this Edge allowed to synchronize?
```

An Edge instance must not submit operations for arbitrary branches.

---

# 118. Device Authentication

Normal user authentication still applies.

Offline operations should preserve:

```text
user_id
```

who originally performed the action.

Syncing Edge service identity does not replace original user attribution.

---

# 119. Audit

Synchronizing an operation must not rewrite the user attribution.

Example:

```text
Created by:
Waiter Juan

Synchronized by:
Edge Server
```

The historical business actor remains Juan.

---

# 120. Source of Truth

Within active branch operation:

```text
Edge PostgreSQL
=
Operational source of truth
```

Central consolidated state:

```text
Cloud PostgreSQL
=
Central source of truth
```

Device IndexedDB:

```text
=
Local cache and temporary pending-operation store
```

It is not authoritative shared state.

---

# 121. Main Use Cases

This module must support at minimum:

```text
Register device
Deactivate device

Cache catalog locally
Cache tables locally
Cache account context locally

Create offline-safe operation
Persist pending operation
Retry operation idempotently

PUSH operations
PULL changes
Advance sync cursor

Detect conflict
Display conflict
Resolve conflict

Continue restaurant operation without Internet
Continue kitchen printing without Internet

Sync Edge to Cloud after reconnection

Recover pending operations after restart
```

---

# 122. Required Schema Adjustments

The current DDL requires some additions.

Implement them through migrations.

## 122.1 Add CONFLICT Sync Status

Extend:

```text
sync_operation_status
```

with:

```text
CONFLICT
```

---

# 123. Add Branch to Sync Operations

Even if derivable from device, preserving branch directly is recommended.

Add:

```text
branch_id UUID
```

to `sync_operations`.

---

# 124. Add Operation Domain Name

Current `sync_operation_type` values:

```text
CREATE
UPDATE
VOID
ADJUST
```

are too generic for operation-based synchronization.

Add a field such as:

```text
operation_name VARCHAR(...)
```

Examples:

```text
OPEN_ACCOUNT
ADD_ACCOUNT_ITEMS
REGISTER_PAYMENT
```

Generic CRUD operation type may remain as metadata but should not be the main domain command identifier.

---

# 125. Add Expected Version

Recommended to `sync_operations` or payload:

```text
expected_version BIGINT NULL
```

for concurrency-sensitive commands.

---

# 126. Add Conflict Metadata

Recommended:

```text
conflict_type
conflict_data JSONB
resolved_at
resolved_by_user_id
resolution_type
```

---

# 127. Add Sync Attempts

Recommended:

```text
attempt_count INTEGER NOT NULL DEFAULT 0
last_attempt_at TIMESTAMPTZ NULL
```

---

# 128. Change Feed Table

Recommended new table:

```text
sync_changes
```

Suggested fields:

```text
id BIGSERIAL
branch_id UUID
entity_type
entity_id
change_type
entity_version
payload JSONB
created_at
```

Its ordered ID may act as the PULL cursor.

---

# 129. Add Version Columns

Recommended version columns on concurrency-sensitive entities:

```text
accounts.version
products.version
inventory_items.version
accompaniments.version
branch_settings version or revision
cash_sessions.version
```

Not every table needs versioning.

Use where conflicts matter.

---

# 130. Transactional Outbox

Recommended separate table:

```text
sync_outbox
```

or reuse a carefully designed sync operation table.

Fields:

```text
operation_id
branch_id
operation_name
entity_type
entity_id
payload
status
created_at
sent_at
```

Business mutation and outbox insert must share one local transaction.

---

# 131. Critical Implementation Principle

Offline support must not mean:

```text
Each device owns a separate version of reality.
```

Correct architecture:

```text
Devices
↓
Edge
↓
Shared Local Operational State
↓
Cloud Synchronization
```

Device-only mode exists only as temporary emergency resilience.

The core synchronization model is:

```text
Business Command
↓
Local Transaction
↓
Domain State
+
Sync Outbox
↓
Commit
↓
Cloud Sync
```

Conflict model:

```text
Operation
↓
Server Validation
↓
Compatible?
├── YES → Apply
└── NO  → CONFLICT
```

Idempotency model:

```text
operation_id
↓
Already processed?
├── YES → Return prior result
└── NO  → Execute exactly once logically
```

All implementation decisions must preserve:

- Edge-first availability
- Single operational writer per branch
- Idempotency
- Historical integrity
- Conflict detection
- Device traceability
- Branch isolation
- Offline printing
- Recovery after network failure
- Recovery after process restart
- Synchronization durability