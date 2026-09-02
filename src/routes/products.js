const express = require('express');
const router = express.Router();
const { createProduct, getProducts } = require('../controllers/productController');

router.get('/', getProducts);
router.post('/', createProduct);

module.exports = router;