const PaymentIn = require('../mysql-models/PaymentIn');
const PaymentOut = require('../mysql-models/PaymentOut');
const Party = require('../mysql-models/Party');
const Sale = require('../mysql-models/SalesBill');
const Purchase = require('../mysql-models/PurchaseBill');
const { Op } = require('sequelize');

// Payment In Handlers
const getPaymentsIn = async (req, res) => {
  try {
    const { partyId, saleId, startDate, endDate } = req.query;
    let whereClause = {};

    if (partyId) whereClause.partyId = partyId;
    if (saleId) whereClause.saleId = saleId;
    if (startDate && endDate) {
      whereClause.paymentDate = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }

    const payments = await PaymentIn.findAll({
      where: whereClause,
      include: [
        { model: Party, attributes: ['name'] },
        { model: Sale, attributes: ['invoiceNumber'] },
      ],
      order: [['paymentDate', 'DESC']],
    });

    return res.status(200).json(payments);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const addPaymentIn = async (req, res) => {
  try {
    const { saleId, partyId, paymentDate, amount, paymentMode, referenceNo, notes, companyId } = req.body;

    const payment = await PaymentIn.create({
      saleId,
      partyId,
      paymentDate: paymentDate || new Date(),
      amount: amount || 0,
      paymentMode: paymentMode || 'Cash',
      referenceNo,
      notes,
      companyId: companyId || 1,
    });

    // Optionally update Sale status if saleId provided
    if (saleId) {
      const sale = await Sale.findByPk(saleId);
      if (sale && sale.totalAmount <= amount) {
        await sale.update({ paymentStatus: 'Paid' });
      }
    }

    return res.status(201).json(payment);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deletePaymentIn = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await PaymentIn.findByPk(id);

    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }

    await payment.destroy();
    return res.status(200).json({ message: 'Payment In deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Payment Out Handlers
const getPaymentsOut = async (req, res) => {
  try {
    const { partyId, purchaseId, startDate, endDate } = req.query;
    let whereClause = {};

    if (partyId) whereClause.partyId = partyId;
    if (purchaseId) whereClause.purchaseId = purchaseId;
    if (startDate && endDate) {
      whereClause.paymentDate = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }

    const payments = await PaymentOut.findAll({
      where: whereClause,
      include: [
        { model: Party, attributes: ['name'] },
        { model: Purchase, attributes: ['invoiceNumber'] },
      ],
      order: [['paymentDate', 'DESC']],
    });

    return res.status(200).json(payments);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const addPaymentOut = async (req, res) => {
  try {
    const { purchaseId, partyId, paymentDate, amount, paymentMode, referenceNo, notes, companyId } = req.body;

    const payment = await PaymentOut.create({
      purchaseId,
      partyId,
      paymentDate: paymentDate || new Date(),
      amount: amount || 0,
      paymentMode: paymentMode || 'Cash',
      referenceNo,
      notes,
      companyId: companyId || 1,
    });

    if (purchaseId) {
      const purchase = await Purchase.findByPk(purchaseId);
      if (purchase && purchase.totalAmount <= amount) {
        await purchase.update({ paymentStatus: 'Paid' });
      }
    }

    return res.status(201).json(payment);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deletePaymentOut = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await PaymentOut.findByPk(id);

    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }

    await payment.destroy();
    return res.status(200).json({ message: 'Payment Out deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getPaymentsIn,
  addPaymentIn,
  deletePaymentIn,
  getPaymentsOut,
  addPaymentOut,
  deletePaymentOut,
};
