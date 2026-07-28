const express = require('express');
const router = express.Router();
const {
  getCurrentShift,
  startShift,
  endShift,
  holdCart,
  getHoldCarts,
  resumeHoldCart,
  cancelHoldCart,
} = require('../mysql-controllers/posController');

router.get('/shifts/current', getCurrentShift);
router.post('/shifts/start', startShift);
router.post('/shifts/end', endShift);

router.post('/hold', holdCart);
router.get('/hold', getHoldCarts);
router.post('/hold/:id/resume', resumeHoldCart);
router.delete('/hold/:id', cancelHoldCart);

module.exports = router;
