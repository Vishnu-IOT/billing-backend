const express = require('express');
const router = express.Router();
const {
  getVariantsByProduct,
  createVariant,
  deleteVariant,
} = require('../mysql-controllers/variantController');

router.get('/get-Variants/:productId', getVariantsByProduct);
router.post('/add-Variant', createVariant);
router.delete('/delete-Variant/:id', deleteVariant);

module.exports = router;
