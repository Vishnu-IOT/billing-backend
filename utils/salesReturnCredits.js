'use strict';

const round2 = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const calculateReturnCreditAmount = (
  saleItem,
  quantity,
  previouslyCreditedAmount = 0
) => {
  const soldQuantity = Number(saleItem.quantity);
  const returnQuantity = Number(quantity);
  const lineAmount = Number(saleItem.netRate);
  const credited = Number(previouslyCreditedAmount);

  if (
    !Number.isFinite(soldQuantity) ||
    soldQuantity <= 0 ||
    !Number.isFinite(returnQuantity) ||
    returnQuantity <= 0 ||
    returnQuantity > soldQuantity ||
    !Number.isFinite(lineAmount) ||
    lineAmount < 0 ||
    !Number.isFinite(credited) ||
    credited < 0
  ) {
    throw new Error('Sale item and return quantities must be valid');
  }

  const remainingLineAmount = round2(Math.max(0, lineAmount - credited));
  const proportionalAmount = round2((lineAmount * returnQuantity) / soldQuantity);
  return Math.min(proportionalAmount, remainingLineAmount);
};

const calculateAppliedReturnCredit = (saleTotal, remainingCredit) => {
  const total = Number(saleTotal);
  const balance = Number(remainingCredit);
  if (
    !Number.isFinite(total) ||
    total < 0 ||
    !Number.isFinite(balance) ||
    balance < 0
  ) {
    throw new Error('Sale total and return credit balance must be valid');
  }
  return round2(Math.min(total, balance));
};

module.exports = {
  calculateReturnCreditAmount,
  calculateAppliedReturnCredit,
};
