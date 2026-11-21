'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    await queryInterface.addColumn('products', 'unbatchedAverageCost', {
      type: Sequelize.DECIMAL(12, 4),
      allowNull: true,
    });
    await queryInterface.addColumn('product_batches', 'inventoryUnitCost', {
      type: Sequelize.DECIMAL(12, 4),
      allowNull: true,
    });

    await sequelize.query(
      `UPDATE product_batches b
       LEFT JOIN (
         SELECT pi.productBatchId,
           SUM(
             COALESCE(pi.baseRate, 0) +
             CASE WHEN p.itcEligible = 1 THEN 0 ELSE COALESCE(pi.taxAmount, 0) END
           ) / NULLIF(SUM(COALESCE(pi.totalQuantity, pi.quantity + pi.freeQuantity)), 0) AS unitCost
         FROM purchase_items pi
         INNER JOIN purchases p ON p.id = pi.purchaseId
         WHERE pi.productBatchId IS NOT NULL
         GROUP BY pi.productBatchId
       ) acquisition ON acquisition.productBatchId = b.id
       SET b.inventoryUnitCost = COALESCE(acquisition.unitCost, b.purchasePrice, 0)
       WHERE b.inventoryUnitCost IS NULL`
    );

    await sequelize.query(
      `UPDATE products p
       LEFT JOIN (
         SELECT productId, SUM(availableQuantity) AS batchQuantity
         FROM product_batches
         GROUP BY productId
       ) b ON b.productId = p.id
       SET p.unbatchedAverageCost = CASE
         WHEN p.stockQuantity > COALESCE(b.batchQuantity, 0)
           THEN GREATEST(COALESCE(p.purchasePrice, 0), 0)
         ELSE NULL
       END
       WHERE p.unbatchedAverageCost IS NULL`
    );

  },

  async down(queryInterface) {
    await queryInterface.removeColumn('product_batches', 'inventoryUnitCost');
    await queryInterface.removeColumn('products', 'unbatchedAverageCost');
  },
};
