import { DataTypes, Model } from 'sequelize'
import database from '../config/database.js'
import Candidate from './Candidate.js'
import Job from './Job.js'

export const projectStages = [
  'SOURCED', 'SHORTLISTED', 'CONTACTED', 'RESPONDED',
  'INTERVIEW', 'HIRED', 'REJECTED',
]

class JobCandidate extends Model {}

JobCandidate.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  jobId: { type: DataTypes.UUID, allowNull: false },
  candidateId: { type: DataTypes.UUID, allowNull: false },
  status: { type: DataTypes.ENUM(...projectStages), allowNull: false, defaultValue: 'SOURCED' },
  matchScore: { type: DataTypes.FLOAT, allowNull: true },
  matchAnalysis: { type: DataTypes.JSONB, allowNull: true },
}, {
  sequelize: database,
  modelName: 'JobCandidate',
  tableName: 'job_candidates',
  timestamps: true,
  indexes: [
    { name: 'job_candidates_job_candidate_unique', unique: true, fields: ['jobId', 'candidateId'] },
    { name: 'job_candidates_job_status_idx', fields: ['jobId', 'status'] },
  ],
})

Job.hasMany(JobCandidate, { as: 'candidateLinks', foreignKey: 'jobId' })
JobCandidate.belongsTo(Job, { as: 'job', foreignKey: 'jobId' })
Candidate.hasMany(JobCandidate, { as: 'projectLinks', foreignKey: 'candidateId' })
JobCandidate.belongsTo(Candidate, { as: 'candidate', foreignKey: 'candidateId' })

export default JobCandidate
