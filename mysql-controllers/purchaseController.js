const sequelize = require('../config/sqldb');
const PurchaseItem = require('../mysql-models/Purchase-Items');
const Purchase = require('../mysql-models/PurchaseBill');
const Product = require('../mysql-models/Product');
const Party = require('../mysql-models/Party');
const { Op } = require('sequelize');

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Public
const getPurchase = async (req, res) => {
  try {
    const invoices = await Purchase.findAll({
      include: [
        {
          model: Party,
          attributes: ['name', 'email', 'phone'],
        },
        {
          model: PurchaseItem,
          include: [
            {
              model: Product,
              attributes: ['name', 'HSNCode'],
            },
          ],
        },
      ],
    });

    return res.status(200).json(invoices);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Public
const getPurchaseInvoicesByDate = async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;

    let whereClause = {};
    const now = new Date();

    if (startDate && endDate) {
      whereClause.purchaseDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    } else if (filter === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      whereClause.purchaseDate = {
        [Op.gte]: start,
        [Op.lt]: end,
      };
    } else if (filter === 'thisYear') {
      const start = new Date(now.getFullYear(), 0, 1);

      whereClause.purchaseDate = {
        [Op.gte]: start,
      };
    } else if (filter === 'lastYear') {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear(), 0, 1);

      whereClause.purchaseDate = {
        [Op.gte]: start,
        [Op.lt]: end,
      };
    } else {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      whereClause.purchaseDate = {
        [Op.gte]: start,
        [Op.lt]: end,
      };
    }

    const invoices = await Purchase.findAll({
      where: whereClause, // ✅ ADD THIS
      attributes: [
        'purchaseDate',
        'id',
        'partyId',
        'tax',
        'baseRate',
        'invoiceNumber',
        'totalAmount',
        'paymentStatus',
        [sequelize.literal(`'Purchase'`), 'type'],
      ],
      include: [
        {
          model: Party,
          attributes: ['name'],
        },
        {
          model: PurchaseItem,
          include: [
            {
              model: Product,
              attributes: ['name', 'HSNCode'],
            },
          ],
        },
      ],
    });

    return res.status(200).json(invoices);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get single invoice
// @route   GET /api/invoices/:id
// @access  Public
const getPurchaseById = async (req, res) => {
  try {
    const invoice = await Purchase.findById(req.params.id)
      .populate('customer', 'name email phone address')
      .populate('items.product', 'name description');

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    return res.status(200).json(invoice);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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

    const invoice = await Purchase.findByPk(id);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // 5️⃣ Update invoice
    await invoice.update({
      paymentStatus,
    });

    return res.status(200).json({ message: 'Payment Out updated successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Public
const createPurchase = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      invoiceNumber,
      partyId,
      global_discount_percentage = 0,
      global_discount_amount = 0,
      baseRate,
      tax = 0,
      totalAmount,
      paymentStatus,
      purchaseDate,
      items,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No purchase items' });
    }

    const invoice = await Purchase.create(
      {
        invoiceNumber,
        partyId,
        global_discount_percentage,
        global_discount_amount,
        baseRate,
        tax,
        totalAmount,
        paymentStatus,
        purchaseDate,
      },
      { transaction },
      { include: Party }
    );

    // Calculate subtotal and validate items
    // let subtotal = 0;
    const purchaseId = invoice.id;

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

      // const price = product.purchasePrice;
      // const quantity = item.quantity;

      // const total = quantity * price;

      // subtotal += total;
      const stock = product.stockQuantity + item.quantity;

      await Product.update(
        {
          stockQuantity: stock,
        },
        {
          where: { id: item.productId },
        },
        { transaction }
      );

      processedItems.push({
        purchaseId: purchaseId,
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
    await PurchaseItem.bulkCreate(processedItems, { transaction });

    // const calculatedTotalAmount = subtotal + tax - discount;

    return res.status(201).json(invoice);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();

    return res.status(400).json({ message: error.message });
  }
};

// @access  Public
// @desc    Update Purchase
// @route   PUT /api/purchase/:id
const updatePurchaseById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const {
      invoiceNumber,
      partyId,
      global_discount_percentage = 0,
      global_discount_amount = 0,
      baseRate,
      tax = 0,
      totalAmount,
      paymentStatus,
      purchaseDate,
      items,
    } = req.body;

    const invoice = await Purchase.findByPk(id, { transaction });

    if (!invoice) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No Purchase items' });
    }

    // 1️⃣ Get existing items
    const existingItems = await PurchaseItem.findAll({
      where: { purchaseId: id },
      transaction,
    });

    // 2️⃣ Restore stock from old items
    for (const item of existingItems) {
      const product = await Product.findByPk(item.productId, { transaction });

      if (product) {
        const stock = product.stockQuantity - item.quantity;
        await product.update(
          {
            stockQuantity: stock,
          },
          { transaction }
        );
      }
    }

    // 3️⃣ Delete old items
    await PurchaseItem.destroy({
      where: { purchaseId: id },
      transaction,
    });

    // 4️⃣ Insert updated items + reduce stock
    const processedItems = [];

    for (const item of items) {
      const product = await Product.findByPk(item.productId, { transaction });

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      // if (product.stockQuantity > item.quantity) {
      //   throw new Error(`Insufficient stock for ${product.name}`);
      // }
      const stock = product.stockQuantity + item.quantity;
      // reduce stock again
      await product.update(
        {
          stockQuantity: stock,
        },
        { transaction }
      );

      processedItems.push({
        purchaseId: id,
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

    await PurchaseItem.bulkCreate(processedItems, { transaction });

    // 5️⃣ Update invoice
    await invoice.update(
      {
        invoiceNumber,
        partyId,
        global_discount_percentage,
        global_discount_amount,
        baseRate,
        tax,
        totalAmount,
        paymentStatus,
        purchaseDate,
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({ message: 'Purchase updated successfully' });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Public
const deletePurchase = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const purchaseInvoice = await Purchase.findByPk(id, { transaction });

    if (!purchaseInvoice) {
      return res.status(404).json({
        message: 'Purchases invoice not found',
      });
    }

    // get all items of the invoice
    const purchaseItems = await PurchaseItem.findAll({
      where: { purchaseId: id },
      transaction,
    });

    for (const item of purchaseItems) {
      const product = await Product.findByPk(item.productId, { transaction });

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }
      const stock = product.stockQuantity - item.quantity;
      // restore stock
      await Product.update(
        {
          stockQuantity: stock,
        },
        {
          where: { id: item.productId },
        }
      );
    }

    // delete Purchases items
    await PurchaseItem.destroy({
      where: { purchaseId: id },
      transaction,
    });

    // delete invoice
    await Purchase.destroy({
      where: { id },
      transaction,
    });

    await transaction.commit();

    return res.status(200).json({
      message: 'Invoice deleted and stock restored',
    });
  } catch (error) {
    await transaction.rollback();

    return res.status(500).json({
      message: error.message,
    });
  }
};

// @desc    Update invoice status
// @route   PUT /api/invoices/:id/status
// @access  Public
const updatePurchaseStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['Paid', 'Unpaid', 'Overdue', 'Cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const invoice = await Purchase.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    invoice.status = status;
    const updatedInvoice = await invoice.save();

    return res.status(200).json(updatedInvoice);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// POST /api/invoices
// @desc    Create invoice status
// @route   POST /api/invoices/:id/status
// @access  Public
const createPurchases = async (req, res, next) => {
  // const connection = await pool.getConnection();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    await connection.beginTransaction();

    const {
      client_id,
      issue_date,
      due_date,
      items,
      tax_rate = 0,
      discount = 0,
      notes,
      status = 'draft',
    } = req.body;

    // Verify client belongs to user
    const [clientRows] = await connection.query(
      'SELECT * FROM clients WHERE id = ? AND user_id = ?',
      [client_id, req.user.id]
    );
    if (!clientRows.length) {
      return res
        .status(404)
        .json({ success: false, message: 'Client not found' });
    }

    // Calculate totals
    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0
    );
    const tax_amount = (subtotal - discount) * (tax_rate / 100);
    const total = subtotal - discount + tax_amount;
    const invoice_number = generateInvoiceNumber();

    const [invoiceResult] = await connection.query(
      `INSERT INTO invoices (invoice_number, user_id, client_id, status, issue_date, due_date,
        subtotal, tax_rate, tax_amount, discount, total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoice_number,
        req.user.id,
        client_id,
        status,
        issue_date,
        due_date,
        subtotal,
        tax_rate,
        tax_amount,
        discount,
        total,
        notes,
      ]
    );

    const invoiceId = invoiceResult.insertId;

    // Insert items
    for (const item of items) {
      const amount = item.quantity * item.unit_price;
      await connection.query(
        'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?)',
        [invoiceId, item.description, item.quantity, item.unit_price, amount]
      );
    }

    await connection.commit();

    const [newInvoice] = await pool.query(
      'SELECT * FROM invoices WHERE id = ?',
      [invoiceId]
    );
    const [newItems] = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = ?',
      [invoiceId]
    );

    return res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: { ...newInvoice[0], items: newItems },
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

module.exports = {
  getPurchase,
  getPurchaseInvoicesByDate,
  getPurchaseById,
  updatePaymentStatusById,
  createPurchase,
  updatePurchaseById,
  updatePurchaseStatus,
  createPurchases,
  deletePurchase,
};
