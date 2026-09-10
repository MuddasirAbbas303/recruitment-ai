'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'candidate_activities',
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          candidateId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: 'candidates',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          type: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          channel: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          message: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          metadata: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: {},
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

      await queryInterface.addIndex(
        'candidate_activities',
        ['candidateId', 'createdAt'],
        {
          name: 'candidate_activities_candidate_created_at_idx',
          transaction,
        },
      )
    })
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('candidate_activities', { transaction })
    })
  },
}
