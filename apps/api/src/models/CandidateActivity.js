import { DataTypes, Model } from 'sequelize'
import database from '../config/database.js'
import Candidate from './Candidate.js'
import Job from './Job.js'

export const candidateActivityTypes = [
  'EMAIL_SENT',
  'LINKEDIN_MESSAGE_SENT',
  'LINKEDIN_CONNECT_SENT',
  'NOTE',
  'STATUS_CHANGED',
  'INTERVIEW_INVITED',
]

class CandidateActivity extends Model {}

CandidateActivity.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      primaryKey: true,
    },
    candidateId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Candidate,
        key: 'id',
      },
    },
    jobId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Job, key: 'id' },
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [candidateActivityTypes],
      },
    },
    channel: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize: database,
    modelName: 'CandidateActivity',
    tableName: 'candidate_activities',
    timestamps: true,
    indexes: [
      {
        name: 'candidate_activities_candidate_created_at_idx',
        fields: ['candidateId', 'createdAt'],
      },
    ],
  },
)

Candidate.hasMany(CandidateActivity, {
  as: 'activities',
  foreignKey: 'candidateId',
})
CandidateActivity.belongsTo(Candidate, {
  as: 'candidate',
  foreignKey: 'candidateId',
})
Job.hasMany(CandidateActivity, { as: 'activities', foreignKey: 'jobId' })
CandidateActivity.belongsTo(Job, { as: 'job', foreignKey: 'jobId' })

export default CandidateActivity
