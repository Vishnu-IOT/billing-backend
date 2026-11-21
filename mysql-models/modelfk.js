const Category = require('./Category');
const Product = require('./Product');
const Party = require('./Party');
const Sale = require('./SalesBill');
const SalesItem = require('./Sales-Items');
const QuickSaleAlias = require('./QuickSaleAlias');
const QuickSaleSaleItem = require('./QuickSaleSaleItem');
const QuickSaleReturn = require('./QuickSaleReturn');
const QuickSaleAuditEvent = require('./QuickSaleAuditEvent');
const Purchase = require('./PurchaseBill');
const PurchaseItem = require('./Purchase-Items');
const PurchaseReturn = require('./PurchaseReturn');
const PurchaseReturnItem = require('./PurchaseReturnItem');
const PurchaseReturnCreditApplication = require('./PurchaseReturnCreditApplication');
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
const POSShift = require('./POSShift');
const POSCounter = require('./POSCounter');
const HoldBill = require('./HoldBill');
const LoyaltyGift = require('./LoyaltyGift');
const LoyaltyRedemption = require('./LoyaltyRedemption');
const LoyaltyTransaction = require('./LoyaltyTransaction');
const PromotionalOffer = require('./PromotionalOffer');
const PromotionalCampaign = require('./PromotionalCampaign');
const CampaignProduct = require('./CampaignProduct');
const PromotionApplication = require('./PromotionApplication');
const Role = require('./Role');
const Permission = require('./Permission');
const RolePermission = require('./RolePermission');

User.belongsTo(Role, { foreignKey: 'roleId', as: 'assignedRole' });
Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });
Role.belongsToMany(Permission, {
  through: RolePermission,
  foreignKey: 'roleId',
  otherKey: 'permissionId',
  as: 'permissions',
});
Permission.belongsToMany(Role, {
  through: RolePermission,
  foreignKey: 'permissionId',
  otherKey: 'roleId',
  as: 'roles',
});
RolePermission.belongsTo(Role, { foreignKey: 'roleId' });
RolePermission.belongsTo(Permission, { foreignKey: 'permissionId' });

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

Sale.hasMany(PromotionApplication, {
  foreignKey: 'saleId',
  as: 'promotionApplications',
  onDelete: 'CASCADE',
});

PromotionApplication.belongsTo(Sale, {
  foreignKey: 'saleId',
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

Sale.hasMany(QuickSaleSaleItem, {
  foreignKey: 'saleId',
  as: 'QuickSaleItems',
  onDelete: 'CASCADE',
});
QuickSaleSaleItem.belongsTo(Sale, { foreignKey: 'saleId' });
QuickSaleAlias.hasMany(QuickSaleSaleItem, {
  foreignKey: 'quickSaleAliasId',
  as: 'saleItems',
});
QuickSaleSaleItem.belongsTo(QuickSaleAlias, {
  foreignKey: 'quickSaleAliasId',
  as: 'alias',
});
QuickSaleAlias.belongsTo(Product, {
  foreignKey: 'linkedProductId',
  as: 'linkedProduct',
});
Product.hasMany(QuickSaleAlias, {
  foreignKey: 'linkedProductId',
  as: 'quickSaleAliases',
});
Sale.hasMany(QuickSaleReturn, { foreignKey: 'saleId', as: 'QuickSaleReturns' });
QuickSaleReturn.belongsTo(Sale, { foreignKey: 'saleId' });
QuickSaleSaleItem.hasMany(QuickSaleReturn, {
  foreignKey: 'quickSaleSaleItemId',
  as: 'returns',
});
QuickSaleReturn.belongsTo(QuickSaleSaleItem, {
  foreignKey: 'quickSaleSaleItemId',
  as: 'saleItem',
});
QuickSaleAlias.hasMany(QuickSaleAuditEvent, {
  foreignKey: 'quickSaleAliasId',
  as: 'auditEvents',
});
QuickSaleAuditEvent.belongsTo(QuickSaleAlias, { foreignKey: 'quickSaleAliasId' });
QuickSaleAuditEvent.belongsTo(User, {
  foreignKey: 'actorUserId',
  as: 'actor',
});

SalesItem.belongsTo(Sale, {
  foreignKey: 'saleId',
});

ProductBatch.hasMany(SalesItem, {
  foreignKey: 'productBatchId',
});

SalesItem.belongsTo(ProductBatch, {
  foreignKey: 'productBatchId',
});

// Purchase → PurchaseItem
Purchase.hasMany(PurchaseItem, {
  foreignKey: 'purchaseId',
  onDelete: 'CASCADE',
});

PurchaseItem.belongsTo(Purchase, {
  foreignKey: 'purchaseId',
});

ProductBatch.hasMany(PurchaseItem, {
  foreignKey: 'productBatchId',
});

PurchaseItem.belongsTo(ProductBatch, {
  foreignKey: 'productBatchId',
});

Purchase.hasMany(PurchaseReturn, {
  foreignKey: 'purchaseId',
  as: 'purchaseReturns',
});
PurchaseReturn.belongsTo(Purchase, { foreignKey: 'purchaseId' });
Party.hasMany(PurchaseReturn, { foreignKey: 'supplierId' });
PurchaseReturn.belongsTo(Party, { foreignKey: 'supplierId' });
PurchaseReturn.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });
PurchaseReturn.belongsTo(User, { foreignKey: 'cancelledBy', as: 'cancelledByUser' });
PurchaseReturn.hasMany(PurchaseReturnItem, {
  foreignKey: 'purchaseReturnId',
  as: 'items',
  onDelete: 'RESTRICT',
});
PurchaseReturnItem.belongsTo(PurchaseReturn, {
  foreignKey: 'purchaseReturnId',
  as: 'purchaseReturn',
});
PurchaseReturnItem.belongsTo(PurchaseItem, { foreignKey: 'purchaseItemId' });
PurchaseItem.hasMany(PurchaseReturnItem, { foreignKey: 'purchaseItemId' });
PurchaseReturnItem.belongsTo(Product, { foreignKey: 'productId' });
PurchaseReturnItem.belongsTo(ProductBatch, { foreignKey: 'productBatchId' });
PurchaseReturnItem.belongsTo(Purchase, { foreignKey: 'purchaseId' });
PurchaseReturn.hasMany(PurchaseReturnCreditApplication, {
  foreignKey: 'purchaseReturnId',
  as: 'creditApplications',
});
PurchaseReturnCreditApplication.belongsTo(PurchaseReturn, {
  foreignKey: 'purchaseReturnId',
  as: 'purchaseReturn',
});
PurchaseReturnCreditApplication.belongsTo(Purchase, { foreignKey: 'purchaseId' });

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

// DocumentItem → Product
DocumentItem.belongsTo(Product, {
  foreignKey: 'productId',
});

Product.hasMany(DocumentItem, {
  foreignKey: 'productId',
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

// Promotions
Product.hasMany(PromotionalOffer, {
  foreignKey: 'productId',
  as: 'promotionalOffers',
  onDelete: 'CASCADE',
});

PromotionalOffer.belongsTo(Product, {
  foreignKey: 'productId',
});
PromotionalOffer.belongsTo(Product, {
  foreignKey: 'giftProductId',
  as: 'giftProduct',
});

Category.hasMany(PromotionalOffer, {
  foreignKey: 'categoryId',
  as: 'promotionalOffers',
  onDelete: 'CASCADE',
});

PromotionalOffer.belongsTo(Category, {
  foreignKey: 'categoryId',
});

PromotionalCampaign.hasMany(CampaignProduct, {
  foreignKey: 'campaignId',
  as: 'products',
  onDelete: 'CASCADE',
});

CampaignProduct.belongsTo(PromotionalCampaign, {
  foreignKey: 'campaignId',
  as: 'campaign',
});

CampaignProduct.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
CampaignProduct.belongsTo(Product, { foreignKey: 'giftProductId', as: 'giftProduct' });
CampaignProduct.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

PromotionalCampaign.hasMany(PromotionApplication, {
  foreignKey: 'campaignId',
  as: 'applications',
});

PromotionalOffer.hasMany(PromotionApplication, {
  foreignKey: 'offerId',
  as: 'applications',
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

const Warehouse = require('./Warehouse');
const StockMovement = require('./StockMovement');
const StockTransfer = require('./StockTransfer');
const StockTransferItem = require('./StockTransferItem');

// Warehouse associations
Warehouse.hasMany(StockMovement, { foreignKey: 'warehouseId' });
StockMovement.belongsTo(Warehouse, { foreignKey: 'warehouseId' });

Product.hasMany(StockMovement, { foreignKey: 'productId' });
StockMovement.belongsTo(Product, { foreignKey: 'productId' });

Warehouse.hasMany(StockTransfer, { foreignKey: 'fromWarehouseId', as: 'OutgoingTransfers' });
Warehouse.hasMany(StockTransfer, { foreignKey: 'toWarehouseId', as: 'IncomingTransfers' });
StockTransfer.belongsTo(Warehouse, { foreignKey: 'fromWarehouseId', as: 'FromWarehouse' });
StockTransfer.belongsTo(Warehouse, { foreignKey: 'toWarehouseId', as: 'ToWarehouse' });

StockTransfer.hasMany(StockTransferItem, { foreignKey: 'stockTransferId', as: 'items', onDelete: 'CASCADE' });
StockTransferItem.belongsTo(StockTransfer, { foreignKey: 'stockTransferId' });

Product.hasMany(StockTransferItem, { foreignKey: 'productId' });
StockTransferItem.belongsTo(Product, { foreignKey: 'productId' });

Warehouse.hasMany(Sale, { foreignKey: 'warehouseId' });
Sale.belongsTo(Warehouse, { foreignKey: 'warehouseId' });

Warehouse.hasMany(Purchase, { foreignKey: 'warehouseId' });
Purchase.belongsTo(Warehouse, { foreignKey: 'warehouseId' });

const Account = require('./Account');
const JournalEntry = require('./JournalEntry');
const JournalLine = require('./JournalLine');

// Accounting relations
JournalEntry.hasMany(JournalLine, { foreignKey: 'journalEntryId', as: 'lines', onDelete: 'CASCADE' });
JournalLine.belongsTo(JournalEntry, { foreignKey: 'journalEntryId' });

Account.hasMany(JournalLine, { foreignKey: 'accountId' });
JournalLine.belongsTo(Account, { foreignKey: 'accountId', as: 'Account' });

Party.hasMany(JournalLine, { foreignKey: 'partyId' });
JournalLine.belongsTo(Party, { foreignKey: 'partyId', as: 'Party' });

const Brand = require('./Brand');
const ProductVariant = require('./ProductVariant');
const AuditLog = require('./AuditLog');

Customer.hasMany(LoyaltyRedemption, { foreignKey: 'customerId', as: 'loyaltyRedemptions' });
LoyaltyRedemption.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
LoyaltyRedemption.belongsTo(LoyaltyGift, { foreignKey: 'giftId', as: 'gift' });
LoyaltyRedemption.belongsTo(User, { foreignKey: 'performedBy', as: 'performedByUser' });
Customer.hasMany(LoyaltyTransaction, { foreignKey: 'customerId', as: 'loyaltyTransactions' });
LoyaltyTransaction.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
LoyaltyTransaction.belongsTo(LoyaltyRedemption, {
  foreignKey: 'redemptionId',
  as: 'redemption',
});
LoyaltyTransaction.belongsTo(User, { foreignKey: 'performedBy', as: 'performedByUser' });
Sale.hasMany(LoyaltyTransaction, { foreignKey: 'saleId', as: 'loyaltyTransactions' });
LoyaltyTransaction.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });

Brand.hasMany(Product, { foreignKey: 'brandId' });
Product.belongsTo(Brand, { foreignKey: 'brandId' });

Product.hasMany(ProductVariant, { foreignKey: 'productId', as: 'variants', onDelete: 'CASCADE' });
ProductVariant.belongsTo(Product, { foreignKey: 'productId' });

User.hasMany(AuditLog, { foreignKey: 'userId' });
AuditLog.belongsTo(User, { foreignKey: 'userId' });

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
  PromotionalOffer,
  PromotionalCampaign,
  CampaignProduct,
  EInvoice,
  EWayBill,
  NotificationTemplate,
  PaymentIn,
  PaymentOut,
  POSShift,
  POSCounter,
  HoldBill,
  LoyaltyGift,
  LoyaltyRedemption,
  LoyaltyTransaction,
  Warehouse,
  StockMovement,
  StockTransfer,
  StockTransferItem,
  Account,
  JournalEntry,
  JournalLine,
  Brand,
  ProductVariant,
  AuditLog,
};
