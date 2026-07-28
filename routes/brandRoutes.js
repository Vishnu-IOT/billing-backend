const express = require('express');
const router = express.Router();
const {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand,
} = require('../mysql-controllers/brandController');

router.get('/get-Brands', getBrands);
router.post('/add-Brand', createBrand);
router.put('/update-Brand/:id', updateBrand);
router.delete('/delete-Brand/:id', deleteBrand);

module.exports = router;
