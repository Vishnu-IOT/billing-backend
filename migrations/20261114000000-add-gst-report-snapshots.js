'use strict';

const TABLE_COLUMNS = {
  sales: {
    companyId: 'INTEGER NULL',
    partyNameSnapshot: 'VARCHAR(255) NULL',
    partyGstinSnapshot: 'VARCHAR(15) NULL',
    partyRegistrationTypeSnapshot: "ENUM('REGISTERED','UNREGISTERED') NULL",
    taxTypeSnapshot: "ENUM('CGST_SGST','IGST') NULL",
    placeOfSupplyStateCodeSnapshot: 'VARCHAR(2) NULL',
    placeOfSupplyNameSnapshot: 'VARCHAR(80) NULL',
    reverseCharge: 'TINYINT(1) NULL',
  },
  purchases: {
    companyId: 'INTEGER NULL',
    partyNameSnapshot: 'VARCHAR(255) NULL',
    partyGstinSnapshot: 'VARCHAR(15) NULL',
    partyRegistrationTypeSnapshot: "ENUM('REGISTERED','UNREGISTERED') NULL",
    placeOfSupplyStateCodeSnapshot: 'VARCHAR(2) NULL',
    placeOfSupplyNameSnapshot: 'VARCHAR(80) NULL',
  },
  sales_items: {
    cgstAmount: 'DECIMAL(10,2) NULL',
    sgstAmount: 'DECIMAL(10,2) NULL',
    igstAmount: 'DECIMAL(10,2) NULL',
    cessAmount: 'DECIMAL(10,2) NULL',
  },
  purchase_items: {
    cessAmount: 'DECIMAL(10,2) NULL',
  },
};

const tableExists = async (sequelize, table) => {
  const [rows] = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
    { replacements: { table } }
  );
  return rows.length > 0;
};

const columnExists = async (sequelize, table, column) => {
  const [rows] = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { replacements: { table, column } }
  );
  return rows.length > 0;
};

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
      if (!(await tableExists(sequelize, table))) continue;
      for (const [column, definition] of Object.entries(columns)) {
        if (!(await columnExists(sequelize, table, column))) {
          await sequelize.query(
            `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
          );
        }
      }
    }

    if (
      (await tableExists(sequelize, 'sales')) &&
      (await tableExists(sequelize, 'users'))
    ) {
      await sequelize.query(
        `UPDATE \`sales\` AS sales
         INNER JOIN \`users\` AS users ON users.\`id\` = sales.\`userId\`
         SET sales.\`companyId\` = users.\`companyId\`
         WHERE sales.\`companyId\` IS NULL`
      );
    }

    if (
      (await tableExists(sequelize, 'purchases')) &&
      (await tableExists(sequelize, 'companies'))
    ) {
      await sequelize.query(
        `UPDATE \`purchases\`
         SET \`companyId\` = (
           SELECT MIN(\`id\`) FROM \`companies\`
         )
         WHERE \`companyId\` IS NULL
           AND (SELECT COUNT(*) FROM \`companies\`) = 1`
      );
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
      if (!(await tableExists(sequelize, table))) continue;
      for (const column of Object.keys(columns).reverse()) {
        if (await columnExists(sequelize, table, column)) {
          await queryInterface.removeColumn(table, column);
        }
      }
    }
  },
};
