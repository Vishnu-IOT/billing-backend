const Invoice = require('../models/Invoice');
const Product = require('../models/Product');

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Public
const getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find()
      .populate('customer', 'name email phone')
      .populate('items.product', 'name');
    return res.status(200).json(invoices);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get single invoice
// @route   GET /api/invoices/:id
// @access  Public
const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
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

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Public
const createInvoice = async (req, res) => {
  try {
    const { customer, items, tax = 0, discount = 0, dueDate, status } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No invoice items' });
    }

    // Calculate subtotal and validate items
    let subtotal = 0;
    const processedItems = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      const total = item.quantity * product.price;
      subtotal += total;

      processedItems.push({
        product: product._id,
        name: product.name,
        quantity: item.quantity,
        price: product.price, // use current database price
        total: total,
      });

      // Optional: Reduce stock quantity
      // product.stockQuantity -= item.quantity;
      // await product.save();
    }

    const calculatedTotalAmount = subtotal + tax - discount;

    const invoice = await Invoice.create({
      customer,
      items: processedItems,
      subtotal,
      tax,
      discount,
      totalAmount: calculatedTotalAmount,
      dueDate,
      status,
    });

    return res.status(201).json(invoice);
  } catch (error) {
    return res.status(400).json({ message: error.message });
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

    const invoice = await Invoice.findById(req.params.id);

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

module.exports = {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoiceStatus,
};
