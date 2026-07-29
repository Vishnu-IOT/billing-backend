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

  // ── products ──────────────────────────────────────────────────────
  await safeAddColumn(sequelize, 'products', 'minStockLevel', 'INT NOT NULL DEFAULT 5');
  await safeAddColumn(sequelize, 'products', 'reorderLevel', 'INT NOT NULL DEFAULT 10');
  await safeAddColumn(sequelize, 'products', 'minOrderQuantity', 'INT NOT NULL DEFAULT 1');
  await safeAddColumn(sequelize, 'products', 'brandId', 'INT NULL');

  // ── sales ─────────────────────────────────────────────────────────
  await safeAddColumn(sequelize, 'sales', 'shiftId', 'INT NULL');
  await safeAddColumn(sequelize, 'sales', 'paymentDetails', 'TEXT NULL');
  await safeAddColumn(sequelize, 'sales', 'warehouseId', 'INT NOT NULL DEFAULT 1');

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
