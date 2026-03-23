const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a product name'],
      trim: true,
    },
    HSNCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    MRP: {
      type: Number,
      required: [true, 'Please add a MRP price'],
      min: 0,
    },
    taxRate: {
      type: Number,
      enum: [0, 5, 12, 18, 28],
      default: 0,
    },
    salesPrice: {
      type: Number,
      required: [true, 'Please add a Sales price'],
      min: 0,
    },
    purchasePrice: {
      type: Number,
      required: [true, 'Please add a Purchase price'],
      min: 0,
    },
    discount: {
      type: Number,
      min: 0,
      default: 0,
    },
    stockQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    unit: {
      type: String,
      enum: ['pcs', 'kg', 'g', 'ltr', 'ml', 'box', 'packet', 'mtr', 'nos'],
      default: 'pcs',
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Product', productSchema);
