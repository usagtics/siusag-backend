const sql = require('mssql');
const dbConfig = require('../config/db');

const pruebaConexion = async (req, res) => {
  try {
    await sql.connect(dbConfig);
    res.json({ mensaje: 'Conexión exitosa a SQL Server' });
  } catch (error) {
    console.error('Error de conexión:', error);
    res.status(500).json({ error: 'Error al conectar con la base de datos' });
  }
};

module.exports = { pruebaConexion };
