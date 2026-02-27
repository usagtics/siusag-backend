import { poolPromise, sql } from '../config/db.js';

// 1. Obtener todos los artículos con sus categorías y unidades
export const getArticulos = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`
        SELECT 
          a.*, 
          c.nombre AS categoria_nombre,
          u.nombre AS unidad_nombre
        FROM Articulos a
        LEFT JOIN Categorias c ON a.categoria_id = c.id
        LEFT JOIN UnidadesMedida u ON a.unidad_id = u.id
        ORDER BY a.nombre
      `); 
    res.json({ ok: true, articulos: result.recordset });
  } catch (err) {
    console.error('Error en getArticulos:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener artículos' });
  }
};

// 2. Crear un nuevo artículo en el catálogo maestro
export const createArticulo = async (req, res) => {
  try {
    const { nombre, categoria_id, unidad_id, presentacion, precio_unitario, stock } = req.body;

    // Validaciones de seguridad
    if (!nombre || nombre.trim().length < 3) {
      return res.status(400).json({ ok: false, mensaje: "El nombre debe tener al menos 3 caracteres" });
    }
    if (!categoria_id || !unidad_id) {
      return res.status(400).json({ ok: false, mensaje: "Categoría y Unidad son obligatorias" });
    }
    if (isNaN(precio_unitario) || precio_unitario <= 0) {
      return res.status(400).json({ ok: false, mensaje: "El precio debe ser un número mayor a 0" });
    }
    if (isNaN(stock) || stock < 0) {
      return res.status(400).json({ ok: false, mensaje: "El stock no puede ser negativo" });
    }

    const pool = await poolPromise;
    await pool.request()
      .input("nombre", sql.NVarChar, nombre.toUpperCase())
      .input("categoria_id", sql.Int, categoria_id)
      .input("unidad_id", sql.Int, unidad_id) 
      .input("presentacion", sql.NVarChar, presentacion || null) 
      .input("precio_unitario", sql.Decimal(18, 2), precio_unitario)
      .input("stock", sql.Int, stock)
      .query(`
        INSERT INTO Articulos (nombre, categoria_id, unidad_id, presentacion, precio_unitario, stock) 
        VALUES (@nombre, @categoria_id, @unidad_id, @presentacion, @precio_unitario, @stock)
      `);
    res.json({ ok: true, mensaje: "Artículo creado correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: "Error interno al crear el artículo" });
  }
};

// 3. Actualizar datos de un artículo existente
export const updateArticulo = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, categoria_id, unidad_id, presentacion, precio_unitario, stock } = req.body; 

    if (!id) return res.status(400).json({ ok: false, mensaje: "ID no proporcionado" });

    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar(255), nombre.toUpperCase())
      .input('categoria_id', sql.Int, categoria_id)
      .input('unidad_id', sql.Int, unidad_id)
      .input('presentacion', sql.NVarChar(255), presentacion)
      .input('precio_unitario', sql.Decimal(18, 2), precio_unitario)
      .input('stock', sql.Int, stock)
      .query(`
        UPDATE Articulos 
        SET nombre = @nombre, categoria_id = @categoria_id, unidad_id = @unidad_id,
            presentacion = @presentacion, precio_unitario = @precio_unitario, stock = @stock 
        WHERE id = @id;
      `);

    res.json({ ok: true, mensaje: 'Actualizado correctamente' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar' });
  }
};

// 4. Eliminar artículo del inventario
export const deleteArticulo = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM Articulos WHERE id = @id`);
    res.json({ ok: true, mensaje: 'Artículo eliminado' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar' });
  }
};

/** * FUNCIÓN DESHABILITADA (Comentada para evitar descuento doble)
 * El stock ahora se gestiona exclusivamente mediante autorizarGestion en pedidosController.js
 * export const consumirArticulo = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT nombre, precio_unitario, stock FROM Articulos WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Artículo no encontrado' });
    }
    const articulo = result.recordset[0];
    res.json({ 
      ok: true, 
      mensaje: 'Información consultada (Sin afectación de inventario)',
      articulo_nombre: articulo.nombre,
      precio: articulo.precio_unitario,
      stock_actual: articulo.stock
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al consultar artículo' });
  }
};
*/

export default { 
  getArticulos, 
  createArticulo, 
  updateArticulo, 
  deleteArticulo 
  // consumirArticulo // Se remueve del export para invalidar la ruta
};