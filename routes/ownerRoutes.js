const express = require('express');
const router = express.Router();
const {
  getOwners,
  addOwner,
  updateOwner,
  deleteOwner,
} = require('../mysql-controllers/ownerController');

router.get('/get-Owner', getOwners);
router.post('/add-Owner', addOwner);
router.post('/update-Owner/:id', updateOwner);
router.delete('/delete-Owner/:id', deleteOwner);

module.exports = router;
