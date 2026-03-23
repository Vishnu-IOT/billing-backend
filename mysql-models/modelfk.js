const Category = require('./Category');
const Product = require('./Product');
const Party = require('./Party');
const Sale = require('./SalesBill');
const SalesItem = require('./Sales-Items');
const Purchase = require('./PurchaseBill');
const PurchaseItem = require('./Purchase-Items');

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

module.exports = {
  Category,
  Product,
  Party,
  Sale,
  SalesItem,
  Purchase,
  PurchaseItem,
};
