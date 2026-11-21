const safeAddColumn = async (sequelize, table, column, definition) => {
  try {
    const results = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = '${table}' 
         AND COLUMN_NAME = '${column}';`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!results || results.length === 0) {
      console.log(`Adding missing column ${column} to table ${table}...`);
      await sequelize.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition};`
      );
      console.log(`Column ${column} added successfully to ${table}.`);
    }
  } catch (err) {
    console.warn(`Migration error [${table}.${column}]:`, err.message);
  }
};

const runMigrations = async (sequelize) => {
  console.log('Running safe column migrations...');

  const [loyaltyTables] = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('app_settings', 'loyalty_redemptions', 'sales');`
  );
  const loyaltyTableNames = new Set(
    loyaltyTables.map((table) => String(table.TABLE_NAME).toLowerCase())
  );
  if (loyaltyTableNames.has('app_settings')) {
    await safeAddColumn(
      sequelize,
      'app_settings',
      'loyaltyRedemptionEnabled',
      'TINYINT(1) NOT NULL DEFAULT 0'
    );
    await safeAddColumn(
      sequelize,
      'app_settings',
      'loyaltyRedemptionAmountPerPoint',
      'DECIMAL(12, 2) NOT NULL DEFAULT 1.00'
    );
    await safeAddColumn(
      sequelize,
      'app_settings',
      'loyaltyMinimumRedemptionPoints',
      'INT NOT NULL DEFAULT 1'
    );
    await safeAddColumn(
      sequelize,
      'app_settings',
      'loyaltyMaxRedemptionPercentage',
      'DECIMAL(5, 2) NOT NULL DEFAULT 100.00'
    );
  }
  if (loyaltyTableNames.has('loyalty_redemptions')) {
    await safeAddColumn(sequelize, 'loyalty_redemptions', 'saleId', 'INT NULL');
    await safeAddColumn(
      sequelize,
      'loyalty_redemptions',
      'pointsReversed',
      'INT NOT NULL DEFAULT 0'
    );
    const [redemptionIndexes] = await sequelize.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'loyalty_redemptions'
         AND INDEX_NAME = 'loyalty_redemptions_sale_unique';`
    );
    if (redemptionIndexes.length === 0) {
      await sequelize.query(
        `CREATE UNIQUE INDEX \`loyalty_redemptions_sale_unique\`
         ON \`loyalty_redemptions\` (\`saleId\`);`
      );
    }
  }
  if (loyaltyTableNames.has('sales')) {
    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS \`pos_sale_idempotencies\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`idempotencyKey\` VARCHAR(100) NOT NULL,
        \`requestHash\` CHAR(64) NOT NULL,
        \`response\` TEXT NULL,
        \`saleId\` INT NOT NULL,
        \`companyId\` INT NOT NULL,
        \`userId\` INT NOT NULL,
        \`createdAt\` DATETIME NOT NULL,
        \`updatedAt\` DATETIME NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`pos_sale_idempotencies_idempotency_key_unique\` (\`idempotencyKey\`),
        UNIQUE KEY \`pos_sale_idempotencies_sale_unique\` (\`saleId\`),
        CONSTRAINT \`fk_pos_sale_idempotencies_sale\`
          FOREIGN KEY (\`saleId\`) REFERENCES \`sales\` (\`id\`)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB;`
    );
  }

  const [counterPrerequisites] = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('companies', 'users');`
  );
  if (counterPrerequisites.length === 2) {
    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS \`pos_counters\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`companyId\` INT NOT NULL,
        \`counterName\` VARCHAR(120) NOT NULL,
        \`counterCode\` VARCHAR(40) NOT NULL,
        \`assignedUserId\` INT NULL,
        \`status\` ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
        \`createdAt\` DATETIME NOT NULL,
        \`updatedAt\` DATETIME NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_pos_counters_company_name\` (\`companyId\`, \`counterName\`),
        UNIQUE KEY \`uq_pos_counters_company_code\` (\`companyId\`, \`counterCode\`),
        UNIQUE KEY \`uq_pos_counters_company_staff\` (\`companyId\`, \`assignedUserId\`),
        KEY \`idx_pos_counters_company_status\` (\`companyId\`, \`status\`),
        CONSTRAINT \`fk_pos_counters_company\`
          FOREIGN KEY (\`companyId\`) REFERENCES \`companies\` (\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_pos_counters_assigned_user\`
          FOREIGN KEY (\`assignedUserId\`) REFERENCES \`users\` (\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB;`
    );
  }

  const shiftTables = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_shifts';`,
    { type: sequelize.QueryTypes.SELECT }
  );
  if (shiftTables.length > 0) {
    await safeAddColumn(sequelize, 'pos_shifts', 'companyId', 'INT NULL');
    await safeAddColumn(sequelize, 'pos_shifts', 'cashInTotal', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
    await safeAddColumn(sequelize, 'pos_shifts', 'cashOutTotal', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
    await safeAddColumn(sequelize, 'pos_shifts', 'cashRefundsTotal', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
    await safeAddColumn(sequelize, 'pos_shifts', 'otherSalesTotal', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
    await safeAddColumn(sequelize, 'pos_shifts', 'openingDenominations', 'TEXT NULL');
    await safeAddColumn(sequelize, 'pos_shifts', 'closingDenominations', 'TEXT NULL');
    await safeAddColumn(sequelize, 'pos_shifts', 'counterId', 'INT NULL');
    await safeAddColumn(sequelize, 'pos_shifts', 'counterNameSnapshot', 'VARCHAR(120) NULL');
    await sequelize.query(
      `UPDATE \`pos_shifts\` AS shifts
       INNER JOIN \`users\` AS users ON users.\`id\` = shifts.\`userId\`
       SET shifts.\`companyId\` = users.\`companyId\`
       WHERE shifts.\`companyId\` IS NULL;`
    );
    await sequelize.query(
      `ALTER TABLE \`pos_shifts\` MODIFY COLUMN \`companyId\` INT NOT NULL;`
    );
    const [indexes] = await sequelize.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_shifts'
         AND INDEX_NAME = 'idx_pos_shifts_company_user_status';`
    );
    if (indexes.length === 0) {
      await sequelize.query(
        `CREATE INDEX \`idx_pos_shifts_company_user_status\`
         ON \`pos_shifts\` (\`companyId\`, \`userId\`, \`status\`);`
      );
    }

    const [companyForeignKeys] = await sequelize.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_shifts'
         AND COLUMN_NAME = 'companyId' AND REFERENCED_TABLE_NAME = 'companies';`
    );
    if (companyForeignKeys.length === 0) {
      await sequelize.query(
        `ALTER TABLE \`pos_shifts\`
         ADD CONSTRAINT \`fk_pos_shifts_company\`
         FOREIGN KEY (\`companyId\`) REFERENCES \`companies\` (\`id\`)
         ON DELETE CASCADE ON UPDATE CASCADE;`
      );
    }

    const [counterIndexes] = await sequelize.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_shifts'
         AND INDEX_NAME = 'idx_pos_shifts_company_counter_status';`
    );
    if (counterIndexes.length === 0) {
      await sequelize.query(
        `CREATE INDEX \`idx_pos_shifts_company_counter_status\`
         ON \`pos_shifts\` (\`companyId\`, \`counterId\`, \`status\`);`
      );
    }

    const [counterForeignKeys] = await sequelize.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_shifts'
         AND COLUMN_NAME = 'counterId' AND REFERENCED_TABLE_NAME = 'pos_counters';`
    );
    if (counterForeignKeys.length === 0) {
      await sequelize.query(
        `ALTER TABLE \`pos_shifts\`
         ADD CONSTRAINT \`fk_pos_shifts_counter\`
         FOREIGN KEY (\`counterId\`) REFERENCES \`pos_counters\` (\`id\`)
         ON DELETE RESTRICT ON UPDATE CASCADE;`
      );
    }
  }

  // ── party GST registration and invoice tax snapshots ───────────────
  await safeAddColumn(
    sequelize,
    'parties',
    'gstRegistrationType',
    "ENUM('REGISTERED','UNREGISTERED') NULL"
  );
  await sequelize.query(
    `UPDATE \`parties\`
     SET \`gstRegistrationType\` = CASE
       WHEN UPPER(TRIM(COALESCE(\`GST\`, ''))) REGEXP
         '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
       THEN 'REGISTERED'
       ELSE 'UNREGISTERED'
     END
     WHERE \`gstRegistrationType\` IS NULL;`
  );
  await sequelize.query(
    `ALTER TABLE \`parties\`
     MODIFY COLUMN \`GST\` VARCHAR(255) NULL,
     MODIFY COLUMN \`gstRegistrationType\`
       ENUM('REGISTERED','UNREGISTERED') NOT NULL DEFAULT 'UNREGISTERED';`
  );

  await safeAddColumn(
    sequelize,
    'purchases',
    'invoiceType',
    "ENUM('GST_INVOICE','BILL_OF_SUPPLY','NON_GST_INVOICE') NULL"
  );
  await safeAddColumn(
    sequelize,
    'purchases',
    'taxType',
    "ENUM('CGST_SGST','IGST') NULL"
  );
  await safeAddColumn(
    sequelize,
    'purchases',
    'reverseCharge',
    'TINYINT(1) NOT NULL DEFAULT 0'
  );
  await safeAddColumn(
    sequelize,
    'purchases',
    'reverseChargeAmount',
    'DECIMAL(12, 2) NOT NULL DEFAULT 0.00'
  );
  await safeAddColumn(
    sequelize,
    'purchases',
    'itcEligible',
    'TINYINT(1) NOT NULL DEFAULT 0'
  );
  await safeAddColumn(sequelize, 'purchases', 'itcEligibleAmount', 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00');
  await safeAddColumn(sequelize, 'purchases', 'itcIneligibleAmount', 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00');
  await safeAddColumn(sequelize, 'purchase_items', 'productGstRate', 'DECIMAL(5, 2) NOT NULL DEFAULT 0.00');
  await safeAddColumn(
    sequelize,
    'purchase_items',
    'priceType',
    "ENUM('WITH_GST','WITHOUT_GST') NULL"
  );
  await safeAddColumn(sequelize, 'purchase_items', 'cgstRate', 'DECIMAL(5, 2) NOT NULL DEFAULT 0.00');
  await safeAddColumn(sequelize, 'purchase_items', 'cgstAmount', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
  await safeAddColumn(sequelize, 'purchase_items', 'sgstRate', 'DECIMAL(5, 2) NOT NULL DEFAULT 0.00');
  await safeAddColumn(sequelize, 'purchase_items', 'sgstAmount', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
  await safeAddColumn(sequelize, 'purchase_items', 'igstRate', 'DECIMAL(5, 2) NOT NULL DEFAULT 0.00');
  await safeAddColumn(sequelize, 'purchase_items', 'igstAmount', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
  await sequelize.query(
    `UPDATE \`purchase_items\`
     SET \`productGstRate\` = \`taxPercentage\`
     WHERE \`productGstRate\` = 0 AND \`taxPercentage\` > 0;`
  );
  await sequelize.query(
    `UPDATE \`purchase_items\` AS items
     INNER JOIN \`products\` AS products ON products.\`id\` = items.\`productId\`
     SET items.\`priceType\` = products.\`purchasePriceType\`
     WHERE items.\`priceType\` IS NULL;`
  );
  await sequelize.query(
    `UPDATE \`purchase_items\`
     SET \`priceType\` = 'WITHOUT_GST'
     WHERE \`priceType\` IS NULL;`
  );

  // ── products ──────────────────────────────────────────────────────
  await safeAddColumn(sequelize, 'products', 'minStockLevel', 'INT NOT NULL DEFAULT 5');
  await safeAddColumn(sequelize, 'products', 'reorderLevel', 'INT NOT NULL DEFAULT 10');
  await safeAddColumn(sequelize, 'products', 'minOrderQuantity', 'INT NOT NULL DEFAULT 1');
  await safeAddColumn(sequelize, 'products', 'brandId', 'INT NULL');

  // ── sales ─────────────────────────────────────────────────────────
  await safeAddColumn(sequelize, 'sales', 'shiftId', 'INT NULL');
  await safeAddColumn(sequelize, 'sales', 'paymentDetails', 'TEXT NULL');
  await safeAddColumn(sequelize, 'sales', 'warehouseId', 'INT NOT NULL DEFAULT 1');
  await safeAddColumn(sequelize, 'sales', 'companyId', 'INT NULL');
  await safeAddColumn(sequelize, 'sales', 'partyNameSnapshot', 'VARCHAR(255) NULL');
  await safeAddColumn(sequelize, 'sales', 'partyGstinSnapshot', 'VARCHAR(15) NULL');
  await safeAddColumn(
    sequelize,
    'sales',
    'partyRegistrationTypeSnapshot',
    "ENUM('REGISTERED','UNREGISTERED') NULL"
  );
  await safeAddColumn(sequelize, 'sales', 'taxTypeSnapshot', "ENUM('CGST_SGST','IGST') NULL");
  await safeAddColumn(sequelize, 'sales', 'placeOfSupplyStateCodeSnapshot', 'VARCHAR(2) NULL');
  await safeAddColumn(sequelize, 'sales', 'placeOfSupplyNameSnapshot', 'VARCHAR(80) NULL');
  await safeAddColumn(sequelize, 'sales', 'reverseCharge', 'TINYINT(1) NULL');
  await safeAddColumn(sequelize, 'sales_items', 'cgstAmount', 'DECIMAL(10, 2) NULL');
  await safeAddColumn(sequelize, 'sales_items', 'sgstAmount', 'DECIMAL(10, 2) NULL');
  await safeAddColumn(sequelize, 'sales_items', 'igstAmount', 'DECIMAL(10, 2) NULL');
  await safeAddColumn(sequelize, 'sales_items', 'cessAmount', 'DECIMAL(10, 2) NULL');
  await safeAddColumn(sequelize, 'sales_items', 'mrp', 'DECIMAL(12, 2) NULL');
  await safeAddColumn(
    sequelize,
    'sales_items',
    'priceType',
    "ENUM('WITH_GST','WITHOUT_GST') NULL"
  );
  await safeAddColumn(sequelize, 'purchases', 'companyId', 'INT NULL');
  await safeAddColumn(sequelize, 'purchases', 'partyNameSnapshot', 'VARCHAR(255) NULL');
  await safeAddColumn(sequelize, 'purchases', 'partyGstinSnapshot', 'VARCHAR(15) NULL');
  await safeAddColumn(
    sequelize,
    'purchases',
    'partyRegistrationTypeSnapshot',
    "ENUM('REGISTERED','UNREGISTERED') NULL"
  );
  await safeAddColumn(sequelize, 'purchases', 'placeOfSupplyStateCodeSnapshot', 'VARCHAR(2) NULL');
  await safeAddColumn(sequelize, 'purchases', 'placeOfSupplyNameSnapshot', 'VARCHAR(80) NULL');
  await safeAddColumn(sequelize, 'purchase_items', 'cessAmount', 'DECIMAL(10, 2) NULL');
  await sequelize.query(
    `UPDATE \`purchases\`
     SET \`companyId\` = (SELECT MIN(\`id\`) FROM \`companies\`)
     WHERE \`companyId\` IS NULL
       AND (SELECT COUNT(*) FROM \`companies\`) = 1;`
  );
  await sequelize.query(
    `UPDATE \`sales\` AS sales
     INNER JOIN \`users\` AS users ON users.\`id\` = sales.\`userId\`
     SET sales.\`companyId\` = users.\`companyId\`
     WHERE sales.\`companyId\` IS NULL;`
  );

  await require('../migrations/20261121000000-create-purchase-returns').up(
    sequelize.getQueryInterface(),
    require('sequelize')
  );
  await require('../migrations/20261123130000-add-sales-return-condition').up(
    sequelize.getQueryInterface(),
    require('sequelize')
  );

  // ── purchases ─────────────────────────────────────────────────────
  await safeAddColumn(sequelize, 'purchases', 'warehouseId', 'INT NOT NULL DEFAULT 1');

  // Modify paymentStatus ENUMs to include 'Partial'
  try {
    await sequelize.query(
      `ALTER TABLE \`sales\` MODIFY COLUMN \`paymentStatus\` ENUM('Paid','Unpaid','Partial','Overdue','Cancelled') NOT NULL DEFAULT 'Unpaid';`
    );
    await sequelize.query(
      `ALTER TABLE \`purchases\` MODIFY COLUMN \`paymentStatus\` ENUM('Paid','Unpaid','Partial','Overdue','Cancelled') NOT NULL DEFAULT 'Unpaid';`
    );
  } catch (err) {
    console.warn('ENUM migration warning:', err.message);
  }

  // Modify products.unit from ENUM to VARCHAR(20)
  try {
    await sequelize.query(
      `ALTER TABLE \`products\` MODIFY COLUMN \`unit\` VARCHAR(20) NOT NULL DEFAULT 'pcs';`
    );
  } catch (err) {
    console.warn('Unit column migration warning:', err.message);
  }

  // Remove unique constraint from products.HSNCode if it exists
  try {
    // Check if unique index exists before dropping
    const [rows] = await sequelize.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'HSNCode' AND NON_UNIQUE = 0;`
    );
    if (rows.length > 0) {
      const indexName = rows[0].INDEX_NAME;
      if (indexName !== 'PRIMARY') {
        await sequelize.query(`ALTER TABLE \`products\` DROP INDEX \`${indexName}\`;`);
        console.log('Removed unique constraint from products.HSNCode');
      }
    }
  } catch (err) {
    console.warn('HSNCode index migration warning:', err.message);
  }

  console.log('Column migrations complete.');
};

module.exports = { runMigrations };
