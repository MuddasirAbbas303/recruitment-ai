import { DataTypes, Model } from 'sequelize'
import database from '../config/database.js'

class Job extends Model {}

Job.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  requiredSkills: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  preferredSkills: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  minimumExperience: { type: DataTypes.FLOAT, allowNull: true },
  maximumExperience: { type: DataTypes.FLOAT, allowNull: true },
  location: { type: DataTypes.STRING, allowNull: true },
  keywords: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  excludeKeywords: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  status: { type: DataTypes.ENUM('ACTIVE', 'CLOSED'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  sequelize: database,
  modelName: 'Job',
  tableName: 'jobs',
  timestamps: true,
  indexes: [{ name: 'jobs_status_idx', fields: ['status'] }],
})

export default Job
