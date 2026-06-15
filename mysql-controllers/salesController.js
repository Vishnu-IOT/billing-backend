const sequelize = require('../config/sqldb');
const SalesItem = require('../mysql-models/Sales-Items');
const Sale = require('../mysql-models/SalesBill');
const Product = require('../mysql-models/Product');
const Party = require('../mysql-models/Party');
const { Op, Sequelize } = require('sequelize');
const Customer = require('../mysql-models/Customer');
const User = require('../mysql-models/Users');

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Public
const getInvoices = async (req, res) => {
  try {
    const invoices = await Sale.findAll({
      attributes: [
        'saleDate',
        'id',
        'partyId',
        'invoiceNumber',
        'totalAmount',
        'paymentStatus',
        'bill_type',
        'po_number',
        'eway_bill',
        'global_discount_percentage',
        'global_discount_amount',
        [sequelize.literal(`'Sale'`), 'type'],
      ],
      include: [
        {
          model: Party,
          attributes: ['name'],
        },
        {
          model: Customer,
          attributes: ['name'],
        },
        {
          model: User,
          attributes: ['id', 'name'],
        },
        {
          model: SalesItem,
          include: [
            {
              model: Product,
              attributes: ['name', 'HSNCode'],
            },
          ],
        },
      ],
    });

    res.status(200).json(invoices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Public
const getInvoicesByDate = async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;

    let whereClause = {};
    const now = new Date();

    if (startDate && endDate) {
      whereClause.saleDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    } else if (filter === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      whereClause.saleDate = {
        [Op.gte]: start,
        [Op.lt]: end,
      };
    } else if (filter === 'thisYear') {
      const start = new Date(now.getFullYear(), 0, 1);

      whereClause.saleDate = {
        [Op.gte]: start,
      };
    } else if (filter === 'lastYear') {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear(), 0, 1);

      whereClause.saleDate = {
        [Op.gte]: start,
        [Op.lt]: end,
      };
    } else {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      whereClause.saleDate = {
        [Op.gte]: start,
        [Op.lt]: end,
      };
    }

    const invoices = await Sale.findAll({
      where: whereClause, // ✅ ADD THIS
      attributes: [
        'saleDate',
        'id',
        'partyId',
        'tax',
        'baseRate',
        'invoiceNumber',
        'totalAmount',
        'paymentStatus',
        'bill_type',
        'po_number',
        'eway_bill',
        'global_discount_percentage',
        'global_discount_amount',
        [sequelize.literal(`'Sale'`), 'type'],
      ],
      include: [
        {
          model: Party,
          attributes: ['name'],
        },
        {
          model: Customer,
          attributes: ['name'],
        },
        {
          model: User,
          attributes: ['id', 'name'],
        },
        {
          model: SalesItem,
          include: [
            {
              model: Product,
              attributes: ['name', 'HSNCode'],
            },
          ],
        },
      ],
    });

    res.status(200).json(invoices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single invoice
// @route   GET /api/invoices/:id
// @access  Public
const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Sale.findByPk(req.params.id)
      .populate('customer', 'name email phone address')
      .populate('items.product', 'name description');

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.status(200).json(invoice);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new Customer and loyalty points
const handleB2CCustomer = async ({ phone, name, totalAmount, transaction }) => {
  if (!phone) {
    return null;
  }

  // Loyalty calculation
  // Example:
  // 1 point for every ₹100
  const loyaltyPoints = Math.floor(totalAmount / 100);

  // Check existing customer
  let customer = await Customer.findOne({
    where: {
      phone,
    },
    transaction,
  });

  // If customer not exists → create
  if (!customer) {
    customer = await Customer.create(
      {
        name: name || 'Walk-in Customer',
        phone,
        loyalty_points: loyaltyPoints,
      },
      { transaction }
    );

    return customer;
  }

  // Existing customer → update loyalty points
  await Customer.update(
    {
      loyalty_points: (customer.loyalty_points || 0) + loyaltyPoints,
    },
    {
      where: { id: customer.id },
      transaction,
    }
  );

  return customer;
};

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Public
const getCurrentFY = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // April = 3
  const startYear = m >= 3 ? y : y - 1;
  // return `${startYear}-${startYear + 1}`;
  return `${startYear}`;
};

const getFYShort = (fyYear) => {
  const [start, end] = fyYear.split('-');
  // return `${String(start).slice(-2)}/${String(end).slice(-2)}`;
  return `${String(start)}`;
  // '2025-2026' → '25/26'
};

const buildInvoiceNumber = (fyYear, seq) => {
  return `INV-${getFYShort(fyYear)}-${String(seq).padStart(4, '0')}`;
  // → INV-25/26-0003
};

// ─── Atomic invoice number from Sales table (no counter table) ────────────
const generateInvoiceNumber = async (transaction) => {
  const fyYear = getCurrentFY();
  const fyShortPattern = `INV-${getFYShort(fyYear)}-%`;

  // Count existing bills for this FY — lock rows to block concurrent reads
  const count = await Sale.count({
    where: {
      invoiceNumber: { [Op.like]: fyShortPattern },
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const nextSeq = count + 1;
  const billNumber = buildInvoiceNumber(fyYear, nextSeq);

  return { billNumber, fyYear };
};

const createInvoice = async (req, res) => {
  const transaction = await sequelize.transaction({
    isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE,
  });
  try {
    const {
      name,
      phone,
      partyId,
      userId,
      global_discount_percentage = 0,
      global_discount_amount = 0,
      baseRate,
      tax = 0,
      totalAmount,
      paymentStatus,
      saleDate,
      po_number,
      eway_bill,
      bill_type,
      items,
    } = req.body;

    if (!items || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'No invoice items' });
    }

    let customerId = null;
    if (bill_type === 'B2C') {
      const customer = await handleB2CCustomer({
        name,
        phone,
        totalAmount,
        transaction,
      });
      customerId = customer?.id || null;
    }

    const { billNumber, fyYear } = await generateInvoiceNumber(transaction);

    const invoice = await Sale.create(
      {
        invoiceNumber: billNumber,
        partyId,
        customerId,
        userId,
        global_discount_percentage,
        global_discount_amount,
        baseRate,
        tax,
        totalAmount,
        paymentStatus,
        saleDate,
        po_number,
        eway_bill,
        bill_type,
      },
      {
        transaction,
        include: Party,
      }
    );

    // Calculate subtotal and validate items
    // let subtotal = 0;
    const saleId = invoice.id;

    const processedItems = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // find product in products table
      const product = await Product.findByPk(item.productId);

      if (!product) {
        return res
          .status(404)
          .json({ message: `Product not found: ${item.productId}` });
      }

      // const price = item.price;
      // const quantity = item.quantity;

      // const total = quantity * price;

      // subtotal += total;

      await Product.decrement('stockQuantity', {
        by: item.quantity,
        where: {
          id: item.productId,
          stockQuantity: { [Op.gte]: item.quantity }, // guard: won't go negative
        },
        transaction,
      });

      processedItems.push({
        saleId: saleId,
        productId: product.id,
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        discountPercentage: item.discountPercentage,
        discountAmount: item.discountAmount,
        baseRate: item.baseRate,
        taxPercentage: item.taxPercentage,
        taxAmount: item.taxAmount,
        netRate: item.netRate,
      });
    }

    // Insert all items at once
    await SalesItem.bulkCreate(processedItems, { transaction });

    // const calculatedTotalAmount = subtotal + tax - discount;
    await transaction.commit();
    res.status(201).json(invoice);
  } catch (error) {
    await transaction.rollback();

    res.status(400).json({ message: error.message });
  }
};

// @access  Public
// @desc    Update invoice
// @route   PUT /api/invoices/:id
const updateInvoiceById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const {
      invoiceNumber,
      partyId,
      userId,
      customerId,
      global_discount_percentage = 0,
      global_discount_amount = 0,
      baseRate,
      tax = 0,
      totalAmount,
      paymentStatus,
      saleDate,
      po_number,
      eway_bill,
      bill_type,
      items,
    } = req.body;

    const invoice = await Sale.findByPk(id, { transaction });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No invoice items' });
    }

    // 1️⃣ Get existing items
    const existingItems = await SalesItem.findAll({
      where: { saleId: id },
      transaction,
    });

    // 2️⃣ Restore stock from old items
    for (const item of existingItems) {
      const product = await Product.findByPk(item.productId, { transaction });

      if (product) {
        await product.update(
          {
            stockQuantity: product.stockQuantity + item.quantity,
          },
          { transaction }
        );
      }
    }

    // 3️⃣ Delete old items
    await SalesItem.destroy({
      where: { saleId: id },
      transaction,
    });

    // 4️⃣ Insert updated items + reduce stock
    const processedItems = [];

    for (const item of items) {
      const product = await Product.findByPk(item.productId, { transaction });

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      if (product.stockQuantity < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }

      // reduce stock again
      await product.update(
        {
          stockQuantity: product.stockQuantity - item.quantity,
        },
        { transaction }
      );

      processedItems.push({
        saleId: id,
        productId: product.id,
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        discountPercentage: item.discountPercentage,
        discountAmount: item.discountAmount,
        baseRate: item.baseRate,
        taxPercentage: item.taxPercentage,
        taxAmount: item.taxAmount,
        netRate: item.netRate,
      });
    }

    await SalesItem.bulkCreate(processedItems, { transaction });

    // 5️⃣ Update invoice
    await invoice.update(
      {
        invoiceNumber,
        partyId,
        userId,
        customerId,
        global_discount_percentage,
        global_discount_amount,
        baseRate,
        tax,
        totalAmount,
        paymentStatus,
        po_number,
        eway_bill,
        bill_type,
        saleDate,
      },
      { transaction }
    );

    await transaction.commit();

    res.status(200).json({ message: 'Invoice updated successfully' });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: error.message });
  }
};

// @access  Public
// @desc    Update invoice
// @route   PUT /api/invoices/:id
const updatePaymentStatusById = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    if (!paymentStatus) {
      return res.status(404).json({ message: 'Status not found' });
    }

    const invoice = await Sale.findByPk(id);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // 5️⃣ Update invoice
    await invoice.update({
      paymentStatus,
    });

    res.status(200).json({ message: 'Payment In updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Public
const deleteInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const id = req.params.id;

    const salesInvoice = await Sale.findByPk(id, { transaction });

    if (!salesInvoice) {
      return res.status(404).json({
        message: 'Sales invoice not found',
      });
    }

    // get all items of the invoice
    const salesItems = await SalesItem.findAll({
      where: { saleId: id },
      transaction,
    });

    for (const item of salesItems) {
      const product = await Product.findByPk(item.productId, { transaction });

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      // restore stock
      await Product.update(
        {
          stockQuantity: product.stockQuantity + item.quantity,
        },
        {
          where: { id: item.productId },
        }
      );
    }

    // delete sales items
    await SalesItem.destroy({
      where: { saleId: id },
      transaction,
    });

    // delete invoice
    await Sale.destroy({
      where: { id },
      transaction,
    });

    await transaction.commit();

    res.status(200).json({
      message: 'Invoice deleted and stock restored',
    });
  } catch (error) {
    await transaction.rollback();

    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getInvoices,
  getInvoicesByDate,
  getInvoiceById,
  updatePaymentStatusById,
  createInvoice,
  deleteInvoice,
  updateInvoiceById,
};
