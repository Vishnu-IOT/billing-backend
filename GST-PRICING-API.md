# GST-aware Product Pricing and Invoice API

This guide describes the backend API contract for product purchase/selling prices and GST-aware sales and purchase bills.

## Price modes

Use one of these values for each product price:

- `WITH_GST`: The entered price already includes GST.
- `WITHOUT_GST`: The entered price is the taxable base; GST is added to it.

Purchase and selling price modes are independent. The backend uses the GST rate stored on the product.

For GST rate `r`:

- `WITHOUT_GST`: `base = entered price`; `GST = base * r / 100`; `total = base + GST`.
- `WITH_GST`: `base = entered price / (1 + r / 100)`; `GST = entered price - base`; `total = entered price`.

The backend rounds monetary calculations to two decimal places. Do not apply GST again in the frontend to values the backend has already calculated.

## Product APIs

Base path: `/api/products`

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/add-Products` | Create a product |
| `POST` | `/update-Products/:id` | Update a product |
| `GET` | `/get-Products` | List products |
| `GET` | `/get-Products/:id` | Get one product |

### Create product request

Include the usual required product fields (for example `name`, `MRP`, and `categoryId`) along with:

```json
{
  "purchasePrice": 500,
  "purchasePriceType": "WITHOUT_GST",
  "sellingPrice": 590,
  "sellingPriceType": "WITH_GST",
  "taxRate": "18"
}
```

Allowed `taxRate` values are `"0"`, `"5"`, `"12"`, `"18"`, and `"28"`. Both price-type fields accept `"WITH_GST"` or `"WITHOUT_GST"`.

`sellingPrice` is the API input name; the existing database column remains `salesPrice`. Updates recalculate the margin if either price, either price mode, or `taxRate` changes. The backend computes `profitMargin`; client-provided margin values are ignored.

### Product response pricing fields

The response preserves the stored prices and existing `salesPrice` field, and includes:

```json
{
  "purchasePrice": 500,
  "purchasePriceType": "WITHOUT_GST",
  "sellingPrice": 590,
  "salesPrice": 590,
  "sellingPriceType": "WITH_GST",
  "taxRate": "18",
  "gstRate": 18,
  "purchaseBasePrice": 500,
  "purchaseGSTAmount": 90,
  "sellingBasePrice": 500,
  "sellingGSTAmount": 90,
  "profitAmount": 0,
  "profitMargin": 0
}
```

`profitAmount` and `profitMargin` compare GST-exclusive base prices. If selling base is zero, `profitMargin` is `null`.

## Sales and purchase bill APIs

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/sales/add-sales` | Create a sales invoice |
| `PUT` | `/api/sales/updatebyid-sales/:id` | Update a sales invoice |
| `POST` | `/api/purchase/add-purchase` | Create a purchase bill |
| `PUT` | `/api/purchase/updatebyid-purchase/:id` | Update a purchase bill |

Each bill item must include `productId` and a positive `quantity`.

- For sales, the default price and mode are the product's `salesPrice` and `sellingPriceType`.
- For purchases, the default price and mode are the product's `purchasePrice` and `purchasePriceType`.
- `taxRate` is read from the product.
- If an item includes `price`, that value is used instead of the saved product price and interpreted using the product's saved mode.
- An item can override its saved mode with `priceType` (`"WITH_GST"` or `"WITHOUT_GST"`).
- Item `discountPercentage` or `discountAmount` can be provided. A global invoice discount can be passed as `global_discount_percentage` or `global_discount_amount`.
- Item `baseRate`, `taxPercentage`, `taxAmount`, `netRate`, and invoice totals are recalculated by the backend. Do not trust or calculate these as final values in the frontend.

### Sales invoice request example

The other normal sales fields, such as `userId`, `companyId`, `bill_type`, customer details, and invoice date, should also be supplied as required by the existing API.

```json
{
  "userId": 1,
  "companyId": 1,
  "bill_type": "B2C",
  "global_discount_percentage": 0,
  "global_discount_amount": 0,
  "items": [
    {
      "productId": 10,
      "productName": "GST-inclusive product",
      "quantity": 1
    },
    {
      "productId": 11,
      "productName": "GST-exclusive product",
      "quantity": 1
    }
  ]
}
```

If product 10 is `₹590 WITH_GST` at 18%, and product 11 is `₹100 WITHOUT_GST` at 18%, the backend calculates:

| Product | Entered price | Taxable value | GST | Line total |
|---|---:|---:|---:|---:|
| Product 10 | ₹590 | ₹500 | ₹90 | ₹590 |
| Product 11 | ₹100 | ₹100 | ₹18 | ₹118 |
| **Invoice** |  | **₹600** | **₹108** | **₹708** |

The same calculation applies to purchase bills, using each product's purchase price and purchase price mode.

### Invoice item response fields

Invoice items retain the existing fields and include backend-calculated values:

```json
{
  "productId": 10,
  "quantity": 1,
  "price": 590,
  "discountPercentage": 0,
  "discountAmount": 0,
  "baseRate": 500,
  "taxPercentage": 18,
  "taxAmount": 90,
  "netRate": 590
}
```

Here, `baseRate` is the taxable value after discounts, `taxAmount` is the GST after discounts, and `netRate` is the line total including GST.

The sales-create API returns a summary containing invoice ID, number, date, total, payment status, and bill type. Use `GET /api/sales/get-sales/:id` to retrieve sales invoice details. Purchase creation returns the purchase invoice header; use `GET /api/purchase/get-purchase/:id` to retrieve its details.

## Frontend integration checklist

1. Save each product's `purchasePriceType`, `sellingPriceType`, and `taxRate`.
2. Display the calculated product base/GST amounts when useful, but retain and submit the entered price.
3. When selecting a product for a bill, use the product ID and quantity; the backend can use its saved price/mode. Send `price` only when the bill needs a different price.
4. For a one-off bill-line mode change, send `priceType` with that item's `price`.
5. Display the backend-returned bill `baseRate`, `taxAmount`, `netRate`, and invoice totals. Do not add tax a second time.
6. For errors, show the API's `message` (for example, unsupported tax rates, invalid discounts, or missing product prices).
