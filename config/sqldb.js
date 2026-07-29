const { Sequelize } = require("sequelize");
require("dotenv").config();

const sequelize = new Sequelize(
  process.env.MYSQL_DATABASE,  // database name
  process.env.MYSQLUSER,       // username
  process.env.MYSQL_ROOT_PASSWORD, // password
  {
    host: process.env.MYSQLHOST,
    port: process.env.MYSQLPORT,
    dialect: "mysql",
    timezone: "+05:30", // India timezone
    logging: false
  }
);

const { runMigrations } = require('./migrations');

sequelize.authenticate()
  .then(async () => {
    console.log("Connected to MySQL Database using Sequelize");
    // Step 1: Run safe column migrations (IF NOT EXISTS - idempotent)
    await runMigrations(sequelize);
    // Step 2: Sync models (creates new tables, skips existing columns)
    await sequelize.sync();
    console.log("All ERP tables synchronized successfully.");
  })
  .catch((err) => {
    console.error("Unable to connect to the database:", err);
  });

module.exports = sequelize;