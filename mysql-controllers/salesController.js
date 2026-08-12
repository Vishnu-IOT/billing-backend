const sequelize = require('../config/sqldb');
const SalesItem = require('../mysql-models/Sales-Items');
const Sale = require('../mysql-models/SalesBill');
const Product = require('../mysql-models/Product');
const Party = require('../mysql-models/Party');
const { Op, Sequelize } = require('sequelize');
const Customer = require('../mysql-models/Customer');
const User = require('../mysql-models/Users');
const POSShift = require('../mysql-models/POSShift');
const StockMovement = require('../mysql-models/StockMovement');
const { recordAutomatedJournalEntry } = require('./accountingController');
const InvoiceSettings = require('../mysql-models/Invoice_Settings');
const AppSettings = require('../mysql-models/AppSettings');

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
          // attributes: ['name'],
        },
        {
          model: Customer,
          // attributes: ['name'],
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

    return res.status(200).json(invoices);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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
          // attributes: ['name'],
        },
        {
          model: Customer,
          // attributes: ['name'],
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

    return res.status(200).json(invoices);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get single invoice
// @route   GET /api/sales/:id
// @access  Public
const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Sale.findByPk(req.params.id, {
      include: [
        { model: Party,
          //  attributes: ['name', 'email', 'phone', 'address', 'gstin'] 
          },
        {
          model: Customer,
          // attributes: ['name', 'phone', 'email']
        },
        { model: User, attributes: ['id', 'name'] },
        {
          model: SalesItem,
          include: [{ model: Product, attributes: ['name', 'HSNCode', 'unit', 'salesPrice'] }],
        },
      ],
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    return res.status(200).json(invoice);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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

// @desc    Format the financial year string based on app_settings.invoiceYearFormat
//          Supports patterns like 'YYYY-YYYY', 'YYYY-YY', 'YY-YY', 'YYYY'
const formatFinancialYear = (format, startYear, endYear) => {
  const pattern = format || 'YY-YY';

  let tokenIndex = 0;

  return pattern.replace(/Y+/g, (match) => {
    const year = tokenIndex === 0 ? startYear : endYear;
    tokenIndex += 1;

    // 4+ Y's -> full year (2026), otherwise -> last 2 digits (26)
    return match.length >= 4 ? String(year) : String(year).slice(-2);
  });
};

const createInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      name,
      phone,
      userId,
      partyId,
      po_number,
      eway_bill,
      global_discount_percentage = 0,
      global_discount_amount = 0,
      baseRate = 0,
      tax = 0,
      totalAmount = 0,
      paymentStatus = 'Unpaid',
      paymentMethod,
      paymentDetails,
      saleDate,
      bill_type = 'B2C',
      shiftId,
      warehouseId = 1,
      items,
      companyId,
    } = req.body;

    // -----------------------------------------
    // 1. Basic validation
    // -----------------------------------------

    if (!userId) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: 'At least one invoice item is required',
      });
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

    if (!companyId) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: 'Company ID is required',
      });
    }

    // -----------------------------------------
    // 2. Get app settings (this is where the prefix comes from)
    // -----------------------------------------

    const appSettings = await AppSettings.findOne({
      where: { companyId },
      transaction,
    });

    // -----------------------------------------
    // 3. Get (or create) invoice settings row - this only tracks the running sequence
    // -----------------------------------------

    let invoiceSettings = await InvoiceSettings.findOne({
      where: { companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!invoiceSettings) {
      invoiceSettings = await InvoiceSettings.create(
        {
          companyId,
          invoice_prefix: appSettings?.invoicePrefix || 'INV',
          next_sequence_no: Number(appSettings?.invoiceStartingNumber || 1),
        },
        { transaction }
      );
    }

    // -----------------------------------------
    // 4. Get current sequence (last sequence, from invoice_settings)
    // -----------------------------------------

    const sequenceNumber = Number(invoiceSettings.next_sequence_no || 1);

    // -----------------------------------------
    // 5. Get prefix (from app_settings, falling back to invoice_settings)
    // -----------------------------------------

    const prefix =
      appSettings?.invoicePrefix ||
      invoiceSettings.invoice_prefix ||
      'INV';

    // -----------------------------------------
    // 5. Get financial year (format driven by app_settings.invoiceYearFormat)
    // -----------------------------------------

    const now = new Date();

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let financialYear;

    if (currentMonth >= 4) {
      financialYear = formatFinancialYear(
        appSettings?.invoiceYearFormat,
        currentYear,
        currentYear + 1
      );
    } else {
      financialYear = formatFinancialYear(
        appSettings?.invoiceYearFormat,
        currentYear - 1,
        currentYear
      );
    }

    // -----------------------------------------
    // 6. Generate invoice number
    // -----------------------------------------

    const invoiceNumber =
      `${prefix}/${financialYear}/${String(sequenceNumber).padStart(4, '0')}`;

    // Example:
    // INV/2026-27/000001
    // INV/2026-27/000002
    // INV/2026-27/000003

    // -----------------------------------------
    // 7. Increment sequence
    // -----------------------------------------

    await invoiceSettings.update(
      {
        next_sequence_no: sequenceNumber + 1,
      },
      {
        transaction,
      }
    );

    // -----------------------------------------
    // 8. Create Sale
    // -----------------------------------------

    const invoice = await Sale.create(
      {
        invoiceNumber,

        partyId: partyId || null,
        customerId: customerId || null,
        userId,
        po_number: po_number || null,
        eway_bill: eway_bill || null,

        global_discount_percentage:
          Number(global_discount_percentage || 0),

        global_discount_amount:
          Number(global_discount_amount || 0),

        baseRate: Number(baseRate || 0),
        tax: Number(tax || 0),
        totalAmount: Number(totalAmount || 0),

        paymentStatus,
        bill_type,

        shiftId: shiftId || null,

        paymentDetails: paymentDetails
          ? JSON.stringify(paymentDetails)
          : null,

        saleDate: saleDate || new Date(),

        warehouseId:
          warehouseId || 1,
      },
      {
        transaction,
      }
    );

    // -----------------------------------------
    // 9. Create invoice items
    // -----------------------------------------

    for (const item of items) {
      const product = await Product.findByPk(
        item.productId,
        { transaction }
      );

      if (!product) {
        throw new Error(
          `Product not found: ${item.productId}`
        );
      }

      await SalesItem.create(
        {
          saleId: invoice.id,

          productId: item.productId,

          productName: item.productName,
          hsnCode: item.hsnCode,
          sku: item.sku,

          batchNumber:
            item.batchNumber || null,

          expiryDate:
            item.expiryDate || null,

          serialNumber:
            item.serialNumber || null,

          notes:
            item.notes || null,

          quantity:
            Number(item.quantity || 0),

          price:
            Number(item.price || 0),

          discountPercentage:
            Number(item.discountPercentage || 0),

          discountAmount:
            Number(item.discountAmount || 0),

          baseRate:
            Number(item.baseRate || 0),

          taxPercentage:
            Number(item.taxPercentage || 0),

          taxAmount:
            Number(item.taxAmount || 0),

          netRate:
            Number(item.netRate || 0),
        },
        {
          transaction,
        }
      );
    }

    // -----------------------------------------
    // 10. Commit transaction
    // -----------------------------------------

    await transaction.commit();

    // -----------------------------------------
    // 11. Response
    // -----------------------------------------

    return res.status(201).json({
      success: true,
      message: 'Invoice created successfully',

      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        saleDate: invoice.saleDate,
        totalAmount: invoice.totalAmount,
        paymentStatus: invoice.paymentStatus,
        bill_type: invoice.bill_type,
      },
    });

  } catch (error) {
    // -----------------------------------------
    // Rollback on error
    // -----------------------------------------

    await transaction.rollback();

    console.error('Create Invoice Error:', error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
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

      // if (product.stockQuantity < item.quantity) {
      //   throw new Error(`Insufficient stock for ${product.name}`);
      // }

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
        batchNo: item.batchNumber || null,
        serialNo: item.serialNumber || null,
        expiryDate: item.expiryDate || null,
        sku: item.sku || null,
        hsncode: item.hsnCode || null,
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

    return res.status(200).json({ message: 'Invoice updated successfully' });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

// @access  Public
// @desc    Update invoice
// @route   PUT /api/invoices/:id
const updatePaymentStatusById = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, amount, paymentMode, referenceNo, notes } = req.body;

    if (!paymentStatus) {
      return res.status(400).json({ message: 'Status not found' });
    }

    const invoice = await Sale.findByPk(id);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // 5️⃣ Update invoice
    await invoice.update({
      paymentStatus,
    });

    // Record PaymentIn history
    const PaymentIn = require('../mysql-models/PaymentIn');
    await PaymentIn.create({
      saleId: invoice.id,
      partyId: invoice.partyId,
      paymentDate: new Date(),
      amount: amount || invoice.totalAmount || 0,
      paymentMode: paymentMode || 'Cash',
      referenceNo: referenceNo || null,
      notes: notes || `Payment status updated to ${paymentStatus}`,
    });

    return res.status(200).json({ message: 'Payment In updated successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
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

module.exports = {
  getInvoices,
  getInvoicesByDate,
  getInvoiceById,
  updatePaymentStatusById,
  createInvoice,
  deleteInvoice,
  updateInvoiceById,
};