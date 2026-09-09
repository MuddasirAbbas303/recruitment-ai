'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'candidates',
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          firstName: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          lastName: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          fullName: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          currentTitle: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          currentCompany: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          location: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          linkedinUrl: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          email: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          phone: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          yearsOfExperience: {
            type: Sequelize.FLOAT,
            allowNull: true,
          },
          skills: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: [],
          },
          summary: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          source: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          status: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'SAVED',
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
        },
        { transaction },
      )

      const indexes = [
        {
          name: 'candidates_linkedin_url_unique',
          fields: ['linkedinUrl'],
          unique: true,
        },
        { name: 'candidates_email_idx', fields: ['email'] },
        { name: 'candidates_full_name_idx', fields: ['fullName'] },
        { name: 'candidates_current_title_idx', fields: ['currentTitle'] },
        {
          name: 'candidates_current_company_idx',
          fields: ['currentCompany'],
        },
        { name: 'candidates_location_idx', fields: ['location'] },
        { name: 'candidates_status_idx', fields: ['status'] },
      ]

      for (const index of indexes) {
        await queryInterface.addIndex('candidates', index.fields, {
          name: index.name,
          unique: index.unique ?? false,
          transaction,
        })
      }
    })
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('candidates', { transaction })
    })
  },
}
