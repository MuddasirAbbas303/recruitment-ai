const path = require('node:path')
const dotenv = require('dotenv')

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
  quiet: true,
})

const databaseConfig = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  dialect: 'postgres',
  logging: false,
  migrationStorage: 'sequelize',
  migrationStorageTableName: 'SequelizeMeta',
}

module.exports = {
  development: databaseConfig,
  test: databaseConfig,
  production: databaseConfig,
}
