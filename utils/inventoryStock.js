'use strict';

const round3 = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

const nonNegativeStock = (value) => {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
};

const getUnbatchedStockQuantity = (productStockQuantity, batchAvailableQuantity) =>
  round3(Math.max(
    0,
    nonNegativeStock(productStockQuantity) -
      nonNegativeStock(batchAvailableQuantity)
  ));

const getProductAvailableQuantity = (productStockQuantity, batchAvailableQuantity) =>
  round3(Math.max(
    nonNegativeStock(productStockQuantity),
    nonNegativeStock(batchAvailableQuantity)
  ));

module.exports = {
  getUnbatchedStockQuantity,
  getProductAvailableQuantity,
};
