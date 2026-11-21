'use strict';

const { splitTax } = require('./gstInvoiceTax');

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calculatePurchaseReturnItem = (
  purchaseItem,
  purchase,
  paidQuantity,
  previouslyReturned = {}
) => {
  const originalPaidQuantity = Number(
    purchaseItem.paidQuantity ?? purchaseItem.quantity ?? 0
  );
  const paidQty = Number(paidQuantity);
  const previouslyPaidQuantity = Number(previouslyReturned.paidQuantity || 0);
  if (!Number.isFinite(originalPaidQuantity) || originalPaidQuantity < 0) {
    throw new Error('The original purchase item has an invalid paid quantity');
  }
  if (
    !Number.isFinite(paidQty) ||
    !Number.isFinite(previouslyPaidQuantity) ||
    paidQty < 0 ||
    previouslyPaidQuantity < 0 ||
    previouslyPaidQuantity + paidQty > originalPaidQuantity
  ) {
    throw new Error('Returned paid quantity is outside the original purchase quantity');
  }

  const cumulativePaidQuantity = previouslyPaidQuantity + paidQty;
  const ratio = originalPaidQuantity > 0
    ? cumulativePaidQuantity / originalPaidQuantity
    : 0;
  const proratedDelta = (originalAmount, previousAmount) =>
    round2(round2(Number(originalAmount || 0) * ratio) - Number(previousAmount || 0));
  const taxableAmount = proratedDelta(
    purchaseItem.baseRate,
    previouslyReturned.taxableAmount
  );
  const discountAmount = proratedDelta(
    purchaseItem.discountAmount,
    previouslyReturned.discountAmount
  );
  const totalTax = proratedDelta(purchaseItem.taxAmount, previouslyReturned.totalTax);
  const totalAmount = proratedDelta(purchaseItem.netRate, previouslyReturned.totalAmount);
  const taxRate = Number(purchaseItem.taxPercentage ?? purchaseItem.productGstRate ?? 0);
  const taxType = purchase.taxType || 'CGST_SGST';
  const savedSplit = purchaseItem.igstAmount !== null &&
    purchaseItem.igstAmount !== undefined
    ? {
      cgstAmount: proratedDelta(purchaseItem.cgstAmount, previouslyReturned.cgstAmount),
      sgstAmount: proratedDelta(purchaseItem.sgstAmount, previouslyReturned.sgstAmount),
      igstAmount: proratedDelta(purchaseItem.igstAmount, previouslyReturned.igstAmount),
    }
    : {
      cgstAmount: proratedDelta(
        splitTax(Number(purchaseItem.taxAmount || 0), taxRate, taxType).cgstAmount,
        previouslyReturned.cgstAmount
      ),
      sgstAmount: proratedDelta(
        splitTax(Number(purchaseItem.taxAmount || 0), taxRate, taxType).sgstAmount,
        previouslyReturned.sgstAmount
      ),
      igstAmount: proratedDelta(
        splitTax(Number(purchaseItem.taxAmount || 0), taxRate, taxType).igstAmount,
        previouslyReturned.igstAmount
      ),
    };
  const cgstAmount = taxType === 'IGST'
    ? 0
    : round2(savedSplit.cgstAmount);
  const igstAmount = taxType === 'IGST'
    ? totalTax
    : 0;
  const split = {
    cgstAmount,
    sgstAmount: taxType === 'IGST' ? 0 : round2(totalTax - cgstAmount),
    igstAmount,
  };

  return {
    purchaseRate: Number(purchaseItem.price || 0),
    priceType: purchaseItem.priceType || 'WITHOUT_GST',
    gstPercentage: taxRate,
    discountAmount,
    taxableAmount,
    cgstAmount: split.cgstAmount,
    sgstAmount: split.sgstAmount,
    igstAmount: split.igstAmount,
    totalTax,
    totalAmount,
  };
};

const calculateReturnTotals = (items) => items.reduce(
  (totals, item) => ({
    subtotal: round2(totals.subtotal + Number(item.taxableAmount || 0)),
    discountAmount: round2(totals.discountAmount + Number(item.discountAmount || 0)),
    cgstAmount: round2(totals.cgstAmount + Number(item.cgstAmount || 0)),
    sgstAmount: round2(totals.sgstAmount + Number(item.sgstAmount || 0)),
    igstAmount: round2(totals.igstAmount + Number(item.igstAmount || 0)),
    totalTax: round2(totals.totalTax + Number(item.totalTax || 0)),
    grandTotal: round2(totals.grandTotal + Number(item.totalAmount || 0)),
  }),
  {
    subtotal: 0,
    discountAmount: 0,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    totalTax: 0,
    grandTotal: 0,
  }
);

module.exports = {
  calculatePurchaseReturnItem,
  calculateReturnTotals,
  round2,
};
