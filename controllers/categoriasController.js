import { poolPromise, sql } from '../config/db.js';

export const getCategorias = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT id, nombre FROM Categorias ORDER BY nombre');
    res.json({ ok: true, categorias: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener categorías' });
  }
};