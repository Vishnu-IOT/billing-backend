const PaymentIn = require('../mysql-models/PaymentIn');
const PaymentOut = require('../mysql-models/PaymentOut');
const Party = require('../mysql-models/Party');
const Sale = require('../mysql-models/SalesBill');
const Purchase = require('../mysql-models/PurchaseBill');
const { Op } = require('sequelize');

// Payment In Handlers
const getPaymentsIn = async (req, res) => {
  try {
    const {
      partyId,
      saleId,
      startDate,
      endDate,
    } = req.query;

    const whereClause = {};

    if (partyId) {
      whereClause.partyId = partyId;
    }

    if (saleId) {
      whereClause.saleId = saleId;
    }

    // Date filter
    if (startDate || endDate) {
      const dateFilter = {};

      if (startDate) {
        dateFilter[Op.gte] = `${startDate} 00:00:00`;
      }

      if (endDate) {
        dateFilter[Op.lte] = `${endDate} 23:59:59`;
      }

      whereClause.paymentDate = dateFilter;
    }

    const payments = await PaymentIn.findAll({
      where: whereClause,
      include: [
        {
          model: Party,
          attributes: ['name'],
        },
        {
          model: Sale,
          attributes: ['invoiceNumber'],
        },
      ],
      order: [['paymentDate', 'DESC']],
    });

    return res.status(200).json(payments);

  } catch (error) {
    console.error('Get Payments In Error:', error);

    return res.status(500).json({
      message: error.message,
    });
  }
};

const addPaymentIn = async (req, res) => {
  const transaction = await Sale.sequelize.transaction();
  try {
    const { saleId, partyId, paymentDate, amount, paymentMode, referenceNo, notes, companyId } = req.body;

    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'A positive payment amount is required' });
    }

    let newStatus;
    let newAmountPaid;
    let sale = null;

    if (saleId) {
      sale = await Sale.findByPk(saleId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!sale) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Invoice not found' });
      }

      const totalAmount = Number(sale.totalAmount || 0);
      const alreadyPaid = Number(sale.amountPaid || 0);
      newAmountPaid = alreadyPaid + paymentAmount;

      if (newAmountPaid > totalAmount) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Payment exceeds balance due. Balance due is ${(totalAmount - alreadyPaid).toFixed(2)}`,
        });
      }

      // status derived from actual cumulative payments, never from a single payment vs total
      newStatus = newAmountPaid >= totalAmount ? 'Paid' : newAmountPaid > 0 ? 'Partial' : 'Unpaid';

      await sale.update({ amountPaid: newAmountPaid, paymentStatus: newStatus }, { transaction });
    }

    const payment = await PaymentIn.create(
      {
        saleId,
        partyId,
        paymentDate: paymentDate || new Date(),
        amount: paymentAmount,
        paymentMode: paymentMode || 'Cash',
        referenceNo,
        notes,
        companyId: companyId || 1,
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      success: true,
      data: payment,
      paymentStatus: newStatus || null,
      amountPaid: newAmountPaid ?? null,
      balanceDue: sale ? Number(sale.totalAmount) - newAmountPaid : null,
    });
  } catch (error) {
    await transaction.rollback();
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
    const {
      partyId,
      purchaseId,
      startDate,
      endDate,
    } = req.query;

    const whereClause = {};

    if (partyId) {
      whereClause.partyId = partyId;
    }

    if (purchaseId) {
      whereClause.purchaseId = purchaseId;
    }

    // Date filter
    if (startDate || endDate) {
      const dateFilter = {};

      if (startDate) {
        dateFilter[Op.gte] = `${startDate} 00:00:00`;
      }

      if (endDate) {
        dateFilter[Op.lte] = `${endDate} 23:59:59`;
      }

      whereClause.paymentDate = dateFilter;
    }

    const payments = await PaymentOut.findAll({
      where: whereClause,
      include: [
        {
          model: Party,
          attributes: ['name'],
        },
        {
          model: Purchase,
          attributes: ['invoiceNumber'],
        },
      ],
      order: [['paymentDate', 'DESC']],
    });

    return res.status(200).json(payments);

  } catch (error) {
    console.error('Get Payments Out Error:', error);

    return res.status(500).json({
      message: error.message,
    });
  }
};

const addPaymentOut = async (req, res) => {
  const transaction = await Purchase.sequelize.transaction();
  try {
    const { purchaseId, partyId, paymentDate, amount, paymentMode, referenceNo, notes, companyId } = req.body;

    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'A positive payment amount is required' });
    }

    let newStatus;
    let newAmountPaid;
    let purchase = null;

    if (purchaseId) {
      purchase = await Purchase.findByPk(purchaseId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!purchase) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Purchase bill not found' });
      }

      const totalAmount = Number(purchase.totalAmount || 0);
      const alreadyPaid = Number(purchase.amountPaid || 0);
      newAmountPaid = alreadyPaid + paymentAmount;

      if (newAmountPaid > totalAmount) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Payment exceeds balance due. Balance due is ${(totalAmount - alreadyPaid).toFixed(2)}`,
        });
      }

      newStatus = newAmountPaid >= totalAmount ? 'Paid' : newAmountPaid > 0 ? 'Partial' : 'Unpaid';

      await purchase.update({ amountPaid: newAmountPaid, paymentStatus: newStatus }, { transaction });
    }

    const payment = await PaymentOut.create(
      {
        purchaseId,
        partyId,
        paymentDate: paymentDate || new Date(),
        amount: paymentAmount,
        paymentMode: paymentMode || 'Cash',
        referenceNo,
        notes,
        companyId: companyId || 1,
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      success: true,
      data: payment,
      paymentStatus: newStatus || null,
      amountPaid: newAmountPaid ?? null,
      balanceDue: purchase ? Number(purchase.totalAmount) - newAmountPaid : null,
    });
  } catch (error) {
    await transaction.rollback();
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
