
const myTest = require('../dist/helper/postgres-sql-daemon');
console.log('Starting: postgresql');
global.postgresSql = myTest.PostgresSqlDaemon.start()
