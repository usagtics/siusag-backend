import sql from 'mssql/msnodesqlv8.js'; 
import dotenv from 'dotenv';

dotenv.config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  driver: 'msnodesqlv8',
  options: {
    trustedConnection: true,
    trustServerCertificate: true,
    enableArithAbort: true 
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('Conectado a SQL Server con autenticación Windows');
    return pool;
  })
  .catch(err => {
    console.error('Error de conexión a SQL Server:', err);
  });

export { sql, poolPromise };