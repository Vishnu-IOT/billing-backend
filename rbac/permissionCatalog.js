'use strict';

const moduleDefinitions = [
  ['dashboard', 'Dashboard', [['overview', 'Dashboard']]],
  ['pos', 'POS', [['billing', 'POS Billing']]],
  ['quick-sales', 'Quick Sale', [['creation', 'Quick Sale Creation'], ['aliases', 'Pending Quick Sale Review'], ['reports', 'Quick Sale Reports']]],
  ['sales', 'Sales', [['invoices', 'Sales Invoices']]],
  ['purchases', 'Purchases', [['invoices', 'Purchase Invoices'], ['returns', 'Purchase Returns']]],
  ['products', 'Products', [['catalog', 'Product Catalog'], ['batches', 'Product Batches']]],
  ['categories', 'Categories', [['catalog', 'Category Management']]],
  ['brands', 'Brands', [['catalog', 'Brand Management']]],
  ['inventory', 'Inventory', [['stock', 'Stock and Warehouses'], ['adjustments', 'Stock Adjustments']]],
  ['customers', 'Customers', [['directory', 'Customer Directory'], ['loyalty', 'Loyalty Points']]],
  ['parties', 'Parties', [['directory', 'Customer and Supplier Parties']]],
  ['reports', 'Reports', [['business', 'Business Reports'], ['tax', 'GST and Compliance Reports']]],
  ['offers', 'Offers', [['promotions', 'Offers and Promotions']]],
  ['shifts', 'Shifts', [['management', 'POS Shift Management']]],
  ['users', 'User Management', [['directory', 'Users']]],
  ['roles', 'Role Management', [['configuration', 'Roles and Permissions']]],
  ['settings', 'Settings', [['configuration', 'Application Settings'], ['company', 'Company and Financial Details']]],
  ['documents', 'Documents', [['business', 'Business Documents']]],
  ['compliance', 'Compliance', [['einvoicing', 'E-Invoice and E-Way Bill']]],
  ['payments', 'Payments', [['receipts', 'Payment In and Out']]],
  ['accounting', 'Accounting', [['ledger', 'Accounting and Ledgers']]],
  ['expenses', 'Expenses', [['management', 'Expenses']]],
  ['analytics', 'Analytics', [['overview', 'Business Analytics']]],
  ['audit', 'Audit Logs', [['activity', 'Audit Activity']]],
  ['notifications', 'Notifications', [['management', 'Notifications']]],
  ['company', 'Company', [['profile', 'Company Profile']]],
];

const actionDefinitions = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  print: 'Print',
  export: 'Export',
  cancel: 'Cancel',
  return: 'Return',
  approve: 'Approve',
  reject: 'Reject',
  adjustStock: 'Adjust Stock',
  managePayments: 'Manage Payments',
  manageSettings: 'Manage Settings',
  loyalty: 'Use Loyalty',
  access: 'Access',
  start: 'Start',
  close: 'Close',
  convert: 'Convert',
  manage: 'Manage',
  verify: 'Verify GST',
  map: 'Map Product',
  review: 'Mark Reviewed',
  unlink: 'Unlink Product',
};

const actionsByModule = {
  dashboard: { overview: ['view'] },
  pos: { billing: ['access', 'create'] },
  'quick-sales': {
    creation: ['create'],
    aliases: ['view', 'verify', 'map', 'review', 'unlink'],
    reports: ['view', 'export'],
  },
  sales: { invoices: ['view', 'create', 'edit', 'cancel', 'return', 'print', 'managePayments'] },
  purchases: {
    invoices: ['view', 'create', 'edit', 'cancel', 'print', 'managePayments'],
    returns: ['view', 'create', 'cancel', 'print'],
  },
  products: { catalog: ['view', 'create', 'edit', 'delete'], batches: ['view', 'create', 'edit', 'delete', 'adjustStock'] },
  categories: { catalog: ['view', 'create', 'edit', 'delete'] },
  brands: { catalog: ['view', 'create', 'edit', 'delete'] },
  inventory: { stock: ['view', 'create', 'edit', 'delete', 'export'], adjustments: ['view', 'create', 'approve', 'reject', 'adjustStock'] },
  customers: { directory: ['view', 'create', 'edit', 'delete'], loyalty: ['view', 'loyalty', 'manage'] },
  parties: { directory: ['view', 'create', 'edit', 'delete', 'managePayments'] },
  reports: { business: ['view', 'export'], tax: ['view', 'export'] },
  offers: { promotions: ['view', 'create', 'edit', 'delete'] },
  shifts: { management: ['view', 'start', 'close', 'edit'] },
  users: { directory: ['view', 'create', 'edit', 'delete', 'manage'] },
  roles: { configuration: ['view', 'create', 'edit', 'delete', 'manage'] },
  settings: { configuration: ['view', 'manageSettings'], company: ['view', 'edit'] },
  documents: { business: ['view', 'create', 'edit', 'delete', 'print', 'convert', 'approve', 'reject', 'return'] },
  compliance: { einvoicing: ['view', 'create', 'cancel', 'export'] },
  payments: { receipts: ['view', 'create', 'edit', 'delete', 'managePayments'] },
  accounting: { ledger: ['view', 'create', 'edit', 'export'] },
  expenses: { management: ['view', 'create', 'delete'] },
  analytics: { overview: ['view', 'export'] },
  audit: { activity: ['view', 'export'] },
  notifications: { management: ['view', 'create', 'edit', 'delete', 'manageSettings'] },
  company: { profile: ['view', 'edit'] },
};

const permissionCatalog = moduleDefinitions.flatMap(([module, moduleName, pages]) =>
  pages.flatMap(([page, pageName]) =>
    (actionsByModule[module]?.[page] || []).map((action) => ({
      module,
      moduleName,
      page,
      pageName,
      action,
      actionName: actionDefinitions[action],
      permissionKey: `${module}.${page}.${action}`,
      description: `${actionDefinitions[action]} ${pageName}`,
    }))
  )
);

const permissionKeys = permissionCatalog.map(({ permissionKey }) => permissionKey);
const permissionKeySet = new Set(permissionKeys);
const administratorSystemPermissions = new Set(permissionKeys);
const purchaseManagerSystemPermissions = new Set([
  'products.catalog.view',
  'products.catalog.create',
  'products.catalog.edit',
  'products.catalog.delete',
  'products.batches.view',
  'products.batches.create',
  'products.batches.edit',
  'categories.catalog.view',
  'categories.catalog.create',
  'categories.catalog.edit',
  'categories.catalog.delete',
  'brands.catalog.view',
  'brands.catalog.create',
  'brands.catalog.edit',
  'brands.catalog.delete',
  'purchases.invoices.view',
  'purchases.invoices.create',
  'purchases.invoices.edit',
  'purchases.invoices.print',
  'purchases.invoices.managePayments',
  'purchases.returns.view',
  'purchases.returns.create',
  'purchases.returns.cancel',
  'purchases.returns.print',
  'parties.directory.view',
  'parties.directory.create',
  'parties.directory.edit',
  'parties.directory.delete',
  'shifts.management.view',
  'shifts.management.start',
  'shifts.management.close',
]);
const staffSystemPermissions = new Set([
  'pos.billing.access',
  'pos.billing.create',
  'quick-sales.creation.create',
]);

const systemRoleDefinitions = {
  ADMIN: {
    name: 'Administrator',
    description: 'Full access to every BillFlow module and operation.',
    permissions: administratorSystemPermissions,
  },
  PURCHASE_MANAGER: {
    name: 'Purchase Manager',
    description: 'Manage products, purchasing, suppliers, purchase returns, and permitted shift operations.',
    permissions: purchaseManagerSystemPermissions,
  },
  STAFF: {
    name: 'Staff',
    description: 'Create B2C POS invoices and use the minimum supporting cashier workflows.',
    permissions: staffSystemPermissions,
  },
};

module.exports = {
  permissionCatalog,
  permissionKeys,
  permissionKeySet,
  administratorSystemPermissions,
  purchaseManagerSystemPermissions,
  staffSystemPermissions,
  systemRoleDefinitions,
};
