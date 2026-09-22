const express = require('express');
const router = express.Router();
const {
  getDocuments,
  getDocumentById,
  getDocumentsByProduct,
  getDocumentsByParty,
  previewNextDocumentNumber,
  addDocument,
  updateDocument,
  deleteDocument,
  convertDocumentToInvoice,
} = require('../mysql-controllers/documentController');

router.get('/get-Documents', getDocuments);
router.get('/get-Documents/next-number', previewNextDocumentNumber);
router.get('/get-Document/:id', getDocumentById);
router.get('/get-Documents/by-product/:productId', getDocumentsByProduct);
router.get('/get-Documents/by-party/:partyId', getDocumentsByParty);
router.post('/add-Document', addDocument);
router.put('/update-Document/:id', updateDocument);
router.delete('/delete-Document/:id', deleteDocument);
router.post('/convert-Document/:id', convertDocumentToInvoice);

module.exports = router;
