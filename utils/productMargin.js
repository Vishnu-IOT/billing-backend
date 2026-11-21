'use strict';

const PRICE_TYPES = ['WITH_GST', 'WITHOUT_GST'];
const GST_RATES = [0, 5, 12, 18, 28];
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function readPrice(value, field) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${field} is required`);
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }

  return round2(amount);
}

function readGstRate(value) {
  const rate = Number(value ?? 0);
  if (!GST_RATES.includes(rate)) {
    throw new Error(`taxRate must be one of ${GST_RATES.join(', ')}`);
  }
  return rate;
}

function readPriceType(value, field) {
  const priceType = value ?? 'WITHOUT_GST';
  if (!PRICE_TYPES.includes(priceType)) {
    throw new Error(`${field} must be WITH_GST or WITHOUT_GST`);
  }
  return priceType;
}

function calculatePrice(priceValue, priceTypeValue, gstRateValue) {
  const price = readPrice(priceValue, 'price');
  const priceType = readPriceType(priceTypeValue, 'priceType');
  const gstRate = readGstRate(gstRateValue);

  if (priceType === 'WITH_GST') {
    const basePrice = round2(price / (1 + gstRate / 100));
    return {
      basePrice,
      gstAmount: round2(price - basePrice),
      totalPrice: price,
    };
  }

  const gstAmount = round2((price * gstRate) / 100);
  return {
    basePrice: price,
    gstAmount,
    totalPrice: round2(price + gstAmount),
  };
}

function resolveSalePricing(product, batch, {
  useProductSalesPrice = false,
  preferBatch = false,
  requireBatch = false,
} = {}) {
  if (requireBatch && !batch) {
    throw new Error('An eligible product batch is required for POS pricing');
  }
  if (requireBatch) {
    return {
      price: readPrice(batch.salePrice, 'batch.salePrice'),
      mrp: readPrice(batch.mrp, 'batch.mrp'),
      discountPercentage: 0,
    };
  }

  const useBatchPricing = Boolean(batch) && (!useProductSalesPrice || preferBatch);
  const discountPercentage = Number(
    (useBatchPricing ? batch.discount : product.discount) ?? 0
  );
  const price = Number(
    (useBatchPricing ? batch.salePrice : product.salesPrice) ?? 0
  );
  const effectiveDiscount = useProductSalesPrice && !useBatchPricing
    ? Math.min(Math.max(discountPercentage, 0), 100)
    : 0;

  return {
    price: round2(price * (1 - effectiveDiscount / 100)),
    mrp: Number((useBatchPricing ? batch.mrp : product.MRP) ?? 0),
    discountPercentage: useProductSalesPrice ? 0 : discountPercentage,
  };
}

function calculateInvoiceItem(item, product, direction, { disableTax = false } = {}) {
  const isPurchase = direction === 'purchase';
  const priceField = isPurchase ? 'purchasePrice' : 'salesPrice';
  const typeField = isPurchase ? 'purchasePriceType' : 'sellingPriceType';
  const inputPrice = isPurchase
    ? item.price ?? item.purchasePrice
    : item.price ?? product[priceField];
  const inputType = disableTax
    ? 'WITHOUT_GST'
    :
    item.priceType ??
    item[typeField] ??
    product[typeField] ??
    'WITHOUT_GST';
  const gstRate = disableTax ? 0 : readGstRate(product.taxRate);
  const price = readPrice(inputPrice, 'item.price');
  const hasExplicitPaidQuantity = hasOwn(item, 'paidQuantity') || hasOwn(item, 'chargeableQuantity');
  const paidQuantity = Number(item.paidQuantity ?? item.chargeableQuantity ?? item.quantity ?? 0);
  const freeQuantity = Number(item.freeQuantity ?? item.promoFreeQuantity ?? 0);
  const legacyQuantity = Number(item.quantity ?? paidQuantity);
  const chargeableQuantity = Number.isFinite(paidQuantity) && paidQuantity >= 0
    ? paidQuantity
    : legacyQuantity;
  const totalQuantity = Number(item.totalQuantity ?? (chargeableQuantity + freeQuantity));

  if (!Number.isFinite(chargeableQuantity) || chargeableQuantity < 0) {
    throw new Error('item.paidQuantity must be a non-negative number');
  }
  if (!Number.isFinite(freeQuantity) || freeQuantity < 0) {
    throw new Error('item.freeQuantity must be a non-negative number');
  }
  if (!Number.isFinite(totalQuantity) || totalQuantity < 0) {
    throw new Error('item.totalQuantity must be a non-negative number');
  }
  if (chargeableQuantity === 0 && freeQuantity === 0 && (!Number.isFinite(legacyQuantity) || legacyQuantity <= 0)) {
    throw new Error('item.quantity must be a positive number');
  }

  const billingQuantity = hasExplicitPaidQuantity
    ? chargeableQuantity
    : legacyQuantity;
  if (!Number.isFinite(billingQuantity) || billingQuantity < 0 ||
      (billingQuantity === 0 && freeQuantity === 0)) {
    throw new Error('item.quantity must be a positive number');
  }

  const submittedDiscountPercentage =
    item.discountPercentage ?? item.discountPercent;
  const hasSubmittedDiscountPercentage =
    submittedDiscountPercentage !== undefined &&
    submittedDiscountPercentage !== null;
  const discountPercentage = Number(submittedDiscountPercentage ?? 0);
  const providedDiscountAmount = Number(item.discountAmount ?? 0);
  const hasSubmittedDiscountAmount =
    item.discountAmount !== undefined && item.discountAmount !== null;
  if (
    !Number.isFinite(discountPercentage) ||
    discountPercentage < 0 ||
    discountPercentage > 100
  ) {
    throw new Error('item.discountPercentage must be between 0 and 100');
  }
  if (!Number.isFinite(providedDiscountAmount) || providedDiscountAmount < 0) {
    throw new Error('item.discountAmount must be a finite non-negative number');
  }

  const unitPricing = calculatePrice(price, inputType, gstRate);
  const baseBeforeDiscount = round2(unitPricing.basePrice * billingQuantity);
  const discountAmount = hasSubmittedDiscountAmount
    ? round2(providedDiscountAmount)
    : discountPercentage > 0
      ? round2((baseBeforeDiscount * discountPercentage) / 100)
      : 0;
  if (discountAmount > baseBeforeDiscount) {
    throw new Error('item.discountAmount cannot exceed the item taxable value');
  }
  const baseRate = round2(baseBeforeDiscount - discountAmount);
  const taxAmount = inputType === 'WITH_GST' && discountAmount === 0
    ? round2(round2(price * billingQuantity) - baseRate)
    : round2((baseRate * gstRate) / 100);

  return {
    price,
    paidQuantity: chargeableQuantity,
    freeQuantity,
    totalQuantity: totalQuantity || chargeableQuantity + freeQuantity,
    chargeableQuantity: billingQuantity,
    discountPercentage: hasSubmittedDiscountPercentage
      ? discountPercentage
      : baseBeforeDiscount === 0
        ? 0
        : round2((discountAmount / baseBeforeDiscount) * 100),
    discountAmount,
    baseRate,
    taxPercentage: gstRate,
    taxAmount,
    netRate: round2(baseRate + taxAmount),
  };
}

function calculateInvoiceTotals(
  items,
  globalDiscountPercentage = 0,
  globalDiscountAmount = 0,
  {
    discountPercentageOnBase = false,
    roundToWholeRupee = true,
  } = {}
) {
  const totalBeforeGlobalDiscount = round2(
    items.reduce((total, item) => total + item.netRate, 0)
  );
  const totalBaseBeforeGlobalDiscount = round2(
    items.reduce((total, item) => total + (Number(item.baseRate) || 0), 0)
  );
  const globalDiscountPercentageValue = Number(globalDiscountPercentage || 0);
  const globalDiscountAmountValue = Number(globalDiscountAmount || 0);
  if (
    !Number.isFinite(globalDiscountPercentageValue) ||
    globalDiscountPercentageValue < 0 ||
    globalDiscountPercentageValue > 100
  ) {
    throw new Error('global_discount_percentage must be between 0 and 100');
  }
  if (!Number.isFinite(globalDiscountAmountValue) || globalDiscountAmountValue < 0) {
    throw new Error('global_discount_amount must be a finite non-negative number');
  }

  const requestedDiscount = globalDiscountAmountValue > 0
    ? globalDiscountAmountValue
    : ((discountPercentageOnBase
      ? totalBaseBeforeGlobalDiscount
      : totalBeforeGlobalDiscount) * globalDiscountPercentageValue) / 100;
  const discountLimit = discountPercentageOnBase
    ? totalBaseBeforeGlobalDiscount
    : totalBeforeGlobalDiscount;
  if (requestedDiscount > discountLimit) {
    throw new Error('Global discount cannot exceed the invoice subtotal');
  }
  const globalDiscount = round2(requestedDiscount);

  if (globalDiscount === 0) {
    const baseRate = round2(
      items.reduce((total, item) => total + (Number(item.baseRate) || 0), 0)
    );
    const tax = round2(
      items.reduce((total, item) => total + (Number(item.taxAmount) || 0), 0)
    );
    const unroundedTotal = round2(
      items.reduce((total, item) => total + Number(item.netRate || 0), 0)
    );
    const totalAmount = roundToWholeRupee
      ? Math.round(unroundedTotal)
      : unroundedTotal;

    return {
      items,
      baseRate,
      tax,
      globalDiscountAmount: 0,
      totalAmount,
      roundOff: round2(totalAmount - unroundedTotal),
    };
  }

  if (discountPercentageOnBase && globalDiscountAmountValue === 0) {
    let allocatedBaseDiscount = 0;
    const adjustedItems = items.map((item, index) => {
      if (item.gstVerificationStatus === 'GST_PENDING') {
        return item;
      }
      const baseDiscount = index === items.length - 1
        ? round2(globalDiscount - allocatedBaseDiscount)
        : totalBaseBeforeGlobalDiscount === 0
          ? 0
          : round2((globalDiscount * item.baseRate) /
            totalBaseBeforeGlobalDiscount);
      allocatedBaseDiscount = round2(allocatedBaseDiscount + baseDiscount);

      const baseRate = round2(item.baseRate - baseDiscount);
      const taxAmount = round2((baseRate * item.taxPercentage) / 100);
      const netRate = round2(baseRate + taxAmount);
      return {
        ...item,
        discountAmount: round2(item.discountAmount + baseDiscount),
        baseRate,
        taxAmount,
        netRate,
      };
    });

    const baseRate = round2(
      adjustedItems.reduce((total, item) => total + (Number(item.baseRate) || 0), 0)
    );
    const tax = round2(
      adjustedItems.reduce((total, item) => total + (Number(item.taxAmount) || 0), 0)
    );

    const unroundedTotal = round2(
      adjustedItems.reduce((total, item) => total + Number(item.netRate || 0), 0)
    );
    const totalAmount = roundToWholeRupee
      ? Math.round(unroundedTotal)
      : unroundedTotal;

    return {
      items: adjustedItems,
      baseRate,
      tax,
      globalDiscountAmount: globalDiscount,
      totalAmount,
      roundOff: round2(totalAmount - unroundedTotal),
    };
  }

  let allocatedGrossDiscount = 0;
  const adjustedItems = items.map((item, index) => {
    const grossDiscount = index === items.length - 1
      ? round2(globalDiscount - allocatedGrossDiscount)
      : totalBeforeGlobalDiscount === 0
        ? 0
        : round2((globalDiscount * item.netRate) / totalBeforeGlobalDiscount);
    allocatedGrossDiscount = round2(allocatedGrossDiscount + grossDiscount);

    const netRate = round2(item.netRate - grossDiscount);
    if (item.gstVerificationStatus === 'GST_PENDING') {
      return {
        ...item,
        discountAmount: round2((Number(item.discountAmount) || 0) + grossDiscount),
        baseRate: 0,
        taxAmount: null,
        netRate,
      };
    }
    const baseRate = round2(netRate / (1 + item.taxPercentage / 100));
    const taxAmount = round2(netRate - baseRate);

    return {
      ...item,
      discountAmount: round2(item.discountAmount + item.baseRate - baseRate),
      baseRate,
      taxAmount,
      netRate,
    };
  });

  const baseRate = round2(
    adjustedItems.reduce((total, item) => total + (Number(item.baseRate) || 0), 0)
  );
  const tax = round2(
    adjustedItems.reduce((total, item) => total + (Number(item.taxAmount) || 0), 0)
  );

  const unroundedTotal = round2(
    adjustedItems.reduce((total, item) => total + Number(item.netRate || 0), 0)
  );
  const totalAmount = roundToWholeRupee
    ? Math.round(unroundedTotal)
    : unroundedTotal;

  return {
    items: adjustedItems,
    baseRate,
    tax,
    globalDiscountAmount: globalDiscount,
    totalAmount,
    roundOff: round2(totalAmount - unroundedTotal),
  };
}

function calculateMargin(purchaseBasePrice, sellingBasePrice) {
  const profitAmount = round2(sellingBasePrice - purchaseBasePrice);
  return {
    profitAmount,
    profitMargin: sellingBasePrice === 0
      ? null
      : round2((profitAmount / sellingBasePrice) * 100),
  };
}

function resolveProductPricing(input, current = null, { required = true } = {}) {
  const hasPurchasePrice = hasOwn(input, 'purchasePrice');
  const hasSellingPrice =
    hasOwn(input, 'sellingPrice') || hasOwn(input, 'salesPrice');
  const pricingFields = [
    'purchasePrice',
    'sellingPrice',
    'salesPrice',
    'purchasePriceType',
    'sellingPriceType',
    'taxRate',
  ];

  if (!required && !pricingFields.some((field) => hasOwn(input, field))) {
    return null;
  }

  const purchasePrice = readPrice(
    hasPurchasePrice ? input.purchasePrice : current?.purchasePrice,
    'purchasePrice'
  );
  const sellingPrice = readPrice(
    hasOwn(input, 'sellingPrice')
      ? input.sellingPrice
      : hasOwn(input, 'salesPrice')
        ? input.salesPrice
        : current?.salesPrice,
    'sellingPrice'
  );
  const taxRate = readGstRate(
    hasOwn(input, 'taxRate') ? input.taxRate : current?.taxRate
  );
  const purchasePriceType = readPriceType(
    hasOwn(input, 'purchasePriceType')
      ? input.purchasePriceType
      : current?.purchasePriceType,
    'purchasePriceType'
  );
  const sellingPriceType = readPriceType(
    hasOwn(input, 'sellingPriceType')
      ? input.sellingPriceType
      : current?.sellingPriceType,
    'sellingPriceType'
  );

  const purchase = calculatePrice(purchasePrice, purchasePriceType, taxRate);
  const selling = calculatePrice(sellingPrice, sellingPriceType, taxRate);
  const { profitAmount, profitMargin } = calculateMargin(
    purchase.basePrice,
    selling.basePrice
  );

  return {
    purchasePrice,
    salesPrice: sellingPrice,
    sellingPrice,
    purchasePriceType,
    sellingPriceType,
    taxRate: String(taxRate),
    gstRate: taxRate,
    purchaseBasePrice: purchase.basePrice,
    purchaseGSTAmount: purchase.gstAmount,
    sellingBasePrice: selling.basePrice,
    sellingGSTAmount: selling.gstAmount,
    profitAmount,
    calculatedProfit: profitAmount,
    profitMargin,
  };
}

function productWithMargin(product) {
  const data = typeof product.toJSON === 'function' ? product.toJSON() : { ...product };
  const pricing = resolveProductPricing(data);

  return {
    ...data,
    ...pricing,
  };
}

module.exports = {
  calculateMargin,
  calculatePrice,
  resolveSalePricing,
  calculateInvoiceItem,
  calculateInvoiceTotals,
  resolveProductPricing,
  productWithMargin,
};
