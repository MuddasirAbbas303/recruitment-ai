import { DataTypes, Model } from 'sequelize'
import database from '../config/database.js'

class Candidate extends Model {}

Candidate.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      primaryKey: true,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    currentTitle: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    currentCompany: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    linkedinUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    yearsOfExperience: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    skills: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      validate: {
        isArray(value) {
          if (!Array.isArray(value)) {
            throw new Error('Candidate skills must be an array.')
          }
        },
      },
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    source: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'SAVED',
    },
  },
  {
    sequelize: database,
    modelName: 'Candidate',
    tableName: 'candidates',
    timestamps: true,
    indexes: [
      {
        name: 'candidates_linkedin_url_unique',
        unique: true,
        fields: ['linkedinUrl'],
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
    ],
  },
)

export default Candidate
