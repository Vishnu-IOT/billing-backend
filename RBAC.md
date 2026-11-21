# Company-scoped fixed roles

BillFlow has exactly three active roles per company: Administrator, Purchase
Manager, and Staff. Role definitions are system-owned; the role editor is
read-only, and role creation, duplication, permission replacement, deletion,
and deactivation endpoints reject changes.

## Deployment

Back up the database, then apply migrations before deploying the backend and
frontend:

```sh
npm run migrate
npm run seed
```

The fixed-role migration upgrades the role key, creates or repairs the three
system roles for existing companies, updates their permission grants, moves
users to a fixed role conservatively, and deactivates legacy custom roles
without deleting their records. A follow-up migration scopes customers and
suppliers to a company and backfills records from unambiguous transaction
history; unresolvable legacy records are left unassigned rather than exposed
across companies. New companies receive the same roles and grants from company
provisioning.

## Role access

- **Administrator** receives every catalogued permission and is allowed through
  future API mappings that have not yet been added. User and company data
  remains scoped to the authenticated company.
- **Purchase Manager** can manage products, suppliers, purchases, purchase
  returns, and permitted shift operations. It cannot access sales, staff
  administration, roles, or settings.
- **Staff** can use B2C POS billing only. POS-specific read endpoints provide
  the product, customer, company, and cashier data needed for checkout without
  granting access to their management pages. Product cost and margin fields
  are omitted from Staff POS responses. Staff can create Quick Sale items while
  billing, earn or redeem configured loyalty points, and apply company return
  credits. They cannot review aliases, verify GST, manage loyalty balances, or
  open sales or purchase management pages. Shift access is limited to the
  cashier's own assigned counter and shift.

Keys use the format `module.page.action`, for example
`products.catalog.edit`, `purchases.invoices.create`, and
`pos.billing.access`. `rbac/permissionCatalog.js` is the source of truth for
the role matrix. System role permissions are resolved from that fixed
definition on every request rather than trusting JWT or client-supplied
permission claims.

## API

- `GET /api/permissions` returns the permission catalogue.
- `GET /api/roles` lists the authenticated company's fixed roles.
- `GET /api/roles/assignable` lists roles assignable by an Administrator.
- `GET /api/roles/:id/permissions` reads the fixed permission set.
- Role mutation endpoints return `403` because roles and grants are fixed.
- `GET /api/users/me` refreshes the authenticated user's role and permissions.

Every protected request verifies the JWT, active user, company-owned active
role, and current access. Company user and transaction queries remain scoped
to the authenticated company. Unmapped APIs are denied to non-administrators;
Administrators bypass API permission mapping but do not bypass company
ownership checks.
