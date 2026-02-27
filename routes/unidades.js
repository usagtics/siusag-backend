import express from 'express';
import { getUnidadesMedida } from '../controllers/unidadesController.js';

const router = express.Router();

router.get('/', getUnidadesMedida);

export default router;