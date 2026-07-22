const express = require('express');
const router = express.Router();
const {
  getPaymentsIn,
  addPaymentIn,
  deletePaymentIn,
  getPaymentsOut,
  addPaymentOut,
  deletePaymentOut,
} = require('../mysql-controllers/paymentController');

router.get('/in', getPaymentsIn);
router.post('/in', addPaymentIn);
router.delete('/in/:id', deletePaymentIn);

router.get('/out', getPaymentsOut);
router.post('/out', addPaymentOut);
router.delete('/out/:id', deletePaymentOut);

module.exports = router;
