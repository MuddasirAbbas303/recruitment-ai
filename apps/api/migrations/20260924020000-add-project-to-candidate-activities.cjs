'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('candidate_activities', 'jobId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'jobs', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    })
    await queryInterface.addIndex('candidate_activities', ['jobId', 'createdAt'], {
      name: 'candidate_activities_job_created_at_idx',
    })
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('candidate_activities', 'candidate_activities_job_created_at_idx')
    await queryInterface.removeColumn('candidate_activities', 'jobId')
  },
}
