const sequelize = require('../config/sqldb');
const SalesItem = require('../mysql-models/Sales-Items');
const Sale = require('../mysql-models/SalesBill');
const Product = require('../mysql-models/Product');
const Party = require('../mysql-models/Party');

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
    [sequelize.literal(`'Sale'`), 'type'],
  ],
  include: [
    {
      model: Party,
      attributes: ['name'],
    },
    {
      model: SalesItem,
      include: [
        {
          model: Product,
          attributes: ['name'],
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
    const invoice = await Sale.findById(req.params.id)
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

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Public
const createInvoice = async (req, res) => {
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
      saleDate,
      items,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No invoice items' });
    }

    const invoice = await Sale.create(
      {
        invoiceNumber,
        partyId,
        global_discount_percentage,
        global_discount_amount,
        baseRate,
        tax,
        totalAmount,
        paymentStatus,
        saleDate,
      },
      { transaction },
      { include: Party }
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

      await Product.update(
        {
          stockQuantity: product.stockQuantity - item.quantity,
        },
        {
          where: { id: item.productId },
        },
        { transaction }
      );

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
        netRate: item.netrate,
      });
    }

    // Insert all items at once
    await SalesItem.bulkCreate(processedItems, { transaction });

    // const calculatedTotalAmount = subtotal + tax - discount;

    res.status(201).json(invoice);

    await transaction.commit();
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
      global_discount_percentage = 0,
      global_discount_amount = 0,
      baseRate,
      tax = 0,
      totalAmount,
      paymentStatus,
      saleDate,
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
        global_discount_percentage,
        global_discount_amount,
        baseRate,
        tax,
        totalAmount,
        paymentStatus,
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

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Public
const deleteInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.body;

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

// @desc    Update invoice status
// @route   PUT /api/invoices/:id/status
// @access  Public
const updateInvoiceStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['Paid', 'Unpaid', 'Overdue', 'Cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const invoice = await Sale.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    invoice.status = status;
    const updatedInvoice = await invoice.save();

    res.status(200).json(updatedInvoice);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/invoices
// @desc    Create invoice status
// @route   POST /api/invoices/:id/status
// @access  Public
const createInvoices = async (req, res, next) => {
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

    res.status(201).json({
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
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoiceStatus,
  createInvoices,
  deleteInvoice,
  updateInvoiceById,
};
