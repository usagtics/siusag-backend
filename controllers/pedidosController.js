import { poolPromise, sql } from '../config/db.js';

// 1. Obtener historial completo de pedidos
export const getPedidos = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT id, usuario_nombre, articulo_nombre, precio_unitario, total_pedido, fecha, estatus, id_solicitud, cantidad 
      FROM Pedidos 
      ORDER BY fecha DESC
    `);
    res.json({ ok: true, pedidos: result.recordset });
  } catch (err) {
    console.error("Error al obtener historial:", err);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener historial' });
  }
};

// 2. Registrar Pedido y Solicitud (Estatus Inicial: PENDIENTE)
export const registrarPedidoYTotal = async (req, res) => {
  try {
    const { usuario_nombre, articulo_nombre, precio_unitario, cantidad, plantel_id, usuario_id } = req.body;

    const numPrecio = parseFloat(precio_unitario) || 0;
    const numCantidad = parseInt(cantidad) || 0;
    const totalCalculado = numPrecio * numCantidad;

    const pool = await poolPromise;

    // PASO A: Insertar en 'Solicitudes'
    const solicitudResult = await pool.request()
      .input('u_id', sql.Int, usuario_id)
      .input('p_id', sql.Int, plantel_id)
      .input('monto', sql.Decimal(18, 2), totalCalculado)
      .query(`
        INSERT INTO Solicitudes (usuario_id, plantel_id, fecha_solicitud, estatus, total)
        OUTPUT INSERTED.id
        VALUES (@u_id, @p_id, GETDATE(), 'PENDIENTE', @monto)
      `);

    const idNuevaSolicitud = solicitudResult.recordset[0].id;

    // PASO B: Insertar en 'Pedidos' (vínculo con el folio de solicitud)
    await pool.request()
      .input('usuario', sql.NVarChar, usuario_nombre)
      .input('articulo', sql.NVarChar, articulo_nombre)
      .input('precio', sql.Decimal(18, 2), numPrecio)
      .input('total_p', sql.Decimal(18, 2), totalCalculado)
      .input('id_sol', sql.Int, idNuevaSolicitud)
      .input('cant', sql.Int, numCantidad)
      .query(`
        INSERT INTO Pedidos (usuario_nombre, articulo_nombre, precio_unitario, total_pedido, fecha, estatus, id_solicitud, cantidad) 
        VALUES (@usuario, @articulo, @precio, @total_p, GETDATE(), 'PENDIENTE', @id_sol, @cant)
      `);

    res.json({ ok: true, mensaje: `Solicitud #${idNuevaSolicitud} creada exitosamente.` });

  } catch (err) {
    console.error("Error SQL en registro:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al registrar el pedido: " + err.message });
  }
};

// 3. Reporte de gastos (Solo autorizados)
export const getReporteGastos = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT PP.usuario_nombre, ISNULL(SUM(CAST(P.total_pedido AS FLOAT)), 0) as gasto_total, COUNT(P.id) as total_articulos
      FROM PresupuestosPlanteles PP
      LEFT JOIN Pedidos P ON PP.usuario_nombre = P.usuario_nombre AND P.estatus = 'AUTORIZADO'
      GROUP BY PP.usuario_nombre
    `);
    res.json({ ok: true, reporte: result.recordset });
  } catch (err) {
    console.error("Error en reporte de gastos:", err);
    res.status(500).json({ ok: false, mensaje: 'Error al generar reporte' });
  }
};

// 4. Autorización: PROCESO CRÍTICO (Corrige el descuento doble de stock)


export const autorizarGestion = async (req, res) => {
  const { id_solicitud } = req.params;
  const pool = await poolPromise;

  console.log(`[AUTH-TRACE] Iniciando proceso para Folio: #${id_solicitud}`);

  try {
    // 1. VALIDACIÓN PREVIA DE ESTATUS
    const check = await pool.request()
      .input('id', sql.Int, id_solicitud)
      .query("SELECT estatus, total, plantel_id FROM Solicitudes WHERE id = @id");

    if (check.recordset.length === 0) {
      console.error(`[AUTH-ERROR] El folio #${id_solicitud} no existe en la base de datos.`);
      return res.status(404).json({ ok: false, mensaje: 'No existe el folio' });
    }

    const pedidoActual = check.recordset[0];
    console.log(`[AUTH-TRACE] Estatus actual en DB: ${pedidoActual.estatus}`);

    // BLOQUEO CRÍTICO: Si no es PENDIENTE, abortamos inmediatamente
    if (pedidoActual.estatus !== 'PENDIENTE') {
      console.warn(`[AUTH-WARN] Intento de re-autorización bloqueado para Folio #${id_solicitud}. Estatus: ${pedidoActual.estatus}`);
      return res.status(400).json({ ok: false, mensaje: 'Esta solicitud ya fue procesada anteriormente' });
    }

    const { total, plantel_id } = pedidoActual;

    // 2. INICIO DE TRANSACCIÓN ATÓMICA
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    console.log(`[AUTH-TRACE] Transacción SQL iniciada correctamente.`);

    try {
      
      // --- BLOQUE ELIMINADO ---
      // El descuento de presupuesto al plantel ya NO se hace aquí.
      // Se hará únicamente durante el "Cierre Mensual".
      // ------------------------

      // B. Obtención y Descuento de Stock
      const articulos = await transaction.request()
        .input('id_sol', sql.Int, id_solicitud)
        .query("SELECT articulo_nombre, cantidad FROM Pedidos WHERE id_solicitud = @id_sol");

      console.log(`[AUTH-TRACE] Artículos a descontar:`, articulos.recordset);

      for (let item of articulos.recordset) {
        console.log(`[AUTH-TRACE] -> Restando ${item.cantidad} unidades a: ${item.articulo_nombre}`);
        
        const updateStock = await transaction.request()
          .input('cant', sql.Int, item.cantidad)
          .input('nom', sql.NVarChar, item.articulo_nombre)
          .query(`
            UPDATE Articulos 
            SET stock = stock - @cant 
            OUTPUT INSERTED.stock as stockFinal
            WHERE nombre = @nom
          `);
        
        console.log(`[AUTH-TRACE] Stock actualizado para ${item.articulo_nombre}. Nuevo nivel: ${updateStock.recordset[0].stockFinal}`);
      }

      // C. CIERRE DE ESTATUS (INDISPENSABLE)
      console.log(`[AUTH-TRACE] Actualizando estatus a 'AUTORIZADO'...`);
      await transaction.request()
        .input('id', sql.Int, id_solicitud)
        .query("UPDATE Solicitudes SET estatus = 'AUTORIZADO' WHERE id = @id");

      await transaction.request()
        .input('id', sql.Int, id_solicitud)
        .query("UPDATE Pedidos SET estatus = 'AUTORIZADO' WHERE id_solicitud = @id");

      await transaction.commit();
      console.log(`[AUTH-SUCCESS] Folio #${id_solicitud} completado exitosamente.`);
      
      res.json({ ok: true, mensaje: '¡Autorización completada con éxito!' });

    } catch (innerErr) {
      console.error(`[AUTH-ROLLBACK] Error interno. Deshaciendo cambios...`, innerErr.message);
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error(`[AUTH-FATAL-ERROR] Fallo en el proceso:`, err.message);
    res.status(500).json({ ok: false, mensaje: "Error en el servidor: " + err.message });
  }
};

export const getMetricasPorPlantel = async (req, res) => {
  try {
    const { nombre } = req.params;
    const pool = await poolPromise;

    const result = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .query(`
        SELECT 
          ISNULL(PR.presupuesto_mensual, 0) as presupuesto_inicial,
          ISNULL(SUM(CAST(P.total_pedido AS FLOAT)), 0) as gasto_total
        FROM PresupuestosPlanteles PR
        LEFT JOIN Pedidos P ON PR.usuario_nombre = P.usuario_nombre AND P.estatus = 'AUTORIZADO'
        WHERE PR.usuario_nombre = @nombre
        GROUP BY PR.presupuesto_mensual
      `);

    if (result.recordset.length > 0) {
      res.json({ ok: true, metricas: result.recordset[0] });
    } else {
      res.status(404).json({ ok: false, mensaje: 'Plantel no encontrado en presupuestos' });
    }
  } catch (err) {
    console.error("Error al obtener métricas reales:", err);
    res.status(500).json({ ok: false, mensaje: 'Error del servidor al calcular métricas' });
  }
};