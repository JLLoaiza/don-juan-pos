# Organization, Branches, Users, Roles and Permissions Module

## Purpose

This document defines the business rules, domain model, authorization model and expected behavior for:

- Companies
- Branches
- Users
- Roles
- Permissions
- Role assignments
- Branch access
- Branch settings
- Authentication context
- Authorization
- Audit requirements related to access control

This document must be treated as authoritative context when implementing or modifying functionality related to organization structure, access control or branch scoping.

Do not reinterpret the concepts described here without an explicit requirement change.

---

# 1. Core Organization Model

The organizational hierarchy is:

```text
Company
└── Branch
    ├── Inventory
    ├── Products
    ├── Dining Areas
    ├── Tables
    ├── Accounts
    ├── Purchases
    ├── Expenses
    ├── Employees
    ├── Cash Registers
    └── Operational Data
```

A Company represents the business as a whole.

A Branch represents an operational location belonging to that Company.

The system must support one or multiple branches.

Even if the initial installation has only one branch, branch isolation must be preserved throughout the architecture.

---

# 2. Company

A company represents the top-level business entity.

It contains information such as:

- ID
- Name
- Legal name
- Tax identifier
- Phone
- Email
- Address
- Currency
- Timezone
- Logo
- Active/inactive state

Example:

```text
Company:
Don Juan

Currency:
COP

Timezone:
America/Bogota
```

A company may have one or multiple branches.

---

# 3. Branch

A branch represents an operational establishment.

Examples:

```text
Don Juan Centro
Don Juan Norte
```

A branch contains at least:

- ID
- Company ID
- Name
- Code
- Address
- Phone
- Active/inactive state

Each operational entity must belong to a branch when applicable.

Examples:

```text
Inventory Item
→ Branch

Product
→ Branch

Dining Area
→ Branch

Account
→ Branch

Employee
→ Branch

Purchase
→ Branch
```

---

# 4. Branch Isolation

Branch isolation is a core system invariant.

An entity belonging to Branch A must not be used in an operation belonging to Branch B unless the domain explicitly supports cross-branch behavior.

The current system does not support cross-branch operational transactions.

Invalid example:

```text
Account:
Branch A

Table:
Branch B
```

Invalid:

```text
Purchase:
Branch A

Inventory Item:
Branch B
```

Invalid:

```text
Product:
Branch A

Inventory Item:
Branch B
```

The backend must validate branch consistency for all related entities.

Do not rely exclusively on the frontend for branch isolation.

---

# 5. Active Branch Context

The application operates within an active branch context.

If a user has access to multiple branches, the frontend should allow switching between them.

Example:

```text
Current Branch:

[ Don Juan Centro ▼ ]
```

All branch-scoped requests should operate against the selected branch.

The backend must verify that the authenticated user is authorized to access the requested branch.

A client-supplied `branch_id` must never be trusted without authorization validation.

---

# 6. Single-Branch Users

A user with access to only one branch may enter that branch automatically after authentication.

The UI does not need to force a branch selection step when only one valid branch exists.

---

# 7. Multi-Branch Users

A user may have access to multiple branches.

Example:

```text
User:
Jorge

Branches:
Don Juan Centro
Don Juan Norte
```

The application should allow the user to switch branch context without requiring another user account.

Branch switching must:

1. Verify access.
2. Change the active branch context.
3. Refresh branch-scoped data.
4. Refresh branch-specific permissions if necessary.
5. Clear or invalidate inappropriate cached data from the previous branch.

---

# 8. User

A user represents an authenticated system identity.

A user is not the same concept as an employee.

Users exist for authentication and authorization.

Employees exist for workforce management.

These entities are intentionally independent.

A user may exist without an employee record.

An employee may exist without a user account.

Do not automatically create or infer a relationship between them.

---

# 9. User Data

A user contains at least:

- ID
- Company ID
- Username
- Optional email
- Password hash
- Display name
- Active/inactive state
- Last login timestamp
- Created timestamp
- Updated timestamp

Passwords must never be stored in plaintext.

The backend must store a secure password hash.

---

# 10. Inactive Users

Inactive users:

- Cannot authenticate.
- Cannot create new sessions.
- Cannot perform new operations.
- Remain referenced in historical audit records.
- Remain referenced in historical sales, purchases and other operations.
- Must not be physically deleted when historical references exist.

Deactivation is preferred over deletion.

---

# 11. Authentication

Authentication identifies the user.

Authorization determines what that user is allowed to do.

These concerns must remain separate.

Typical authentication flow:

```text
Credentials
↓
Validate user
↓
Validate active state
↓
Create authenticated session/token
↓
Load company context
↓
Load accessible branches
↓
Load effective permissions
```

The authentication result should provide enough context for the frontend to initialize the application.

---

# 12. Authentication Response Context

After successful authentication, the client should be able to obtain:

- User ID
- Display name
- Company
- Accessible branches
- Current branch
- Effective permissions for the current branch
- Relevant branch configuration
- Session/token information

Do not require the frontend to reconstruct authorization rules manually from raw database relationships when the backend can provide effective permissions directly.

---

# 13. Role

A role is a configurable group of permissions.

Examples:

```text
Administrator
Manager
Waiter
Cashier
Kitchen
Inventory Manager
```

These are examples only.

Roles must not be hardcoded as the actual authorization mechanism.

Administrators must be able to configure roles.

A role contains at least:

- ID
- Company ID
- Name
- Description
- Active/inactive state

---

# 14. Permission

A permission represents a specific capability.

Permissions should be granular enough to protect meaningful actions.

Examples:

```text
products.view
products.create
products.update
products.activate
products.deactivate
products.view_cost

inventory.view
inventory.adjust
inventory.view_movements

sales.view
sales.create
sales.update
sales.void
sales.apply_discount
sales.split

cash.view
cash.open
cash.close
cash.withdraw

employees.view
employees.manage_shifts
employees.pay

reports.view
reports.export
reports.view_costs

users.manage
roles.manage
```

Permission names should follow a consistent convention:

```text
module.action
```

---

# 15. Role Permissions

Roles receive permissions through a many-to-many relationship.

Example:

```text
Role:
Waiter

Permissions:
sales.view
sales.create
sales.update
tables.view
accounts.view
accounts.update
kitchen.print
```

Another example:

```text
Role:
Administrator

Permissions:
all configured system permissions
```

Do not hardcode behavior such as:

```text
if role == ADMIN
```

unless an explicit system-level fallback is deliberately designed.

Authorization must depend on permissions.

---

# 16. User Roles

A user can have one or multiple roles.

Example:

```text
User:
Carlos

Roles:
Waiter
Cashier
```

Effective permissions are the union of all permissions granted by the user's active roles.

Formula:

```text
effective_permissions =
UNION(
    permissions from all active assigned roles
)
```

The first version of the system does not support explicit permission denial rules.

There is no concept of:

```text
allow permission X
deny permission X
```

Permission resolution is additive.

---

# 17. Branch-Specific Role Assignments

A role assignment may optionally be scoped to a branch.

Example:

```text
Carlos

Don Juan Centro:
Waiter

Don Juan Norte:
Administrator
```

This means the user's effective permissions may differ depending on the active branch.

A role assignment with a branch reference applies only to that branch.

If global role assignments are supported through `branch_id = null`, they apply across authorized branches for the same company.

The backend must clearly define and consistently apply this behavior.

---

# 18. Effective Permissions

Effective permissions must be calculated using:

- Active user
- Active roles
- Current branch
- Active role assignments
- Role permissions

Inactive roles must not grant permissions.

Inactive users must never obtain effective permissions.

The backend should expose effective permissions as a flattened set.

Example:

```json
{
  "permissions": [
    "tables.view",
    "sales.create",
    "sales.update",
    "kitchen.print"
  ]
}
```

---

# 19. Frontend Authorization

The frontend must use effective permissions to control the user experience.

Examples:

Without:

```text
inventory.adjust
```

the user should not see:

```text
Adjust Inventory
```

Without:

```text
products.view_cost
```

the user should not see product costs or profitability information.

Without:

```text
cash.close
```

the close-cash action must not be available.

Frontend authorization improves usability but is not considered sufficient security.

---

# 20. Backend Authorization

Every protected operation must validate permissions on the backend.

Example:

```text
POST /inventory/items/{id}/adjust
```

requires:

```text
inventory.adjust
```

If the authenticated user does not have that permission:

```text
403 Forbidden
```

The request must fail even if the frontend was manually modified.

Never trust client-side visibility rules as authorization.

---

# 21. Permission Checks

A protected backend action should conceptually perform:

```text
Authenticate user
↓
Validate user is active
↓
Resolve requested branch
↓
Validate branch access
↓
Resolve effective permissions
↓
Validate required permission
↓
Validate business rules
↓
Execute operation
```

Permission validation should happen before business mutations.

---

# 22. Sensitive Permissions

The following categories should be protected with specific permissions rather than broad generic access.

## Inventory

```text
inventory.adjust
inventory.view_cost
inventory.view_movements
```

## Sales

```text
sales.void
sales.apply_discount
sales.modify_price
sales.split
```

## Cash

```text
cash.open
cash.close
cash.withdraw
cash.adjust
```

## Purchasing and Expenses

```text
purchases.create
purchases.void
expenses.create
expenses.update
```

## Employees

```text
employees.manage_shifts
employees.pay
employees.manage_rates
```

## Administration

```text
users.manage
roles.manage
permissions.manage
branches.manage
settings.manage
```

## Reporting

```text
reports.view
reports.export
reports.view_costs
reports.view_profitability
```

Users who can view normal operational data should not automatically gain access to sensitive cost or profitability data.

---

# 23. Permission Catalog

Permissions are system-defined capabilities.

Roles are user-configurable combinations of those permissions.

The application may seed an initial permission catalog.

Example modules:

```text
organization
branches
users
roles
products
inventory
accompaniments
tables
sales
kitchen
cash
purchases
expenses
employees
reports
settings
audit
```

The permission catalog may grow as new modules are implemented.

Avoid removing or renaming existing permission keys casually because they may already be assigned to roles.

---

# 24. Role Lifecycle

Roles may be:

```text
Active
Inactive
```

Inactive roles:

- Cannot be newly assigned.
- Must not grant effective permissions.
- Remain visible in historical administration data.
- Should not be physically deleted if assignments or audit history exist.

---

# 25. Role Modification

Changing a role's permissions immediately affects users assigned to that role after the new authorization state is synchronized or refreshed.

Example:

Before:

```text
Waiter:
sales.create
sales.update
```

After:

```text
Waiter:
sales.create
sales.update
sales.apply_discount
```

Users assigned to `Waiter` now gain `sales.apply_discount`.

The change must be audited.

---

# 26. User Role Assignment

Authorized administrators may:

- Assign roles
- Remove role assignments
- Assign branch-specific roles
- Remove branch-specific role assignments

The system must prevent invalid combinations such as assigning a role from one company to a user from another company.

---

# 27. Company Isolation

A user belongs to one company.

Roles belong to one company.

Branches belong to one company.

A user must not receive roles belonging to another company.

A user must not access branches belonging to another company.

Example invalid relationship:

```text
User:
Company A

Role:
Company B
```

Example invalid branch access:

```text
User:
Company A

Branch:
Company B
```

These constraints must be validated in backend logic.

---

# 28. Branch Settings

Each branch has flexible configuration.

Branch-specific settings may be stored using JSONB.

Example:

```json
{
  "default_service_percentage": 10,
  "allow_negative_stock": true,
  "receipt_footer": "Gracias por su visita",
  "currency": "COP",
  "timezone": "America/Bogota"
}
```

Use JSONB only for configuration that is naturally flexible and does not require strong relational querying.

Do not place important relational domain entities inside `branch_settings`.

---

# 29. Settings Resolution

When the application needs a setting:

1. Read the active branch configuration.
2. Apply explicit branch value when configured.
3. Apply documented system default when no branch value exists.

Defaults must be deterministic.

Do not create undocumented implicit fallback behavior.

---

# 30. Branch Deactivation

An inactive branch:

- Cannot accept new operational transactions.
- Cannot be selected as an active branch for normal operations.
- Remains available to authorized administrators.
- Remains visible in historical reports.
- Keeps all historical data.
- Must not be physically deleted when operational history exists.

---

# 31. Company Deactivation

An inactive company prevents normal application operation for its users.

Historical data remains preserved.

Company deletion is not part of normal application behavior.

---

# 32. Historical User References

Operational records may reference users.

Examples:

```text
Account opened by user
Purchase created by user
Inventory adjustment created by user
Cash session opened by user
Employee payment recorded by user
Audit record performed by user
```

These references must remain valid even after the user is deactivated.

Never rewrite historical user references when permissions or user properties change.

---

# 33. Audit Requirements

All access-control-sensitive operations must create audit records.

At minimum audit:

## Users

- User creation
- User modification
- User activation
- User deactivation
- Password administrative reset when applicable

## Roles

- Role creation
- Role modification
- Role activation
- Role deactivation

## Role Permissions

- Permission added to role
- Permission removed from role

## User Role Assignments

- Role assigned to user
- Role removed from user
- Branch-specific role assigned
- Branch-specific role removed

## Branches

- Branch creation
- Branch modification
- Branch activation
- Branch deactivation
- Branch settings modification

Audit entries should preserve relevant before and after state.

---

# 34. Audit Structure

An audit event should capture at minimum:

```text
User
Company
Branch when applicable
Action
Entity type
Entity ID
Before state
After state
Timestamp
Relevant metadata
```

Example:

```json
{
  "action": "ROLE_PERMISSIONS_UPDATED",
  "entity_type": "role",
  "entity_id": "uuid",
  "before_data": {
    "permissions": [
      "sales.view",
      "sales.create"
    ]
  },
  "after_data": {
    "permissions": [
      "sales.view",
      "sales.create",
      "sales.apply_discount"
    ]
  }
}
```

The backend creates audit records as part of the domain operation.

Do not depend on the frontend to explicitly create audit records.

---

# 35. Atomic Administrative Operations

Administrative operations affecting multiple tables must use PostgreSQL transactions.

Example role creation:

```text
BEGIN

Create role
Assign permissions
Create audit record

COMMIT
```

If anything fails:

```text
ROLLBACK
```

Example user-role assignment:

```text
BEGIN

Validate user
Validate role
Validate company
Validate branch
Create assignment
Create audit record

COMMIT
```

Never allow partially completed authorization changes.

---

# 36. User Deactivation

Deactivating a user must:

1. Set the user as inactive.
2. Prevent new authentication.
3. Invalidate active access according to the authentication strategy.
4. Preserve historical references.
5. Preserve audit history.
6. Create an audit event.

If token-based authentication is used, the implementation must provide a mechanism to ensure a deactivated user cannot continue making authorized requests indefinitely with an old token.

---

# 37. Permission Changes and Existing Sessions

Permissions may change while a user already has an active session.

The server must remain authoritative.

Even if the frontend still has an old permission snapshot, backend authorization must evaluate the current valid permission state or a sufficiently fresh authoritative authorization context.

A stale frontend permission cache must never allow a forbidden backend operation.

---

# 38. Offline Authorization

Offline operation requires a local permission snapshot.

When the device successfully authenticates or synchronizes, store:

- User identity
- Current branch access
- Effective permissions
- Relevant branch configuration
- Authorization snapshot timestamp/version if needed

While offline, the frontend uses the local permission snapshot to control allowed actions.

The local snapshot is not ultimately authoritative.

---

# 39. Offline Permission Revalidation

When offline operations synchronize:

```text
Offline operation
↓
Server receives operation
↓
Server identifies user
↓
Server validates branch access
↓
Server validates current permissions
↓
Server applies domain validation
↓
Operation accepted or rejected
```

The server must not blindly trust permissions that existed when the client was offline.

If the user's permissions were revoked before synchronization, the server may reject the pending operation according to the module-specific synchronization rules.

Rejected operations must preserve enough information for administrative review and user feedback.

---

# 40. Offline Branch Context

Offline operations must include enough metadata to identify:

- Branch
- User
- Device
- Operation ID
- Entity IDs
- Timestamp/context required by the relevant module

A device must not merge operations from multiple branches without explicit branch context.

---

# 41. Globally Unique Identifiers

Entities that may be created while offline must use globally unique identifiers.

Prefer UUIDv7 where supported.

Do not depend on sequential database-generated IDs for offline-created entities.

Example:

```text
Product ID:
UUID

Account ID:
UUID

Operation ID:
UUID
```

---

# 42. Idempotent Operations

Offline synchronization and retryable operations must use a globally unique operation identifier.

Example:

```text
operation_id = UUID
```

If the server receives the same operation twice, it must not apply the business mutation twice.

Conceptual behavior:

```text
Receive operation
↓
Check operation_id
↓
Already processed?
├── Yes → return previous result / acknowledgement
└── No  → process operation
```

This requirement is especially important for:

- Sales
- Payments
- Inventory adjustments
- Purchases
- Cash operations
- Other financial mutations

---

# 43. Authorization Errors

Use clear authorization semantics.

Typical cases:

```text
401 Unauthorized
```

Use when authentication is missing or invalid.

```text
403 Forbidden
```

Use when the user is authenticated but lacks permission or branch access.

Do not expose sensitive authorization internals unnecessarily.

---

# 44. Backend Invariants

The backend must enforce all of the following:

1. Every user belongs to exactly one company.
2. Every role belongs to exactly one company.
3. Every branch belongs to exactly one company.
4. Users cannot receive roles from another company.
5. Users cannot operate branches belonging to another company.
6. Branch-scoped entities must remain within their branch.
7. Backend authorization is mandatory.
8. Frontend permission checks are not security boundaries.
9. Inactive users cannot authenticate or perform new operations.
10. Inactive roles do not grant permissions.
11. Effective permissions are additive.
12. Explicit permission denial is not supported in the initial version.
13. Historical references to users and roles must remain valid.
14. Role and permission modifications must be audited.
15. Branch configuration changes must be audited.
16. Multi-record authorization updates must be transactional.
17. Offline operations must be revalidated by the server.
18. Globally unique operation IDs must prevent duplicate retry processing.
19. Client-supplied branch IDs must be validated against user access.
20. Company and branch boundaries must never be inferred solely from client input.

---

# 45. Frontend Behavior

The frontend should adapt to the user's permissions.

Examples:

A user without:

```text
products.view_cost
```

should not see:

```text
Product Cost
Profit
Margin
```

A user without:

```text
inventory.adjust
```

should not see:

```text
Adjust Stock
```

A user without:

```text
roles.manage
```

should not access role administration.

A user without:

```text
reports.export
```

should not see export actions.

The frontend must still gracefully handle `403 Forbidden` responses because permissions can change while the application is open.

---

# 46. Branch Selector Behavior

If the user has one branch:

```text
Automatically select it.
```

If the user has multiple branches:

```text
Show a branch selector.
```

Switching branch must reload or invalidate:

- Branch products
- Inventory
- Tables
- Accounts
- Employees
- Cash context
- Branch settings
- Branch-specific permissions
- Other branch-scoped cached data

Do not accidentally keep operational state from the previous branch.

---

# 47. Administrative UI

The administration module should provide at minimum:

## Users

```text
List users
Create user
Edit user
Activate/deactivate user
Assign roles
View branch assignments
```

## Roles

```text
List roles
Create role
Edit role
Activate/deactivate role
Configure permissions
```

## Branches

```text
List branches
Create branch
Edit branch
Activate/deactivate branch
Edit branch settings
```

Permission-sensitive information should only be visible to authorized administrators.

---

# 48. Suggested Permissions

The following permission keys are recommended for this module:

```text
organization.view

branches.view
branches.create
branches.update
branches.activate
branches.deactivate
branches.manage_settings

users.view
users.create
users.update
users.activate
users.deactivate
users.manage_roles

roles.view
roles.create
roles.update
roles.activate
roles.deactivate
roles.manage_permissions

audit.view
```

Exact naming may evolve, but existing keys should remain stable once used by role assignments.

---

# 49. Source of Truth

Authoritative organizational data:

```text
Company:
companies

Branches:
branches

Users:
users

Roles:
roles

Permissions:
permissions

Role permissions:
role_permissions

User role assignments:
user_roles

Branch configuration:
branch_settings
```

Effective permissions are derived from these relationships.

The frontend may cache authorization state for UX and offline behavior, but the backend remains authoritative.

---

# 50. Main Use Cases

This module must support at minimum:

```text
Create branch
View branch
Update branch
Activate branch
Deactivate branch
Configure branch settings

Create user
View user
Update user
Activate user
Deactivate user

Create role
View role
Update role
Activate role
Deactivate role

Assign permission to role
Remove permission from role

Assign role to user
Remove role from user
Assign role to user for branch
Remove branch-specific role assignment

Authenticate user
Resolve accessible branches
Resolve effective permissions
Switch active branch

Audit authorization changes
```

---

# 51. Integration With Other Modules

Every other module must integrate with this one for authorization and branch scoping.

Example sale operation:

```text
Authenticated user
↓
Validate active user
↓
Validate branch
↓
Validate sales permission
↓
Execute sales business rules
↓
Create audit data
```

Example inventory adjustment:

```text
Authenticated user
↓
Validate active branch
↓
Require inventory.adjust
↓
Execute inventory transaction
↓
Audit operation
```

Example employee payment:

```text
Authenticated user
↓
Validate branch
↓
Require employees.pay
↓
Execute payment operation
↓
Audit operation
```

No business module should implement its own incompatible authorization model.

---

# 52. Non-Goals

This module intentionally does not define:

- Employee payroll logic
- Product catalog logic
- Inventory costing logic
- Sales lifecycle
- Table lifecycle
- Cash management
- Purchase calculations
- Expense calculations
- Kitchen printing
- Reporting formulas
- Backup implementation

Those belong to their corresponding modules.

This module provides organization structure, branch boundaries and authorization context for them.

---

# 53. Critical Implementation Principle

Do not treat authorization as frontend configuration.

The authoritative flow is:

```text
User
↓
Company
↓
Branch Access
↓
Roles
↓
Permissions
↓
Backend Authorization
↓
Business Operation
```

And for every branch-scoped business operation:

```text
Authenticate
↓
Validate user
↓
Validate branch
↓
Validate permission
↓
Validate domain rules
↓
Execute PostgreSQL transaction
↓
Create audit information
↓
Return result
```

All implementation decisions must preserve:

- Company isolation
- Branch isolation
- Permission integrity
- Historical integrity
- Auditability
- Offline revalidation