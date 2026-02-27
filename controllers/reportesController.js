import { poolPromise, sql } from '../config/db.js';


export const generarCorteOficial = async (req, res) => {
  const { periodo, creado_por } = req.body;

  if (!periodo) {
    return res.status(400).json({ ok: false, mensaje: "El nombre del periodo es obligatorio (ej. Enero 2026)" });
  }

  try {
    const pool = await poolPromise;
    
    const result = await pool.request()
      .input("periodo", sql.NVarChar, periodo)
      .input("autor", sql.NVarChar, creado_por || 'Sistema Administrativo')
      .query(`
        INSERT INTO ReportesFinancieros (mes_reportado, usuario_nombre, gasto_total, total_articulos, creado_por)
        SELECT 
          @periodo, 
          usuario_nombre, 
          SUM(CAST(total_pedido AS FLOAT)), 
          COUNT(id),
          @autor
        FROM Pedidos 
        WHERE estatus = 'AUTORIZADO'
        GROUP BY usuario_nombre
      `);
    
    res.json({ 
      ok: true, 
      mensaje: `El corte de caja para '${periodo}' se ha guardado correctamente.` 
    });
  } catch (err) {
    console.error("Error en generarCorteOficial:", err);
    res.status(500).json({ ok: false, mensaje: "Error al persistir el reporte: " + err.message });
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
          -- Lógica de Saldo Pendiente: excedente que se arrastra al siguiente mes
          CASE 
            WHEN ISNULL(SUM(CAST(P.total_pedido AS FLOAT)), 0) > ISNULL(PR.presupuesto_mensual, 0) 
            THEN ISNULL(SUM(CAST(P.total_pedido AS FLOAT)), 0) - ISNULL(PR.presupuesto_mensual, 0)
            ELSE 0 
          END as saldo_pendiente
        FROM PresupuestosPlanteles PR
        LEFT JOIN Pedidos P ON PR.usuario_nombre = P.usuario_nombre AND P.estatus = 'AUTORIZADO'
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
        -- Alerta de saldo pendiente para el Admin
        CASE 
          WHEN SUM(CAST(P.total_pedido AS FLOAT)) > ISNULL(PR.presupuesto_mensual, 0) 
          THEN SUM(CAST(P.total_pedido AS FLOAT)) - ISNULL(PR.presupuesto_mensual, 0)
          ELSE 0 
        END as saldo_pendiente
      FROM Pedidos P
      LEFT JOIN PresupuestosPlanteles PR ON P.usuario_nombre = PR.usuario_nombre
      WHERE P.estatus = 'AUTORIZADO'
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
      WHERE estatus = 'AUTORIZADO'
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
        WHERE usuario_nombre = @nombre AND estatus = 'AUTORIZADO'
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