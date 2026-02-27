const express = require('express');
const router = express.Router();
const { pruebaConexion } = require('../controllers/testController');

router.get('/test', pruebaConexion);

module.exports = router;
