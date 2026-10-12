'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('jobs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, allowNull: false, primaryKey: true },
      title: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: false },
      requiredSkills: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      preferredSkills: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      minimumExperience: { type: Sequelize.FLOAT, allowNull: true },
      maximumExperience: { type: Sequelize.FLOAT, allowNull: true },
      location: { type: Sequelize.STRING, allowNull: true },
      keywords: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      excludeKeywords: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      status: { type: Sequelize.ENUM('ACTIVE', 'CLOSED'), allowNull: false, defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    })
    await queryInterface.addIndex('jobs', ['status'], { name: 'jobs_status_idx' })
    await queryInterface.createTable('job_candidates', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, allowNull: false, primaryKey: true },
      jobId: { type: Sequelize.UUID, allowNull: false, references: { model: 'jobs', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      candidateId: { type: Sequelize.UUID, allowNull: false, references: { model: 'candidates', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      status: { type: Sequelize.ENUM('SOURCED', 'SHORTLISTED', 'CONTACTED', 'RESPONDED', 'INTERVIEW', 'HIRED', 'REJECTED'), allowNull: false, defaultValue: 'SOURCED' },
      matchScore: { type: Sequelize.FLOAT, allowNull: true },
      matchAnalysis: { type: Sequelize.JSONB, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    })
    await queryInterface.addIndex('job_candidates', ['jobId', 'candidateId'], { unique: true, name: 'job_candidates_job_candidate_unique' })
    await queryInterface.addIndex('job_candidates', ['jobId', 'status'], { name: 'job_candidates_job_status_idx' })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('job_candidates')
    await queryInterface.dropTable('jobs')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_job_candidates_status";')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_jobs_status";')
  },
}
