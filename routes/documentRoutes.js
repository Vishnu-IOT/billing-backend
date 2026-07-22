const express = require('express');
const router = express.Router();
const {
  getDocuments,
  getDocumentById,
  addDocument,
  updateDocument,
  deleteDocument,
  convertDocumentToInvoice,
} = require('../mysql-controllers/documentController');

router.get('/get-Documents', getDocuments);
router.get('/get-Document/:id', getDocumentById);
router.post('/add-Document', addDocument);
router.put('/update-Document/:id', updateDocument);
router.delete('/delete-Document/:id', deleteDocument);
router.post('/convert-Document/:id', convertDocumentToInvoice);

module.exports = router;
