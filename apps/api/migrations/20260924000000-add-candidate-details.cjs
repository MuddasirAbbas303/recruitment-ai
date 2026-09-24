'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn('candidates', 'employmentHistory', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      }, { transaction })
      await queryInterface.addColumn('candidates', 'fieldOrigins', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      }, { transaction })
    })
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('candidates', 'fieldOrigins', { transaction })
      await queryInterface.removeColumn('candidates', 'employmentHistory', { transaction })
    })
  },
}
