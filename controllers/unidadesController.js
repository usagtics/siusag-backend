import { poolPromise } from '../config/db.js';

export const getUnidadesMedida = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT id, nombre FROM UnidadesMedida ORDER BY nombre');
    res.json({ ok: true, unidades: result.recordset });
  } catch (err) {
    console.error('Error al obtener unidades de medida:', err);
    res.status(500).json({ ok: false, mensaje: 'Error en el servidor' });
  }
};