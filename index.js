import express from 'express';
import cors from 'cors';
import { poolPromise, sql } from './config/db.js'; 
import articulosRoutes from './routes/articulos.js';
import pedidosRoutes from './routes/pedidos.js'; 
import reportesRoutes from './routes/administracionRoutes.js';
import categoriaRoutes from './routes/categorias.js';
import unidadesRoutes from './routes/unidades.js';

const app = express();

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json()); // Necesario para que el servidor entienda el cuerpo de tus POST

// --- LOGIN (Autenticación Directa) ---
app.post("/login", async (req, res) => {
  const { nombre, password } = req.body;
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("nombre", sql.NVarChar, nombre)
      .input("password", sql.NVarChar, password)
      .query("SELECT * FROM Usuarios WHERE nombre = @nombre AND password = @password");

    if (result.recordset.length === 0) {
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrecta" });
    }

    const usuario = result.recordset[0];
    res.json({
      ok: true,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        rol: usuario.rol,
        plantel_id: usuario.plantel_id,
      },
    });
  } catch (err) {
    console.error("Error en /login:", err);
    res.status(500).json({ ok: false, mensaje: "Error en el servidor" });
  }
});


app.use("/articulos", articulosRoutes);

app.use("/pedidos", pedidosRoutes); 


app.use('/api/reportes', reportesRoutes);

app.use('/categorias', categoriaRoutes);
app.use('/unidades', unidadesRoutes);


app.use((req, res) => {
  res.status(404).json({ 
    ok: false, 
    mensaje: `La ruta ${req.originalUrl} no existe en este servidor.` 
  });
});

// --- INICIO DEL SERVIDOR ---
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Servidor USAG en: http://localhost:${PORT}`);

});