'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('customers', 'companyId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    await queryInterface.addColumn('parties', 'companyId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    await queryInterface.addIndex('customers', ['companyId'], {
      name: 'customers_company_id_index',
    });
    await queryInterface.addIndex('parties', ['companyId'], {
      name: 'parties_company_id_index',
    });

    await queryInterface.sequelize.query(
      `UPDATE \`customers\` AS customer
       INNER JOIN (
         SELECT customerId, MIN(companyId) AS companyId
         FROM \`sales\`
         WHERE customerId IS NOT NULL AND companyId IS NOT NULL
         GROUP BY customerId
         HAVING COUNT(DISTINCT companyId) = 1
       ) AS ownership ON ownership.customerId = customer.id
       SET customer.companyId = ownership.companyId
       WHERE customer.companyId IS NULL;`
    );
    await queryInterface.sequelize.query(
      `UPDATE \`parties\` AS party
       INNER JOIN (
         SELECT partyId, MIN(companyId) AS companyId
         FROM (
           SELECT partyId, companyId FROM \`purchases\`
           WHERE partyId IS NOT NULL AND companyId IS NOT NULL
           UNION ALL
           SELECT partyId, companyId FROM \`sales\`
           WHERE partyId IS NOT NULL AND companyId IS NOT NULL
         ) AS party_transactions
         GROUP BY partyId
         HAVING COUNT(DISTINCT companyId) = 1
       ) AS ownership ON ownership.partyId = party.id
       SET party.companyId = ownership.companyId
       WHERE party.companyId IS NULL;`
    );
    await queryInterface.sequelize.query(
      `UPDATE \`customers\`
       SET companyId = (SELECT id FROM \`companies\` ORDER BY id LIMIT 1)
       WHERE companyId IS NULL
         AND (SELECT COUNT(*) FROM \`companies\`) = 1;`
    );
    await queryInterface.sequelize.query(
      `UPDATE \`parties\`
       SET companyId = (SELECT id FROM \`companies\` ORDER BY id LIMIT 1)
       WHERE companyId IS NULL
         AND (SELECT COUNT(*) FROM \`companies\`) = 1;`
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('parties', 'parties_company_id_index');
    await queryInterface.removeIndex('customers', 'customers_company_id_index');
    await queryInterface.removeColumn('parties', 'companyId');
    await queryInterface.removeColumn('customers', 'companyId');
  },
};
