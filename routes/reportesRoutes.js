import express from 'express';
const router = express.Router();
import { 
    getMetricasGenerales, 
    getTopArticulos, 
    getDetallePorPlantel,
    generarCorteOficial,
    getHistorialCortes,
    getMetricasPlantel 
} from '../controllers/reportesController.js';

router.get('/metricas', getMetricasGenerales);
router.get('/top-articulos', getTopArticulos);
router.get('/detalle/:nombre', getDetallePorPlantel); 
router.get('/historial', getHistorialCortes); 
router.post('/guardar-corte', generarCorteOficial); 
router.get('/metricas-plantel/:nombre', getMetricasPlantel);

export default router;