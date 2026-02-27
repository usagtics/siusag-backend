/*export const registrarConsumoDinamico = async (req, res) => {
  // Ahora recibimos TODOS los datos que manda tu Front (incluida cantidad)
  const { articulo_nombre, precio_unitario, cantidad, plantel_id, usuario_id, usuario_nombre } = req.body; 

  try {
    const pool = await poolPromise;
    
    // Calculamos el total real según la cantidad elegida
    const numPrecio = parseFloat(precio_unitario) || 0;
    const numCantidad = parseInt(cantidad) || 0;
    const totalCalculado = numPrecio * numCantidad;

    // 1. Insertamos en Solicitudes con el plantel_id dinámico
    const solResult = await pool.request()
      .input('u_id', sql.Int, usuario_id) 
      .input('p_id', sql.Int, plantel_id)
      .input('total', sql.Decimal(18, 2), totalCalculado)
      .query(`INSERT INTO Solicitudes (usuario_id, plantel_id, fecha_solicitud, estatus, total) 
              OUTPUT INSERTED.id 
              VALUES (@u_id, @p_id, GETDATE(), 'PENDIENTE', @total)`);
    
    const nuevoFolio = solResult.recordset[0].id;

    // 2. Insertamos el Pedido vinculando el Folio Y LA CANTIDAD
    await pool.request()
      .input('usuario', sql.NVarChar, usuario_nombre)
      .input('articulo', sql.NVarChar, articulo_nombre)
      .input('precio', sql.Decimal(18, 2), numPrecio)
      .input('total_p', sql.Decimal(18, 2), totalCalculado)
      .input('id_sol', sql.Int, nuevoFolio)
      .input('cant', sql.Int, numCantidad) // <--- ESTO ES LO QUE TE FALTA
      .query(`INSERT INTO Pedidos (usuario_nombre, articulo_nombre, precio_unitario, total_pedido, fecha, estatus, id_solicitud, cantidad)
              VALUES (@usuario, @articulo, @precio, @total_p, GETDATE(), 'PENDIENTE', @id_sol, @cant)`);

    res.json({ ok: true, mensaje: '¡Folio #' + nuevoFolio + ' generado con éxito!' });
  } catch (err) {
    console.error("Error SQL:", err.message);
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}; */