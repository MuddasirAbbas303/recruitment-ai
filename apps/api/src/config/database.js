import dotenv from 'dotenv'
import { Sequelize } from 'sequelize'

dotenv.config({ quiet: true })

const database = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    dialect: 'postgres',
    logging: false,
  },
)

export default database
