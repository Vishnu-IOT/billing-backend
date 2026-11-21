# Database Schema Migration Notes

This note documents the recent startup schema updates in
`config/migrations.js`, including POS shifts and party/purchase GST treatment.
The backend runs these updates during database startup; this file does not
apply migrations itself.

## Recent Sequelize migrations (November 4-14, 2026)

The following timestamped migration files are also present under `migrations/`.
They are separate from the startup updates in `config/migrations.js`.

| Migration file | Tables and schema changes |
|---|---|
| `20261104141100-add-profit-margin-to-products.js` | Adds nullable `products.profitMargin DECIMAL(8,2)`. |
| `20261105100000-add-product-price-types.js` | Adds `products.purchasePriceType` and `products.sellingPriceType` as `ENUM('WITH_GST','WITHOUT_GST')`, defaulting to `WITHOUT_GST`. |
| `20261106000000-create-loyalty-redemptions-and-ledger.js` | Creates `loyalty_gifts`, `loyalty_redemptions`, and `loyalty_transactions`, including customer/performer/sale references, redemption status, point balance snapshots, idempotency keys, and lookup indexes. |
| `20261106010800-add-loyalty-settings-to-app-settings.js` | Adds `app_settings.loyaltyEnabled`, `loyaltyAmountPerPoint`, and `loyaltyPointsPerUnit`. |
| `20261106020000-add-weight-based-quantities.js` | Adds product unit configuration (`unitType`, `baseUnit`, `allowDecimalQuantity`); changes product, sale, purchase, document, stock movement, and stock transfer quantities to decimal precision; adds quantity units and creates `sales_returns`. |
| `20261107000000-support-free-quantity-promotional-offers.js` | Adds paid/free/total quantity and batch fields to purchase and sale lines, offer snapshot fields, free-stock and price/tax fields to batches, and creates `promotional_offers`. |
| `20261110000000-batch-promotion-sales-workflows.js` | Adds batch purchase cost and promotion snapshots to sales lines; adds batch links to movements/returns; adds promotion configuration fields; creates `promotional_campaigns`, `campaign_products`, and `promotion_applications`. |
| `20261110010000-complete-promotion-workflows.js` | Completes offer/campaign discount and gift settings and creates the promotion-application snapshot table if it is not already present. |
| `20261110120000-add-discount-value-to-promotional-offers.js` | Adds `promotional_offers.discountValue DECIMAL(10,2) NOT NULL DEFAULT 0`. Its rollback is intentionally disabled to protect saved values. |
| `20261110130000-expand-promotion-offer-types.js` | Changes `offerType` on `promotional_offers` and `campaign_products` to `VARCHAR(40)` so newer offer types can be stored. Its rollback is intentionally disabled to avoid truncating stored values. |
| `20261110140000-add-sales-return-credits.js` | Creates `sales_return_credits` and `sales_return_credit_redemptions`; adds return-credit totals and links returned sale lines, stock movements, and returns to their batch/credit records. |
| `20261114000000-add-gst-report-snapshots.js` | Adds company, party, tax classification, place-of-supply, reverse-charge, and GST-component snapshot columns to sales, purchases, and invoice lines. Backfills sales company IDs from users, and purchase company IDs only when the database has exactly one company. |

### GST snapshot columns from the latest migration

The `20261114000000-add-gst-report-snapshots.js` migration adds missing columns
only; existing values are retained. Historical GST splits and party/place-of-
supply details are not reconstructed from current product or party records.

| Table | Added columns |
|---|---|
| `sales` | `companyId`, `partyNameSnapshot`, `partyGstinSnapshot`, `partyRegistrationTypeSnapshot`, `taxTypeSnapshot`, `placeOfSupplyStateCodeSnapshot`, `placeOfSupplyNameSnapshot`, `reverseCharge` |
| `purchases` | `companyId`, `partyNameSnapshot`, `partyGstinSnapshot`, `partyRegistrationTypeSnapshot`, `placeOfSupplyStateCodeSnapshot`, `placeOfSupplyNameSnapshot` |
| `sales_items` | `cgstAmount`, `sgstAmount`, `igstAmount`, `cessAmount` |
| `purchase_items` | `cessAmount` |

Snapshot columns are nullable so legacy bills can remain without invented
historical data. The separate startup migration also adds purchase tax fields,
purchase-line tax rates/amounts, and sales reverse-charge fields described
below.

### SQL queries for migration/schema inspection

List the recent migration files recorded as applied by Sequelize:

```sql
SELECT `name`
FROM `SequelizeMeta`
WHERE `name` >= '20261104000000'
ORDER BY `name`;
```

Inspect the latest GST snapshot columns and their actual database definitions:

```sql
SELECT `TABLE_NAME`, `COLUMN_NAME`, `COLUMN_TYPE`, `IS_NULLABLE`, `COLUMN_DEFAULT`
FROM `INFORMATION_SCHEMA`.`COLUMNS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN ('sales', 'purchases', 'sales_items', 'purchase_items')
  AND (
    `COLUMN_NAME` LIKE '%Snapshot'
    OR `COLUMN_NAME` IN (
      'companyId', 'reverseCharge', 'cgstAmount', 'sgstAmount',
      'igstAmount', 'cessAmount'
    )
  )
ORDER BY `TABLE_NAME`, `ORDINAL_POSITION`;
```

Check which newer feature tables exist:

```sql
SELECT `TABLE_NAME`
FROM `INFORMATION_SCHEMA`.`TABLES`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN (
    'loyalty_gifts', 'loyalty_redemptions', 'loyalty_transactions',
    'sales_returns', 'sales_return_credits',
    'sales_return_credit_redemptions',
    'promotional_offers', 'promotional_campaigns',
    'campaign_products', 'promotion_applications'
  )
ORDER BY `TABLE_NAME`;
```

## Party registration and purchase GST migration

The migration extends the existing `parties`, `purchases`, and
`purchase_items` tables. It does not create new tables.

### `parties`

| Column | Definition or backfill |
|---|---|
| `gstRegistrationType` | Adds as nullable `ENUM('REGISTERED','UNREGISTERED')`, backfills from the existing `GST`, then changes to `NOT NULL DEFAULT 'UNREGISTERED'`. A GSTIN matching the Indian 15-character pattern is marked `REGISTERED`; all other existing values are marked `UNREGISTERED`. |
| `GST` | Changes to nullable `VARCHAR(255)` so unregistered parties can omit a GSTIN. |

### `purchases`

| Column | Definition or behavior |
|---|---|
| `invoiceType` | Nullable `ENUM('GST_INVOICE','BILL_OF_SUPPLY','NON_GST_INVOICE')`. Existing purchase rows remain `NULL` until edited; their prior totals are not recalculated by this migration. |
| `taxType` | Nullable `ENUM('CGST_SGST','IGST')`, recording the resolved or explicitly selected GST treatment. |
| `reverseCharge` | `TINYINT(1) NOT NULL DEFAULT 0`. |
| `reverseChargeAmount` | `DECIMAL(12, 2) NOT NULL DEFAULT 0.00`; stored separately from the supplier invoice total. |
| `itcEligible` | `TINYINT(1) NOT NULL DEFAULT 0`; input tax credit is ineligible by default. |
| `itcEligibleAmount` | `DECIMAL(12, 2) NOT NULL DEFAULT 0.00`. |
| `itcIneligibleAmount` | `DECIMAL(12, 2) NOT NULL DEFAULT 0.00`. |

### `purchase_items`

| Column | Definition or backfill |
|---|---|
| `productGstRate` | `DECIMAL(5, 2) NOT NULL DEFAULT 0.00`; backfilled from `taxPercentage` when the new value is zero and the existing tax percentage is positive. |
| `priceType` | Nullable `ENUM('WITH_GST','WITHOUT_GST')`; backfilled from the related product's purchase price type, then defaults remaining legacy rows to `WITHOUT_GST`. New and edited purchase lines save the line's selected price mode. |
| `cgstRate`, `sgstRate`, `igstRate` | Each `DECIMAL(5, 2) NOT NULL DEFAULT 0.00`. |
| `cgstAmount`, `sgstAmount`, `igstAmount` | Each `DECIMAL(10, 2) NOT NULL DEFAULT 0.00`. |

The tax component columns are snapshots written when a purchase is created or
updated. Existing rows receive zero component defaults; the migration does not
infer their historical CGST/SGST/IGST split.

The purchase `priceType` snapshot allows edit forms to restore the saved
line-level GST-inclusive or GST-exclusive rate mode even if it differs from
the product's current default.

The columns are added using the startup migration's `safeAddColumn` helper.
The GST registration and product-rate backfills only update rows that have not
already been populated. The migration changes existing party GST nullability
and registration status after backfill.

## Table updated

The migration updates the existing MySQL table `pos_shifts`. It only attempts
these changes when the table already exists; it does not create the table.

| Column / object | Definition or behavior |
|---|---|
| `companyId` | Adds as nullable `INT`, fills missing values from the owning user's `users.companyId`, then changes it to `INT NOT NULL`. |
| `cashInTotal` | `DECIMAL(10, 2) NOT NULL DEFAULT 0.00`; physical cash added to the drawer. |
| `cashOutTotal` | `DECIMAL(10, 2) NOT NULL DEFAULT 0.00`; physical cash removed from the drawer. |
| `cashRefundsTotal` | `DECIMAL(10, 2) NOT NULL DEFAULT 0.00`; cash physically refunded from the drawer. |
| `otherSalesTotal` | `DECIMAL(10, 2) NOT NULL DEFAULT 0.00`; non-cash tender other than Cash, UPI, or Card. |
| `idx_pos_shifts_company_user_status` | Index on `(companyId, userId, status)` for company- and user-scoped shift lookups. |
| `fk_pos_shifts_company` | Foreign key from `companyId` to `companies.id`, with cascading update/delete behavior. |

Existing columns such as `cashSalesTotal`, `upiSalesTotal`, and
`cardSalesTotal` are not recreated by this migration.

## Data and behavior

- Existing shifts with a `NULL companyId` are backfilled from the related user
  before `companyId` is made non-null.
- New monetary fields default to zero, so existing shift rows receive valid
  initial values and the closing-cash calculation can read them safely.
- The index is non-unique. It supports concurrent shifts belonging to
  different users; application logic enforces one open shift per user.
- The migration checks for missing columns, the named index, and a company
  foreign key before adding them, so the intended changes can be applied on
  repeated application starts.

## Other existing startup column additions

The same migration also uses `safeAddColumn` for these previously introduced
application fields. They are listed here to keep this startup migration note
as the schema reference:

| Table | Columns |
|---|---|
| `products` | `minStockLevel INT NOT NULL DEFAULT 5`, `reorderLevel INT NOT NULL DEFAULT 10`, `minOrderQuantity INT NOT NULL DEFAULT 1`, `brandId INT NULL` |
| `sales` | `shiftId INT NULL`, `paymentDetails TEXT NULL`, `warehouseId INT NOT NULL DEFAULT 1` |
| `purchases` | `warehouseId INT NOT NULL DEFAULT 1` |

The migration also attempts to update the sales and purchases `paymentStatus`
ENUMs to include `Partial`, and changes `products.unit` to `VARCHAR(20)`.
Those `ALTER TABLE` operations are wrapped in warning-only error handling.

Expected cash at shift close is calculated as:

```text
openingFloat + cashSalesTotal + cashInTotal - cashOutTotal - cashRefundsTotal
```

Currently, cash-in, cash-out, and physical cash-refund workflows are not
implemented, so their totals remain zero unless populated by a future
transaction workflow.

## Applying and checking

The application calls `runMigrations()` after authenticating the database
connection, then synchronizes Sequelize models. Restart the backend with the
correct database configuration to apply the startup migration. Review the
backend logs for migration warnings or errors.

After startup, the following query can be used to inspect the shift columns:

```sql
SHOW COLUMNS FROM `pos_shifts`;
```

To inspect the lookup index:

```sql
SHOW INDEX FROM `pos_shifts`
WHERE `Key_name` = 'idx_pos_shifts_company_user_status';
```

These startup migrations have not been run against a live database as part of
this documentation update.
