const Document = require('../mysql-models/Document');
const DocumentItem = require('../mysql-models/DocumentItem');
const Party = require('../mysql-models/Party');
const Sale = require('../mysql-models/SalesBill');
const SalesItem = require('../mysql-models/Sales-Items');
const Product = require('../mysql-models/Product');
const sequelize = require('../config/sqldb');

const getDocuments = async (req, res) => {
  try {
    const { type } = req.query;
    let whereClause = {};
    if (type) {
      whereClause.documentType = type;
    }

    const documents = await Document.findAll({
      where: whereClause,
      include: [
        { model: Party, attributes: ['id', 'name', 'phone', 'email'] },
        { model: DocumentItem, as: 'items' },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json(documents);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const document = await Document.findByPk(id, {
      include: [
        { model: Party, attributes: ['id', 'name', 'phone', 'email', 'address', 'gstin'] },
        { model: DocumentItem, as: 'items' },
      ],
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    return res.status(200).json(document);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const addDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      documentType,
      documentNumber,
      date,
      validUntil,
      partyId,
      subTotal,
      taxAmount,
      discount,
      totalAmount,
      status,
      notes,
      terms,
      companyId,
      items,
    } = req.body;

    const doc = await Document.create(
      {
        documentType,
        documentNumber,
        date: date || new Date(),
        validUntil,
        partyId,
        subTotal,
        taxAmount,
        discount,
        totalAmount,
        status: status || 'draft',
        notes,
        terms,
        companyId: companyId || 1,
      },
      { transaction }
    );

    if (items && items.length > 0) {
      const docItems = items.map((item) => ({
        documentId: doc.id,
        productId: item.productId || null,
        name: item.name || item.productName,
        quantity: item.quantity || 1,
        unit: item.unit || 'pcs',
        price: item.price || 0,
        tax: item.tax || 0,
        total: item.total || 0,
      }));

      await DocumentItem.bulkCreate(docItems, { transaction });
    }

    await transaction.commit();
    return res.status(201).json(doc);
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

const updateDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const {
      documentType,
      documentNumber,
      date,
      validUntil,
      partyId,
      subTotal,
      taxAmount,
      discount,
      totalAmount,
      status,
      notes,
      terms,
      items,
    } = req.body;

    const doc = await Document.findByPk(id, { transaction });
    if (!doc) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Document not found' });
    }

    await doc.update(
      {
        documentType,
        documentNumber,
        date,
        validUntil,
        partyId,
        subTotal,
        taxAmount,
        discount,
        totalAmount,
        status,
        notes,
        terms,
      },
      { transaction }
    );

    if (items) {
      await DocumentItem.destroy({ where: { documentId: id }, transaction });

      const docItems = items.map((item) => ({
        documentId: id,
        productId: item.productId || null,
        name: item.name || item.productName,
        quantity: item.quantity || 1,
        unit: item.unit || 'pcs',
        price: item.price || 0,
        tax: item.tax || 0,
        total: item.total || 0,
      }));

      await DocumentItem.bulkCreate(docItems, { transaction });
    }

    await transaction.commit();
    return res.status(200).json({ message: 'Document updated successfully' });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

const deleteDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const doc = await Document.findByPk(id, { transaction });

    if (!doc) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Document not found' });
    }

    await DocumentItem.destroy({ where: { documentId: id }, transaction });
    await doc.destroy({ transaction });

    await transaction.commit();
    return res.status(200).json({ message: 'Document deleted successfully' });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

const convertDocumentToInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const doc = await Document.findByPk(id, {
      include: [{ model: DocumentItem, as: 'items' }],
      transaction,
    });

    if (!doc) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Document not found' });
    }

    const nextSeq = (await Sale.count({ transaction })) + 1;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(nextSeq).padStart(4, '0')}`;

    const newSale = await Sale.create(
      {
        invoiceNumber,
        partyId: doc.partyId,
        baseRate: doc.subTotal,
        tax: doc.taxAmount,
        global_discount_amount: doc.discount,
        totalAmount: doc.totalAmount,
        paymentStatus: 'Unpaid',
        bill_type: 'B2B',
        saleDate: new Date(),
      },
      { transaction }
    );

    if (doc.items && doc.items.length > 0) {
      const saleItems = doc.items.map((item) => ({
        saleId: newSale.id,
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity,
        price: item.price,
        taxAmount: (item.price * item.quantity * (item.tax || 0)) / 100,
        netRate: item.total,
      }));

      await SalesItem.bulkCreate(saleItems, { transaction });
    }

    await doc.update(
      {
        status: 'converted',
        convertedInvoiceId: newSale.id,
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(200).json({
      message: 'Document converted to Invoice successfully',
      invoice: newSale,
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDocuments,
  getDocumentById,
  addDocument,
  updateDocument,
  deleteDocument,
  convertDocumentToInvoice,
};
