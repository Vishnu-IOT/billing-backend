require("dotenv").config();

module.exports = {
    development: {
        username: process.env.MYSQLUSER,
        password: process.env.MYSQL_ROOT_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQLPORT,
        dialect: "mysql",
    },
    production: {
        username: process.env.MYSQLUSER,
        password: process.env.MYSQL_ROOT_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        host: process.env.MYSQLHOST,
        port: process.env.MYSQLPORT,
        dialect: "mysql",
    },
};