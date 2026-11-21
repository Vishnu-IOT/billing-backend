# BillFlow Backend API Documentation

This document summarizes the current backend contract for the corrected BillFlow application. It focuses on the implemented purchase, sales, batch, stock, promotion, campaign, and return flows that are now aligned with the project’s batch-aware inventory model.

## Base URL

- Local development: http://localhost:5001/api
- Route groups are mounted under /api and include products, sales, purchase, inventory, app settings, loyalty, parties, customers, and payments.

## Common conventions

- All numeric quantities use decimals where applicable.
- Product batches carry their own `purchasePrice`, `mrp`, `salePrice`, `stock`, `availableQuantity`, and `expiryDate`.
- Supplier free stock is kept separate from supplier billable stock.
- Sale lines may be split by batch to support FIFO/manual allocation and returns.
- Promotion and campaign logic is evaluated centrally and on the server side.
- GST and margin calculations follow the app’s configured `WITH_GST` / `WITHOUT_GST` price modes.

## Authentication / user context

Most endpoints expect a valid authenticated user context with `userId` in the request body or request context. In the current implementation, this is used for audit logs, stock movement records, and sales ownership.

---

## 1) Product endpoints

### POST /api/products/add-Products
Create a product.

When `stockQuantity` is greater than zero, the backend creates an opening batch and stock movement in the same transaction. The batch uses the provided batch number when present; otherwise it receives an `OPENING-<productId>` number. A zero opening quantity does not create a batch.

Request example:

```json
{
  "name": "Cotton Shirt",
  "categoryId": 2,
  "sku": "CS-001",
  "salesPrice": 449,
  "purchasePrice": 300,
  "sellingPriceType": "WITHOUT_GST",
  "purchasePriceType": "WITHOUT_GST",
  "taxRate": 18,
  "unitType": "PCS",
  "baseUnit": "PCS",
  "stockQuantity": 0
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "id": 12,
    "name": "Cotton Shirt",
    "stockQuantity": 0
  }
}
```

### GET /api/products/get-Products
List products.

### GET /api/products/get-Products/:id
Fetch a single product including associated pricing metadata and batch information when available.

### POST /api/products/update-Products/:id
Update an existing product.

### POST /api/products/updatebulk-Products
Bulk stock adjustment or quantity update for inventory sync.

### GET /api/products/get-Batches/:productId
List all batches for a product, including available quantity, MRP, and sale price for batch selection in POS.

### POST /api/products/add-Batch/:productId
Create a batch for a product.

Request example:

```json
{
  "batchNumber": "A-1001",
  "mfgDate": "2026-07-01",
  "expiryDate": "2028-07-01",
  "paidQuantity": 10,
  "freeQuantity": 2,
  "purchasePrice": 65,
  "mrp": 100,
  "salePrice": 120,
  "gstPercentage": 18,
  "companyId": 1
}
```

Business rule:
- `paidQuantity` is supplier-billed stock.
- `freeQuantity` is supplier free stock.
- `totalReceivedQuantity` becomes `paidQuantity + freeQuantity`.
- `availableQuantity` is the inventory that is actually saleable.
- The code preserves existing batch pricing instead of overwriting older records.
- Product aggregate stock is increased by total received quantity in the same transaction as the batch and stock movement.

---

## 2) Purchase flow

### POST /api/purchase/add-purchase
Create a purchase invoice.

Request example:

```json
{
  "partyId": 4,
  "companyId": 1,
  "userId": 9,
  "purchaseDate": "2026-11-09",
  "paymentStatus": "Partial",
  "items": [
    {
      "productId": 12,
      "quantity": 10,
      "paidQuantity": 10,
      "freeQuantity": 2,
      "purchasePrice": 65,
      "mrp": 100,
      "salePrice": 120,
      "batchNumber": "A-1001",
      "expiryDate": "2028-07-01",
      "gstPercentage": 18
    }
  ]
}
```

Key workflow:
- The purchase controller records the supplier invoice amount and payment details.
- Supplier free stock is inserted as a batch receipt record without inflating the billed quantity.
- Each receipt is preserved as a distinct batch record.
- Product stock is increased only by the total received quantity.
- `salePrice` sets that batch's selling price; it uses the product's `sellingPriceType` and GST rate when the batch is sold.
- Purchase cost remains traceable to the batch used for future margin analysis.

Success response:

```json
{
  "success": true,
  "message": "Purchase created successfully",
  "data": {
    "id": 88,
    "invoiceNumber": "PO-2026-001",
    "totalAmount": 650,
    "items": [
      {
        "productId": 12,
        "quantity": 12,
        "paidQuantity": 10,
        "freeQuantity": 2
      }
    ]
  }
}
```

### GET /api/purchase/get-purchase
Fetch all purchases.

### GET /api/purchase/get-purchase/:id
Fetch a single purchase with party and item details.

### PUT /api/purchase/updatebyid-purchase/:id
Update an existing purchase invoice.

Each item must include `productId` and quantity/price details. `productName` is optional; when omitted, the backend uses the current product name. This avoids requiring the frontend to send a duplicate product label when saving an edited bill.
To update the selling price on an existing batch, include its `productBatchId` and the new `salePrice`; the price continues to use the product's configured GST pricing mode.

### POST /api/purchase/updatepaymentout-purchase/:id
Record supplier payment against the purchase bill.

### GET /api/purchase/payments-purchase/:id
Fetch purchase payment history.

---

## 3) Sales / POS flow

### POST /api/sales/add-sales
Create a sales invoice.

Request example:

```json
{
  "userId": 9,
  "companyId": 1,
  "bill_type": "B2C",
  "name": "Walk-in Customer",
  "phone": "9999999999",
  "items": [
    {
      "productId": 12,
      "productName": "Cotton Shirt",
      "quantity": 3,
      "discountPercentage": 0,
      "batchId": 5
    }
  ]
}
```

Server behavior:
- The backend resolves the correct batch stock and deducts the quantity from the actual allocated batch.
- When `batchId` or `batchAllocations` is supplied, the selected batch's sale price and MRP are used for that sale and the price is validated against that batch's MRP. The invoice amount is calculated from the selected batch's sale price.
- If a promotion is eligible, the server calculates free quantity and validates it on the backend.
- Same-product free units are recorded with their paid and free quantities on the qualifying sales item. Different-product gifts are separate `GIFT` sales lines with their own batch linkage.
- A sales item records `productBatchId`, `purchaseCost`, promotion source, and related metadata to support stock restoration and returns.

Success response:

```json
{
  "success": true,
  "message": "Invoice created successfully",
  "data": {
    "id": 44,
    "invoiceNumber": "INV/2026-27/000001",
    "totalAmount": 1347,
    "bill_type": "B2C",
    "items": [
      {
        "saleItemId": 101,
        "productId": 12,
        "quantity": 3,
        "quantityUnit": "PCS",
        "price": 449
      }
    ]
  }
}
```

### GET /api/sales/get-sales
Fetch all sales invoices.

### GET /api/sales/get-sales-date
Fetch sales by date range or filter.

### GET /api/sales/get-sales/:id
Get a single invoice including items, customer details, and promotion application snapshots.

### PUT /api/sales/updatebyid-sales/:id
Update a sales invoice. Invoices with promotion applications or cancelled invoices cannot be edited.

### POST /api/sales/updatepaymentin-sales/:id
Record payment against a sale.

### GET /api/sales/payments-sales/:id
Fetch payment history.

### POST /api/sales/return-sales/:saleId
Record an inventory-only sales return. This legacy endpoint does not issue financial credit. Promotion-linked lines and cancelled invoices are rejected by the configured return policy.

Request example:

```json
{
  "saleItemId": 101,
  "quantity": 1,
  "quantityUnit": "PCS",
  "reason": "Damaged item",
  "idempotencyKey": "return-101-20261109-001"
}
```

Response example:

```json
{
  "success": true,
  "data": {
    "saleId": 44,
    "saleItemId": 101,
    "quantity": 1,
    "remainingReturnableQuantity": 2,
    "stockQuantity": 21
  }
}
```

### B2C return credit

These endpoints implement the customer-facing B2C return workflow separately from the legacy inventory-only endpoint above. Returned stock is restored to the original batch where available, and a return-credit voucher is issued. Credit may be applied to a later B2C sale in full or in part; any unused balance remains available.

#### GET /api/sales/returnable-invoice/:invoiceNumber
Look up an active B2C invoice and its remaining returnable quantities by invoice number. The response includes each sale item's `returnedQuantity` and `remainingReturnableQuantity`.

#### POST /api/sales/return-credits/:saleId
Record one or more returned items and issue a return-credit voucher. A unique `Idempotency-Key` header is required (maximum 100 characters); the same key and payload safely replay the original result.

Request example:

```json
{
  "items": [
    { "saleItemId": 101, "quantity": 1, "quantityUnit": "PCS" }
  ],
  "reason": "Customer return"
}
```

The response contains the original invoice number, returned items, `totalAmount`, and `remainingAmount`, plus the voucher `code`. Print the voucher QR/text value as `RETURN-CREDIT:<code>`.

#### GET /api/sales/return-credits/:code
Validate a voucher and read its current `remainingAmount`. The POS must still submit the code during invoice creation; the backend locks and revalidates the balance at checkout.

#### Applying return credit to POST /api/sales/add-sales
For a B2C invoice, optionally send `returnCreditCode` and the UI's `returnCreditAmount`. The server calculates the applicable amount as the lesser of the current voucher balance and invoice total, rejects stale expected amounts, deducts the applied amount transactionally, and records the redemption. The response includes `returnCredit.appliedAmount` and `returnCredit.remainingAmount`. An unused voucher balance can be redeemed on a later sale.

---

## 4) Promotion and campaign APIs

The backend exposes management and preview routes under `/api/promotions`. Promotion eligibility and checkout calculations are performed by the backend. No frontend-supplied free quantity, promotion price, or discount is authoritative.

After deploying promotion schema changes, run `npm run migrate` before creating offers. The offer type columns are stored as `VARCHAR(40)` so MySQL does not reject supported values such as `PERCENTAGE_DISCOUNT`, `SPECIAL_PRICE`, or `FREE_GIFT`.

### Promotion preview

`GET /api/promotions/preview?productId=12&paidQuantity=10&billType=B2C`

Optional query parameters: `quantityUnit` (`PCS` or `KG`) and `companyId`.

Optional `batchId` selects a single batch for the preview. Use `batchAllocations` instead to select quantities from multiple batches; do not send both. A selected batch's sale price, MRP, and default discount take precedence over product-level B2C pricing, including when `useProductSalesPrice=true`.

The preview validates product/category and B2B/B2C eligibility, selects one promotion, checks available stock and returns batch details and estimated price. Without a selected batch it uses FIFO batch pricing; checkout re-evaluates eligibility and stock inside its transaction, so a preview is not a reservation.

Stock checks include both available batch quantities and product stock not yet
represented by batches. For a different-product gift, `giftAvailableQuantity`
also includes the gift product's unbatched stock. A preview returns insufficient
stock only when the requested paid/free quantities exceed the available total.

Example response:

```json
{
  "success": true,
  "data": {
    "product": {
      "id": 12,
      "name": "Rice",
      "paidQuantity": 10,
      "freeQuantity": 1,
      "totalStockQuantity": 11
    },
    "availableBatches": [
      {
        "id": 5,
        "batchNumber": "R-01",
        "availableQuantity": 14,
        "mrp": "100.00",
        "salePrice": "90.00"
      }
    ],
    "promotion": {
      "id": 7,
      "source": "REGULAR",
      "name": "Buy 10 Get 1",
      "type": "BUY_X_GET_Y_FREE",
      "freeQuantity": 1,
      "reason": "No eligible active campaign; selected regular offer"
    },
    "pricing": {
      "unitPrice": 90,
      "paidQuantity": 10,
      "freeQuantity": 1,
      "totalStockQuantity": 11,
      "baseRate": 900,
      "taxPercentage": 0,
      "taxAmount": 0,
      "payableAmount": 900
    }
  }
}
```

### Regular offers

Supported `offerType` values:

- `BUY_X_GET_Y_FREE`, `BUY_X_GET_Y_FREE_FIXED`, `BUY_N_GET_M_FREE`
- `PERCENTAGE_DISCOUNT`
- `FLAT_DISCOUNT`
- `SPECIAL_PRICE`
- `FREE_GIFT`

Routes:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/promotions/offers` | Create an offer |
| GET | `/api/promotions/offers` | List offers |
| GET | `/api/promotions/offers/:id` | Get offer |
| PUT | `/api/promotions/offers/:id` | Update offer, including activation via `isActive` |
| DELETE | `/api/promotions/offers/:id` | Deactivate/archive; does not hard-delete |

Example Buy 10 Get 1 payload:

```json
{
  "name": "Rice Buy 10 Get 1",
  "offerType": "BUY_X_GET_Y_FREE",
  "productId": 12,
  "buyQuantity": 10,
  "freeQuantity": 1,
  "eligibleBillType": "BOTH",
  "priority": 20,
  "startDate": "2026-11-01",
  "endDate": "2026-11-30",
  "isActive": true
}
```

Example category percentage offer:

```json
{
  "name": "Festival Grocery 10% Off",
  "offerType": "PERCENTAGE_DISCOUNT",
  "categoryId": 3,
  "discountPercentage": 10,
  "eligibleBillType": "B2C",
  "priority": 5,
  "isActive": true
}
```

For `FLAT_DISCOUNT`, set `discountAmount`; for `SPECIAL_PRICE`, set `specialPrice`; for `FREE_GIFT`, set `giftProductId` and `giftQuantity`. A buy/get offer may omit `giftProductId` to give the qualifying product itself, or set a different product as the gift. Product/category and gift product IDs are validated.

Success response: `{ "success": true, "data": { ...saved offer... } }`.

### Festival campaigns

Campaign types: `FESTIVAL`, `SEASONAL`, `SPECIAL`. Campaign product promotions are product-specific; category-wide campaign behavior is not inferred.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/promotions/campaigns` | Create a campaign |
| GET | `/api/promotions/campaigns` | List campaigns with product entries |
| GET | `/api/promotions/campaigns/:id` | Get campaign details and product entries |
| PUT | `/api/promotions/campaigns/:id` | Update campaign; set `isActive` to activate/deactivate |
| DELETE | `/api/promotions/campaigns/:id` | Deactivate/archive campaign |
| POST | `/api/promotions/campaigns/:campaignId/products` | Add one product promotion |
| PUT | `/api/promotions/campaigns/:campaignId/products/:productId` | Update a campaign product row |
| DELETE | `/api/promotions/campaigns/:campaignId/products/:productId` | Deactivate that product row |

Create campaign:

```json
{
  "name": "Pongal Special",
  "description": "Product-level festival promotions",
  "campaignType": "FESTIVAL",
  "startDate": "2027-01-10",
  "endDate": "2027-01-20",
  "priority": 100,
  "companyId": 1,
  "isActive": true
}
```

Add a campaign product (repeat for each product):

```json
{
  "productId": 12,
  "offerType": "PERCENTAGE_DISCOUNT",
  "discountPercentage": 10,
  "eligibleBillType": "BOTH",
  "isActive": true
}
```

Use the corresponding fields (`buyQuantity`/`freeQuantity`, `discountAmount`, `specialPrice`, or `giftProductId`/`giftQuantity`) for other promotion types. A campaign may have different offer types on different product rows. The same product cannot have duplicate active rows within one campaign.

### Priority and application

1. Active, date-valid and transaction-eligible campaign product, ordered by campaign priority descending, latest start date first, then campaign-product ID ascending.
2. Otherwise, eligible regular offer, ordered by offer priority descending, latest start date first, then offer ID ascending.
3. Otherwise, batch selling price (falling back to product selling price).

Only one promotion is selected per qualifying product; promotions do not stack. Buy/get grants `floor(paidQuantity / buyQuantity) * freeQuantity` gift units.

### Sales response and historical promotion application

`POST /api/sales/add-sales` revalidates the selected promotion and gift stock. Same-product free units share their qualifying sales item (with `paidQuantity`, `freeQuantity`, and `totalQuantity`). A different-product gift is a separate `GIFT` line, batch allocated and linked through the same `promoApplicationId`. All sale lines preserve their batch.

`GET /api/sales/get-sales/:id` includes `promotionApplications`; each application stores a snapshot of the promotion configuration used at checkout, so later offer edits/deactivation do not change the historical sale.

`POST /api/sales/add-sales` item requests need `productId`, `quantity`, and optional `quantityUnit`; optional `batchId` chooses one batch and optional `batchAllocations` supplies `{ "batchId": 5, "quantity": 3 }` allocations. Frontend promotion fields are ignored.

`batchAllocations[].quantity` represents the paid quantity allocated to that batch, and all allocations for the product must sum to the requested paid quantity. Same-product free units are allocated afterward from remaining FIFO batch stock. Repeated sale lines for one product are aggregated for promotion threshold evaluation before batch allocation. A product cannot mix manually allocated and FIFO-only sale lines in one request.

Sales invoice updates for invoices without promotion applications restore their previous quantities to their original batches, then allocate edited quantities to the supplied batches or FIFO. Each updated batch allocation remains a separate sales item.

### Gift stock, GST, and returns

- Batch stock is allocated FIFO first; any remainder can be fulfilled from product-level unbatched stock. Both sources are deducted transactionally, and a sale is rejected only when the requested quantity exceeds their combined available stock.
- A different-product gift can also use unbatched stock on the gift product; the preview and checkout use the same total-stock rule.
- This project is configured per the user-selected `zero_consideration` policy for promotional gift lines: the gift line stores the product tax rate but has zero taxable amount/tax. Confirm this treatment with the business’s tax/accounting adviser before production tax filings.
- Per the selected return policy, both return flows reject return requests for any sale item linked to a promotion application. An invoice with `Paid` or `Partial` status, a positive `amountPaid`, or recorded payment history cannot be cancelled; the legacy cancellation endpoint does not issue refunds. Otherwise, original batch stock is restored and invoice/promotion history is retained.
- The legacy inventory-only return endpoint does not calculate or issue refunds. The B2C return-credit flow issues store credit rather than a cash refund. Tax reversal and cash-refund workflows remain outside their contracts.

---

## 5) Inventory and batch rules

The application now supports per-batch stock, MRP, purchase price, and sale price tracking.

Rules:
- Each stock receipt creates or updates a `ProductBatch` record.
- A product can have multiple active batches with different prices and expiry dates.
- FIFO/manual allocation is used to allocate stock for sales.
- Sales and returns restore stock to the original batch.
- Batch stock is not allowed to go negative.
- Server-side transactions and row locks are used to prevent concurrent stock oversell issues.

---

## 6) GST and margin flow

The corrected backend preserves the project’s configured pricing behavior:
- `WITH_GST` and `WITHOUT_GST` are supported.
- Discounts are calculated before GST.
- GST is applied only once to the correct base price.
- Free products are evaluated as business items and are excluded from chargeable quantity logic.
- Purchase margin and profit use the batch purchase cost and the actual sales base price.

---

## 7) Business workflows

### Purchase → stock receipt → batch creation
1. Purchase item is validated.
2. Supplier billable quantity and supplier free quantity are separated.
3. A `ProductBatch` receipt is created for the product.
4. Batch-level `purchasePrice`, `mrp`, `availableQuantity`, and `expiryDate` are recorded.
5. Product aggregate stock is updated from the total received quantity in the same transaction.

### Sales creation → batch allocation → stock deduction
1. Sales request is received.
2. Product eligibility and promotion logic are checked.
3. Batch stock is allocated FIFO first, followed by any unbatched product-stock remainder.
4. Sale rows are created per allocated batch.
5. Stock movement entries are written with `SALE` movement type.
6. Totals are recalculated and invoice fields are updated.

### Return / cancellation
1. The sale item and its original batch are identified.
2. Quantity is validated against remaining returnable quantity.
3. Stock is restored to the original batch.
4. The related stock movement is written as `RETURN`.
5. Promotion-linked returns are currently rejected by the configured return policy. Invoice cancellation restores the original batch stock and retains the invoice and promotion history.

---

## Error handling patterns

The API uses standard HTTP codes:
- `200` for successful reads/updates
- `201` for successful create operations
- `400` for invalid quantity or business-rule validation
- `404` for missing invoice/product records
- `409` for idempotency or conflicting return keys
- `500` for unexpected server errors

---

## Notes

This API documentation reflects the current corrected runtime behavior. Exact field names may vary slightly by controller or model version, but the central business rules and flow remain the same across the backend’s purchase, batch, inventory, promotion, and return logic.
