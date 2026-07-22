const Category = require('./Category');
const Product = require('./Product');
const Party = require('./Party');
const Sale = require('./SalesBill');
const SalesItem = require('./Sales-Items');
const Purchase = require('./PurchaseBill');
const PurchaseItem = require('./Purchase-Items');
const Company = require('./Company');
const CompanyFinancials = require('./Company_Financials');
const InvoiceSettings = require('./Invoice_Settings');
const Customer = require('./Customer');
const User = require('./Users');
const Owner = require('./Owner');
const Document = require('./Document');
const DocumentItem = require('./DocumentItem');
const Expense = require('./Expense');
const StockAdjustment = require('./StockAdjustment');
const ProductBatch = require('./ProductBatch');
const EInvoice = require('./EInvoice');
const EWayBill = require('./EWayBill');
const NotificationTemplate = require('./NotificationTemplate');
const PaymentIn = require('./PaymentIn');
const PaymentOut = require('./PaymentOut');

// Category → Product
Category.hasMany(Product, {
  foreignKey: 'categoryId',
  onDelete: 'CASCADE',
});

Product.belongsTo(Category, {
  foreignKey: 'categoryId',
});

// Party → Sale
Party.hasMany(Sale, {
  foreignKey: 'partyId',
});

Sale.belongsTo(Party, {
  foreignKey: 'partyId',
});

// Customer → Sale
Customer.hasMany(Sale, {
  foreignKey: 'customerId',
});

Sale.belongsTo(Customer, {
  foreignKey: 'customerId',
});

// User → Sale
User.hasMany(Sale, {
  foreignKey: 'userId',
});

Sale.belongsTo(User, {
  foreignKey: 'userId',
});

// Party → Purchase
Party.hasMany(Purchase, {
  foreignKey: 'partyId',
});

Purchase.belongsTo(Party, {
  foreignKey: 'partyId',
});

// Sale → SalesItem
Sale.hasMany(SalesItem, {
  foreignKey: 'saleId',
  onDelete: 'CASCADE',
});

SalesItem.belongsTo(Sale, {
  foreignKey: 'saleId',
});

// Purchase → PurchaseItem
Purchase.hasMany(PurchaseItem, {
  foreignKey: 'purchaseId',
  onDelete: 'CASCADE',
});

PurchaseItem.belongsTo(Purchase, {
  foreignKey: 'purchaseId',
});

// Product → SalesItem
Product.hasMany(SalesItem, {
  foreignKey: 'productId',
});

SalesItem.belongsTo(Product, {
  foreignKey: 'productId',
});

// Product → PurchaseItem
Product.hasMany(PurchaseItem, {
  foreignKey: 'productId',
});

PurchaseItem.belongsTo(Product, {
  foreignKey: 'productId',
});

// Document → DocumentItem
Document.hasMany(DocumentItem, {
  foreignKey: 'documentId',
  as: 'items',
  onDelete: 'CASCADE',
});

DocumentItem.belongsTo(Document, {
  foreignKey: 'documentId',
});

// Party → Document
Party.hasMany(Document, {
  foreignKey: 'partyId',
});

Document.belongsTo(Party, {
  foreignKey: 'partyId',
});

// Product → ProductBatch
Product.hasMany(ProductBatch, {
  foreignKey: 'productId',
  as: 'batches',
  onDelete: 'CASCADE',
});

ProductBatch.belongsTo(Product, {
  foreignKey: 'productId',
});

// Product → StockAdjustment
Product.hasMany(StockAdjustment, {
  foreignKey: 'productId',
  onDelete: 'CASCADE',
});

StockAdjustment.belongsTo(Product, {
  foreignKey: 'productId',
});

// Sale → EInvoice
Sale.hasOne(EInvoice, {
  foreignKey: 'saleId',
  onDelete: 'CASCADE',
});

EInvoice.belongsTo(Sale, {
  foreignKey: 'saleId',
});

// Sale → EWayBill
Sale.hasOne(EWayBill, {
  foreignKey: 'saleId',
  onDelete: 'CASCADE',
});

EWayBill.belongsTo(Sale, {
  foreignKey: 'saleId',
});

// Sale → PaymentIn
Sale.hasMany(PaymentIn, {
  foreignKey: 'saleId',
  as: 'payments',
});

PaymentIn.belongsTo(Sale, {
  foreignKey: 'saleId',
});

// Party → PaymentIn
Party.hasMany(PaymentIn, {
  foreignKey: 'partyId',
});

PaymentIn.belongsTo(Party, {
  foreignKey: 'partyId',
});

// Purchase → PaymentOut
Purchase.hasMany(PaymentOut, {
  foreignKey: 'purchaseId',
  as: 'payments',
});

PaymentOut.belongsTo(Purchase, {
  foreignKey: 'purchaseId',
});

// Party → PaymentOut
Party.hasMany(PaymentOut, {
  foreignKey: 'partyId',
});

PaymentOut.belongsTo(Party, {
  foreignKey: 'partyId',
});

// ✅ Company ↔ CompanyFinancials (One-to-One)
Company.hasOne(CompanyFinancials, {
  foreignKey: 'companyId',
  as: 'financials',
  onDelete: 'CASCADE',
});

CompanyFinancials.belongsTo(Company, {
  foreignKey: 'companyId',
  as: 'company',
});

// ✅ Company ↔ Users
User.belongsTo(Company, {
  foreignKey: 'companyId',
  as: 'company',
});

Company.hasMany(User, {
  foreignKey: 'companyId',
  as: 'users',
});

// ✅ Company ↔ InvoiceSettings (One-to-One)
Company.hasOne(InvoiceSettings, {
  foreignKey: 'companyId',
  as: 'invoiceSettings',
  onDelete: 'CASCADE',
});

InvoiceSettings.belongsTo(Company, {
  foreignKey: 'companyId',
  as: 'company',
});

module.exports = {
  Category,
  Product,
  Party,
  Customer,
  Sale,
  SalesItem,
  Purchase,
  PurchaseItem,
  Company,
  CompanyFinancials,
  InvoiceSettings,
  User,
  Owner,
  Document,
  DocumentItem,
  Expense,
  StockAdjustment,
  ProductBatch,
  EInvoice,
  EWayBill,
  NotificationTemplate,
  PaymentIn,
  PaymentOut,
};

