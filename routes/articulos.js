import express from 'express';
const router = express.Router();
import articulosController from '../controllers/articulosController.js';


router.get('/', articulosController.getArticulos);
router.post('/', articulosController.createArticulo);
router.put('/:id', articulosController.updateArticulo);
router.delete('/:id', articulosController.deleteArticulo);

// Se comenta esta ruta porque el consumo ahora es DINÁMICO a través de Pedidos
// router.put('/consumir/:id', articulosController.consumirArticulo); 

export default router;