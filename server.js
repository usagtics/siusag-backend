import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors'; 
import { connectDB } from './config/db.js';
import articulosRoutes from './routes/articulos.js';
import pedidosRoutes from './routes/pedidos.js';
import reportesRoutes from './routes/reportesRoutes.js';
import categoriaRoutes from './routes/categorias.js';
import { getUnidadesMedida } from './controllers/unidadesController.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/articulos', articulosRoutes);
app.use('/pedidos', pedidosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/categorias', categoriaRoutes);
app.get('/unidades', getUnidadesMedida);

app.listen(PORT, async () => {
    await connectDB();
    console.log(`Servidor corriendo en puerto ${PORT}`);
});