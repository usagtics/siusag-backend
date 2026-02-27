import express from 'express';
const router = express.Router();
import * as pedidosController from '../controllers/pedidosController.js';

// 1. Registro: Solo crea el folio, NO descuenta stock
router.post('/consumir', pedidosController.registrarPedidoYTotal);

// 2. Consultas y Historial
router.get('/', pedidosController.getPedidos); 
router.get('/metricas/:nombre', pedidosController.getMetricasPorPlantel);
router.get('/totales', pedidosController.getReporteGastos);

// 3. Autorización: Única ruta permitida para descontar Stock y Capital
router.put('/autorizar/:id_solicitud', pedidosController.autorizarGestion);

export default router;