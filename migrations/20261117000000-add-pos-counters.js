'use strict';

const tableNames = async (queryInterface) =>
  new Set(
    (await queryInterface.showAllTables()).map((table) =>
      String(typeof table === 'string' ? table : table.tableName).toLowerCase()
    )
  );

const indexesFor = (queryInterface, table) =>
  queryInterface.showIndex(table);

module.exports = {
  async up(queryInterface, Sequelize) {
    let tables = await tableNames(queryInterface);
    if (!tables.has('pos_counters')) {
      await queryInterface.createTable('pos_counters', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        companyId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'companies', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        counterName: { type: Sequelize.STRING(120), allowNull: false },
        counterCode: { type: Sequelize.STRING(40), allowNull: false },
        assignedUserId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        status: {
          type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
          allowNull: false,
          defaultValue: 'ACTIVE',
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    tables = await tableNames(queryInterface);
    if (tables.has('pos_counters')) {
      const indexes = await indexesFor(queryInterface, 'pos_counters');
      const ensureIndex = async (name, fields, unique = false) => {
        if (!indexes.some((index) => index.name === name)) {
          await queryInterface.addIndex('pos_counters', fields, { name, unique });
        }
      };
      await ensureIndex('uq_pos_counters_company_name', ['companyId', 'counterName'], true);
      await ensureIndex('uq_pos_counters_company_code', ['companyId', 'counterCode'], true);
      await ensureIndex('uq_pos_counters_company_staff', ['companyId', 'assignedUserId'], true);
      await ensureIndex('idx_pos_counters_company_status', ['companyId', 'status']);
    }

    tables = await tableNames(queryInterface);
    if (tables.has('pos_shifts')) {
      const columns = await queryInterface.describeTable('pos_shifts');
      if (!columns.counterId) {
        await queryInterface.addColumn('pos_shifts', 'counterId', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'pos_counters', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        });
      }
      if (!columns.counterNameSnapshot) {
        await queryInterface.addColumn('pos_shifts', 'counterNameSnapshot', {
          type: Sequelize.STRING(120),
          allowNull: true,
        });
      }
      const shiftIndexes = await indexesFor(queryInterface, 'pos_shifts');
      if (!shiftIndexes.some((index) => index.name === 'idx_pos_shifts_company_counter_status')) {
        await queryInterface.addIndex(
          'pos_shifts',
          ['companyId', 'counterId', 'status'],
          { name: 'idx_pos_shifts_company_counter_status' }
        );
      }
      const [counterForeignKeys] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_shifts'
           AND COLUMN_NAME = 'counterId' AND REFERENCED_TABLE_NAME = 'pos_counters';`
      );
      if (counterForeignKeys.length === 0) {
        await queryInterface.addConstraint('pos_shifts', {
          fields: ['counterId'],
          type: 'foreign key',
          name: 'fk_pos_shifts_counter',
          references: { table: 'pos_counters', field: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = await tableNames(queryInterface);
    if (tables.has('pos_shifts')) {
      const columns = await queryInterface.describeTable('pos_shifts');
      if (columns.counterId) await queryInterface.removeColumn('pos_shifts', 'counterId');
      if (columns.counterNameSnapshot) {
        await queryInterface.removeColumn('pos_shifts', 'counterNameSnapshot');
      }
    }
    if (tables.has('pos_counters')) await queryInterface.dropTable('pos_counters');
  },
};
