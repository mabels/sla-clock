

console.log('Starting: logger');
const winston = require('winston');
global.logger = new winston.Logger({
  level: 'info',
  transports: [
    new (winston.transports.Console)(),
  ]
});

const myTest = require('../dist/test/pg-helper');
console.log('Starting: postgresql');
global.postgresSql = myTest.PostgresSqlDaemon.start()

