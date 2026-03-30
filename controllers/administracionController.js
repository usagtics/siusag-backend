import { poolPromise, sql } from '../config/db.js';

export const generarCorteOficial = async (req, res) => {
  // 1. Recibimos el periodo, quién lo creó y el ¡NUEVO CAPITAL!
  const { periodo, nuevo_capital, creado_por } = req.body;
  
  if (!periodo || nuevo_capital === undefined) {
    return res.status(400).json({ ok: false, mensaje: "El periodo y el capital son obligatorios" });
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    
    // PASO A: Guardar Historial de lo que se gastó (Suma Autorizados y Entregados)
    const r1 = new sql.Request(transaction);
    await r1.input("per", sql.NVarChar, periodo)
            .input("aut", sql.NVarChar, creado_por || 'Admin')
            .query(`
              INSERT INTO ReportesFinancieros (mes_reportado, usuario_nombre, gasto_total, total_articulos, creado_por)
              SELECT 
                @per, 
                PR.usuario_nombre, 
                ISNULL(SUM(CAST(P.total_pedido AS FLOAT)), 0), 
                COUNT(P.id), 
                @aut
              FROM PresupuestosPlanteles PR
              LEFT JOIN Pedidos P ON PR.usuario_nombre = P.usuario_nombre AND P.estatus IN ('AUTORIZADO', 'ENTREGADO')
              GROUP BY PR.usuario_nombre
            `);

    // PASO B: Lógica de Arrastre + Inyección de Capital
    const r2 = new sql.Request(transaction);
    await r2.input("nuevoCap", sql.Decimal(18,2), nuevo_capital)
            .query(`
              UPDATE PR
              SET 
                PR.presupuesto_mensual = (PR.presupuesto_mensual - ISNULL(GastoMes.Total, 0)) + @nuevoCap,
                PR.ultima_actualizacion = GETDATE()
              FROM PresupuestosPlanteles PR
              OUTER APPLY (
                SELECT SUM(CAST(P.total_pedido AS FLOAT)) as Total
                FROM Pedidos P
                WHERE P.usuario_nombre = PR.usuario_nombre 
                  AND P.estatus IN ('AUTORIZADO', 'ENTREGADO')
              ) GastoMes
            `);

    // PASO C: Limpiar pedidos y solicitudes para el nuevo mes
    const r3 = new sql.Request(transaction);
    await r3.query("UPDATE Pedidos SET estatus = 'CERRADO' WHERE estatus IN ('AUTORIZADO', 'ENTREGADO')");

    const r4 = new sql.Request(transaction);
    await r4.query("UPDATE Solicitudes SET estatus = 'CERRADO' WHERE estatus IN ('AUTORIZADO', 'ENTREGADO')");

    await transaction.commit();
    res.json({ ok: true, mensaje: `Corte ${periodo} finalizado. Se aplicaron los remanentes y se inyectaron $${nuevo_capital}.` });

  } catch (err) {
    if (transaction && transaction.active) await transaction.rollback();
    res.status(500).json({ ok: false, mensaje: "Error: " + err.message });
  }
};

export const getMetricasPlantel = async (req, res) => {
  const { nombre } = req.params; 

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("nombre", sql.NVarChar, nombre)
      .query(`
        SELECT 
          ISNULL(PR.presupuesto_mensual, 0) as presupuesto_inicial,
          ISNULL(SUM(CAST(P.total_pedido AS FLOAT)), 0) as gasto_total,
          CASE 
            WHEN ISNULL(SUM(CAST(P.total_pedido AS FLOAT)), 0) > ISNULL(PR.presupuesto_mensual, 0) 
            THEN ISNULL(SUM(CAST(P.total_pedido AS FLOAT)), 0) - ISNULL(PR.presupuesto_mensual, 0)
            ELSE 0 
          END as saldo_pendiente
        FROM PresupuestosPlanteles PR
        LEFT JOIN Pedidos P ON PR.usuario_nombre = P.usuario_nombre AND P.estatus IN ('AUTORIZADO', 'ENTREGADO')
        WHERE PR.usuario_nombre = @nombre
        GROUP BY PR.presupuesto_mensual
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Plantel no registrado en la tabla de presupuestos" });
    }

    res.json({ ok: true, metricas: result.recordset[0] });
  } catch (err) {
    console.error("Error en getMetricasPlantel:", err);
    res.status(500).json({ ok: false, mensaje: err.message });
  }
};

export const getMetricasGenerales = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        P.usuario_nombre, 
        SUM(CAST(P.total_pedido AS FLOAT)) as gasto_total, 
        COUNT(P.id) as total_articulos,
        COUNT(DISTINCT P.id_solicitud) as total_folios,
        ISNULL(PR.presupuesto_mensual, 0) as limite_presupuesto,
        CASE 
          WHEN SUM(CAST(P.total_pedido AS FLOAT)) > ISNULL(PR.presupuesto_mensual, 0) 
          THEN SUM(CAST(P.total_pedido AS FLOAT)) - ISNULL(PR.presupuesto_mensual, 0)
          ELSE 0 
        END as saldo_pendiente
      FROM Pedidos P
      LEFT JOIN PresupuestosPlanteles PR ON P.usuario_nombre = PR.usuario_nombre
      WHERE P.estatus IN ('AUTORIZADO', 'ENTREGADO')
      GROUP BY P.usuario_nombre, PR.presupuesto_mensual
    `);
    
    res.json({ ok: true, reporte: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error al calcular métricas: " + err.message });
  }
};

export const getTopArticulos = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TOP 5 
        articulo_nombre, 
        COUNT(*) as cantidad
      FROM Pedidos
      WHERE estatus IN ('AUTORIZADO', 'ENTREGADO')
      GROUP BY articulo_nombre
      ORDER BY cantidad DESC
    `);
    res.json({ ok: true, top: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error al obtener top artículos: " + err.message });
  }
};

export const getDetallePorPlantel = async (req, res) => {
  const { nombre } = req.params;
  
  if (!nombre) {
    return res.status(400).json({ ok: false, mensaje: "El nombre del plantel es requerido" });
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("nombre", sql.NVarChar, nombre)
      .query(`
        SELECT id_solicitud, articulo_nombre, total_pedido, estatus 
        FROM Pedidos 
        WHERE usuario_nombre = @nombre AND estatus IN ('AUTORIZADO', 'ENTREGADO')
      `);
    res.json({ ok: true, detalle: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error al consultar detalle: " + err.message });
  }
};

export const getHistorialReportes = async (req, res) => {
  const { inicio, fin } = req.query; 

  try {
    const pool = await poolPromise;
    const request = pool.request();
    
    let query = `SELECT * FROM ReportesFinancieros`;

    if (inicio && fin) {
      query += ` WHERE CAST(fecha_cierre AS DATE) BETWEEN @inicio AND @fin`;
      request.input("inicio", sql.Date, inicio);
      request.input("fin", sql.Date, fin);
    }

    query += ` ORDER BY fecha_cierre DESC`;

    const result = await request.query(query);
    
    res.json({ 
      ok: true, 
      historial: result.recordset 
    });
  } catch (err) {
    console.error("Error en getHistorialReportes:", err);
    res.status(500).json({ ok: false, mensaje: err.message });
  }
};

export const getHistorialCortes = async (req, res) => {
  const { inicio, fin } = req.query; 

  try {
    const pool = await poolPromise;
    const request = pool.request();
    
    let query = `
      SELECT 
        id,
        mes_reportado, 
        usuario_nombre, 
        CAST(gasto_total AS FLOAT) as gasto_total, 
        total_articulos, 
        fecha_cierre, 
        creado_por
      FROM ReportesFinancieros
    `;

  if (inicio && fin) {
    query += ` WHERE CAST(fecha_cierre AS DATE) >= @inicio 
               AND CAST(fecha_cierre AS DATE) <= @fin `;
    request.input("inicio", sql.Date, inicio);
    request.input("fin", sql.Date, fin);
}

    query += ` ORDER BY fecha_cierre DESC `;

    const result = await request.query(query);
    
    res.json({ 
      ok: true, 
      historial: result.recordset,
      filtrado: !!(inicio && fin) 
    });

  } catch (err) {
    console.error("Error en getHistorialCortes:", err);
    res.status(500).json({ ok: false, mensaje: "Error al obtener historial: " + err.message });
  }
};

// ==========================================
// CONFIRMAR RECEPCIÓN POR EL PLANTEL
// ==========================================
export const confirmarEntrega = async (req, res) => {
  const { id_solicitud } = req.params;
  
  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Verificar el estatus
      const check = await transaction.request()
        .input('id', sql.Int, id_solicitud)
        .query("SELECT TOP 1 estatus FROM Pedidos WHERE id_solicitud = @id");

      if (check.recordset.length === 0) {
        throw new Error("El folio no existe.");
      }
      
      const estatusLimpio = String(check.recordset[0].estatus).trim().toUpperCase();

      if (estatusLimpio !== 'AUTORIZADO') {
        throw new Error(`No se puede recibir. El estatus actual en BD es: '${estatusLimpio}'`);
      }

      // 2. Cambiar a ENTREGADO en Solicitudes
      await transaction.request()
        .input('id', sql.Int, id_solicitud)
        .query("UPDATE Solicitudes SET estatus = 'ENTREGADO' WHERE id = @id");

      // 3. Cambiar a ENTREGADO en el detalle de Pedidos
      await transaction.request()
        .input('id', sql.Int, id_solicitud)
        .query("UPDATE Pedidos SET estatus = 'ENTREGADO' WHERE id_solicitud = @id");

      await transaction.commit();
      res.json({ ok: true, mensaje: "¡Acuse de recibo guardado exitosamente!" });

    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }

  } catch (err) {
    console.error("Error al confirmar entrega:", err.message);
    res.status(500).json({ ok: false, mensaje: err.message });
  }
};