# Loyalty Points API

Base path: `/api/loyalty`

## Automatic earning configuration

Loyalty earning and POS redemption use the existing application Settings
module and its `app_settings` row. No duplicate loyalty configuration,
customer balance, or ledger is used.

### Read application settings

`GET /api/app-settings?companyId=1`

The existing response envelope and settings fields are preserved. The response
includes the loyalty fields alongside the other `AppSettings` fields:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "companyId": 1,
    "userId": null,
    "invoicePrefix": "INV",
    "invoiceYearFormat": "YY-YY",
    "invoiceSeparator": "-",
    "invoiceStartingNumber": "1",
    "billTheme": "classic",
    "termsAndConditions": "Goods once sold will not be returned.",
    "defaultDueDays": 30,
    "dateFormat": "DD/MM/YYYY",
    "showBankDetails": false,
    "showUpiQr": false,
    "showSignature": false,
    "gstRegistrationType": "Regular",
    "defaultTaxRate": "18.00",
    "taxCalculationMode": "Inclusive",
    "hsnDigits": "4",
    "roundOffInvoices": true,
    "reverseCharge": false,
    "defaultPaymentMethod": "Cash",
    "acceptedPaymentMethods": ["Cash", "UPI", "Bank Transfer", "Cheque"],
    "defaultPaymentTerms": "Immediate",
    "creditLimitWarning": false,
    "defaultCreditLimit": "50000.00",
    "paymentRoundOff": true,
    "loyaltyEnabled": true,
    "loyaltyAmountPerPoint": "100.00",
    "loyaltyPointsPerUnit": 1,
    "loyaltyRedemptionEnabled": false,
    "loyaltyRedemptionAmountPerPoint": "1.00",
    "loyaltyMaxRedemptionPercentage": "100.00",
    "printerWidth": "80",
    "autoPrint": false,
    "scannerEnabled": true,
    "cameraEnabled": true,
    "receiptHeader": null,
    "receiptFooter": "Thank you for shopping with us!",
    "showGstOnReceipt": true,
    "posGridItemDisplay": "Name + Price",
    "createdAt": "2026-11-06T00:00:00.000Z",
    "updatedAt": "2026-11-06T00:00:00.000Z"
  }
}
```

Decimal settings are returned as decimal strings by Sequelize/MySQL.

### Update application settings

`PUT /api/app-settings`

Send loyalty fields inside the existing `settings` object. Other settings are
updated only when included and remain unchanged otherwise.

```http
Authorization: Bearer YOUR_LOGIN_TOKEN
Content-Type: application/json
```

```json
{
  "companyId": 1,
  "settings": {
    "loyaltyEnabled": true,
    "loyaltyAmountPerPoint": 100,
    "loyaltyPointsPerUnit": 1,
    "loyaltyRedemptionEnabled": true,
    "loyaltyRedemptionAmountPerPoint": 1,
    "loyaltyMaxRedemptionPercentage": 25
  }
}
```

The response uses the existing format. This is a partial example; `data`
contains the full Settings record shown in the GET response, including settings
that were not changed:

```json
{
  "success": true,
  "message": "Settings updated successfully",
  "data": {
    "companyId": 1,
    "loyaltyEnabled": true,
    "loyaltyAmountPerPoint": "100.00",
    "loyaltyPointsPerUnit": 1
  }
}
```

The existing `PATCH /api/app-settings/:field` endpoint also supports these
loyalty fields using `{ "companyId": 1, "value": ... }`.

Only active Owner or Admin users may update these loyalty settings. Requests
must use the user's own company; other settings retain their existing access
behavior. Resetting application settings also requires an Owner or Admin.

Validation rules:

- `loyaltyEnabled` must be a boolean.
- `loyaltyAmountPerPoint` must be greater than zero when loyalty is enabled.
- `loyaltyAmountPerPoint` supports at most two decimal places.
- `loyaltyPointsPerUnit` must always be a positive whole number.
- `loyaltyRedemptionEnabled` must be a boolean.
- `loyaltyRedemptionAmountPerPoint` must be positive with at most two decimals.
- `loyaltyMaxRedemptionPercentage` must be between 0 and 100 with at most two
  decimals.
- Loyalty fields are validated against the resulting configuration, so a
  partial update is checked against the other currently saved values.

Invalid configuration returns HTTP `400` with the existing error envelope, for
example:

```json
{
  "success": false,
  "message": "loyaltyPointsPerUnit must be a positive whole number"
}
```

The default earning configuration is enabled with 100 purchase-value units per
point and 1 point per unit. Redemption defaults to disabled, ₹1 per point and a
100% bill cap. To disable earning or redemption without changing balances or
history, set `loyaltyEnabled` or `loyaltyRedemptionEnabled` to `false`.

### POS redemption

The POS shows a redemption control only when company redemption is enabled and
the selected customer has points available. It is unchecked by default; the
cashier must explicitly opt in and choose a whole number of points. A B2C sale
may include:

```json
{
  "redeemLoyaltyPoints": true,
  "loyaltyPointsToRedeem": 50
}
```

The client does not supply a discount amount. The sale transaction reads the
company settings again, locks the customer row, and calculates the discount
from points, the configured value per point, remaining payable after return
credit, and the maximum bill percentage. It rejects disabled, insufficient, or
over-limit redemptions and cannot reduce payable below zero. The redemption
record, `REDEEM` ledger entry, customer balance, invoice, and payment details
commit or roll back together. The sale-linked redemption is unique and tracks
partial/full point reversals.

POS sends an `Idempotency-Key` for each checkout attempt. The backend stores
the request hash and original response in `pos_sale_idempotencies` within the
sale transaction, replays a matching retry without spending points twice, and
returns `409` if the same key is reused with a different payload.

Cancelling an eligible unpaid sale restores its un-reversed redeemed points
and reverses sale-earned points atomically. Partial item returns reverse earned
and redeemed points proportionally to cumulative returned value; replaying an
idempotent return does not add another reversal. These paths use the existing
`loyalty_redemptions` and `loyalty_transactions` tables.

### How sale earning uses settings

For future eligible B2C sales, the backend reads the company's settings in the
sale transaction and computes:

`floor(eligible purchase amount / loyaltyAmountPerPoint) * loyaltyPointsPerUnit`

The eligible amount remains the existing invoice calculation's final
`totalAmount` (after discounts and current invoice rounding); a customer phone
is required by the existing B2C customer flow. For example, an eligible
₹1,000 sale at ₹500 per point and 1 point per unit earns 2 points. The existing
`EARN` ledger transaction and balance update remain atomic with the sale.
Disabling loyalty awards no points. Changing settings affects future sales
only; recorded balances and ledger history are not recalculated.

The schema migration is
`migrations/20261106010800-add-loyalty-settings-to-app-settings.js`.
Redemption configuration, sale reversal fields, and POS checkout idempotency
storage are added by
`migrations/20261117120000-configure-pos-loyalty-redemption.js`.

All loyalty routes require an active Owner, Admin, or Staff login token:

```http
Authorization: Bearer <JWT>
```

The server identifies the staff member from that token. Do not send a trusted staff ID in the request body. Owner and Admin roles can manage gifts, reverse redemptions, and make point adjustments. All three roles can view gifts/history and redeem points.

## Balance

The customer's current balance remains in `customers.loyalty_points`. Read it through the existing customer API, for example `GET /api/customers/:id`, or through the response to a redemption.

## Gift catalogue

### List active gifts

`GET /api/loyalty/gifts`

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": 7,
      "name": "Coffee voucher",
      "description": "One coffee voucher",
      "pointsRequired": 80,
      "rewardType": "PRODUCT",
      "rewardValue": null,
      "isActive": true
    }
  ]
}
```

### Create a gift (Owner/Admin)

`POST /api/loyalty/gifts`

```json
{
  "name": "Coffee voucher",
  "description": "One coffee voucher",
  "pointsRequired": 80,
  "rewardType": "PRODUCT",
  "rewardValue": null
}
```

### Update or deactivate a gift (Owner/Admin)

`PATCH /api/loyalty/gifts/:giftId`

```json
{
  "pointsRequired": 90,
  "isActive": false
}
```

Gifts are deactivated rather than deleted, so previous redemption references remain valid.

## Manual reward redemption

`POST /api/loyalty/redeem/manual`

```json
{
  "customerId": 25,
  "pointsToRedeem": 50,
  "rewardType": "CASH_DISCOUNT",
  "rewardDescription": "₹100 bill discount",
  "rewardValue": 100,
  "reason": "Customer loyalty reward"
}
```

`rewardType`, `rewardValue`, and `reason` are optional; `rewardDescription` is required. `rewardValue` is for reporting only; points are not converted to currency.

Successful response (`201`):

```json
{
  "success": true,
  "data": {
    "redemptionId": 101,
    "customerId": 25,
    "pointsRedeemed": 50,
    "redemptionMethod": "MANUAL",
    "giftId": null,
    "rewardType": "CASH_DISCOUNT",
    "rewardDescription": "₹100 bill discount",
    "rewardValue": "100.00",
    "reason": "Customer loyalty reward",
    "performedBy": 3,
    "remainingPoints": 70,
    "status": "COMPLETED",
    "replayed": false
  }
}
```

## Gift redemption

`POST /api/loyalty/redeem/gift`

```json
{
  "customerId": 25,
  "giftId": 7,
  "reason": "Customer selected voucher"
}
```

The server reads the gift's required points, reward type, description, and value from the active catalogue. The response has the same shape as manual redemption, with `redemptionMethod: "GIFT"` and the selected `giftId`.

## Idempotent requests

For either redemption endpoint, optionally send an `Idempotency-Key` header or `idempotencyKey` body property (maximum 100 characters). Repeating the same key for the same customer returns the existing redemption instead of deducting points again. A redemption response has `replayed: true` when it is returned for a repeated request.

## Transaction history

`GET /api/loyalty/customers/:customerId/transactions?limit=50&offset=0`

Returns the current customer balance and newest-first ledger entries. `limit` is clamped to 1–100.

Response shape:

```json
{
  "success": true,
  "data": {
    "customer": {
      "id": 25,
      "name": "Customer",
      "phone": "9000000000",
      "loyalty_points": 70
    },
    "count": 2,
    "transactions": [
      {
        "id": 201,
        "transactionType": "REDEEM",
        "pointsDelta": -50,
        "balanceAfter": 70,
        "description": "₹100 bill discount",
        "rewardType": "CASH_DISCOUNT",
        "redemption": {
          "id": 101,
          "redemptionMethod": "MANUAL",
          "giftId": null,
          "rewardDescription": "₹100 bill discount",
          "rewardType": "CASH_DISCOUNT",
          "rewardValue": "100.00",
          "reason": "Customer loyalty reward",
          "status": "COMPLETED"
        },
        "performedByUser": {
          "id": 3,
          "name": "Staff Member",
          "email": "staff@example.com"
        },
        "createdAt": "2026-11-06T00:00:00.000Z"
      }
    ]
  }
}
```

Ledger transaction types are:

- `EARN`: points earned, including points automatically awarded on a successful B2C sale.
- `REDEEM`: points spent on a gift or manually recorded reward; `pointsDelta` is negative.
- `ADJUSTMENT`: authorized correction; `pointsDelta` may be positive or negative.
- `REVERSAL`: points restored for a reversed redemption; `pointsDelta` is positive.

`pointsDelta` is signed. `balanceAfter` records the resulting balance for that event.

## Point adjustment (Owner/Admin)

`POST /api/loyalty/customers/:customerId/adjustments`

```json
{
  "pointsAdjustment": -10,
  "reason": "Correcting a points entry"
}
```

`pointsAdjustment` must be a non-zero integer. The adjustment is rejected if it would make the balance negative. The API records an `ADJUSTMENT` ledger entry; it does not edit or delete previous ledger entries.

## Reverse a redemption (Owner/Admin)

`POST /api/loyalty/redemptions/:redemptionId/reverse`

Optionally send an `Idempotency-Key` header. Only a `COMPLETED` redemption can be reversed. Reversal restores the redeemed points, marks the existing redemption `REVERSED`, and adds a `REVERSAL` ledger entry. It preserves the original redemption and its history.

Successful response:

```json
{
  "success": true,
  "data": {
    "redemptionId": 101,
    "customerId": 25,
    "pointsRestored": 50,
    "remainingPoints": 120,
    "status": "REVERSED"
  }
}
```

## Validation and errors

Error responses use this shape:

```json
{
  "success": false,
  "message": "Insufficient loyalty points",
  "availablePoints": 20
}
```

Relevant status codes:

- `400`: invalid/missing fields, non-positive or fractional points, invalid reward type/value, insufficient balance, or an adjustment that would make the balance negative.
- `401`: missing, invalid, or expired token; inactive or unknown user.
- `403`: role is not permitted for the requested operation.
- `404`: customer or active gift does not exist.
- `409`: redemption already reversed or idempotency conflict.
- `500`: unexpected database/server failure.

Each balance-changing operation locks the customer row and updates the customer balance and ledger/redemption records in one Sequelize transaction. Concurrent redemptions for the same customer are serialized and cannot spend the same points twice.

## Sequelize data model

The migration `20261106000000-create-loyalty-redemptions-and-ledger.js` creates:

- `loyalty_gifts`: `id`, `name`, `description`, `pointsRequired`, `rewardType`, `rewardValue`, `isActive`, timestamps.
- `loyalty_redemptions`: `id`, `customerId`, nullable `saleId`, `pointsRedeemed`, `pointsReversed`, `redemptionMethod` (`GIFT`, `MANUAL`), nullable `giftId`, nullable `rewardType`, `rewardDescription`, nullable `rewardValue`, nullable `reason`, `performedBy`, `status` (`COMPLETED`, `REVERSED`), nullable `idempotencyKey`, timestamps.
- `loyalty_transactions`: `id`, `customerId`, `transactionType` (`EARN`, `REDEEM`, `ADJUSTMENT`, `REVERSAL`), signed `pointsDelta`, `balanceAfter`, nullable `description`, nullable `rewardType`, nullable `redemptionId`, nullable `saleId`, nullable `performedBy`, nullable `idempotencyKey`, timestamps.

The existing customer `loyalty_points` field remains the current balance. Redemption history is retained; corrections use reversals or adjustments rather than deleting completed records.
