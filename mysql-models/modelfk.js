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

// ✅ Company ↔ Users (One-to-One)
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
};
