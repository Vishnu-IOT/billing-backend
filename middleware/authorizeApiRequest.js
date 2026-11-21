'use strict';

const moduleByPrefix = [
  ['/api/purchase-returns', 'purchaseReturns'],
  ['/api/quick-sales', 'quick-sales'],
  ['/api/sales', 'sales'],
  ['/api/purchase', 'purchases'],
  ['/api/products', 'products'],
  ['/api/variants', 'products'],
  ['/api/category', 'categories'],
  ['/api/brands', 'brands'],
  ['/api/inventory', 'inventory'],
  ['/api/customers', 'customers'],
  ['/api/parties', 'parties'],
  ['/api/loyalty', 'customers'],
  ['/api/promotions', 'offers'],
  ['/api/dashboard', 'dashboard'],
  ['/api/documents', 'documents'],
  ['/api/compliance', 'compliance'],
  ['/api/expenses', 'expenses'],
  ['/api/analytics', 'analytics'],
  ['/api/notifications', 'notifications'],
  ['/api/payments', 'payments'],
  ['/api/accounting', 'accounting'],
  ['/api/reports', 'reports'],
  ['/api/audit-logs', 'audit'],
];

const pathAction = (path, method) => {
  const lowerPath = path.toLowerCase();
  if (/\/(delete|remove)([-/]|$)/.test(lowerPath)) return 'delete';
  if (/\/(cancel|void)([-/]|$)/.test(lowerPath)) return 'cancel';
  if (/\/(return|refund)([-/]|$)/.test(lowerPath)) return 'return';
  if (/\/(approve)([-/]|$)/.test(lowerPath)) return 'approve';
  if (/\/(reject)([-/]|$)/.test(lowerPath)) return 'reject';
  if (/\/(adjust|stock-adjust)([-/]|$)/.test(lowerPath)) return 'adjustStock';
  if (/payment|settle/.test(lowerPath)) return 'managePayments';
  if (/\/(export|download)([-/]|$)/.test(lowerPath)) return 'export';
  if (/\/print([-/]|$)/.test(lowerPath)) return 'print';
  if (/\/(start)([-/]|$)/.test(lowerPath)) return 'start';
  if (/\/(end|close)([-/]|$)/.test(lowerPath)) return 'close';
  if (/\/convert([-/]|$)/.test(lowerPath)) return 'convert';
  if (/\/verify[-/]/.test(lowerPath)) return 'verify';
  if (/\/mapping(?:[-/]|$)/.test(lowerPath)) return method === 'DELETE' ? 'unlink' : 'map';
  if (/\/review(?:[-/]|$)/.test(lowerPath)) return 'review';
  if (/\/(update|edit)([-/]|$)/.test(lowerPath)) return 'edit';
  if (method === 'GET') return 'view';
  if (method === 'POST') return 'create';
  if (method === 'PUT' || method === 'PATCH') return 'edit';
  if (method === 'DELETE') return 'delete';
  return null;
};

const pageForRequest = (pathname, module, action) => {
  if (module === 'products') return /batch/i.test(pathname) ? 'batches' : 'catalog';
  if (module === 'inventory') return /(adjust|transfer)/i.test(pathname) ? 'adjustments' : 'stock';
  if (module === 'reports') return /(gst|tax|gstr|compliance)/i.test(pathname) ? 'tax' : 'business';
  if (module === 'customers' && pathname.startsWith('/api/loyalty/')) return 'loyalty';
  if (module === 'quick-sales') {
    if (/\/resolve(?:\/|$)/i.test(pathname)) return 'creation';
    if (/\/reports(?:\/|$)/i.test(pathname)) return 'reports';
    if (/\/aliases(?:\/|$)/i.test(pathname)) return 'aliases';
  }
  const pages = {
    dashboard: 'overview',
    pos: 'billing',
    sales: 'invoices',
    purchases: 'invoices',
    categories: 'catalog',
    brands: 'catalog',
    customers: 'directory',
    parties: 'directory',
    offers: 'promotions',
    shifts: 'management',
    users: 'directory',
    roles: 'configuration',
    settings: 'configuration',
    documents: 'business',
    compliance: 'einvoicing',
    payments: 'receipts',
    accounting: 'ledger',
    expenses: 'management',
    analytics: 'overview',
    audit: 'activity',
    notifications: 'management',
    company: 'profile',
  };
  if (module === 'settings' && pathname.includes('financial')) return 'company';
  return pages[module] || (action ? 'overview' : null);
};

const accessKey = (module, page, action) => `${module}.${page}.${action}`;
const matchesPath = (pathname, prefix) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const accessForRequest = (req) => {
  const pathname = req.originalUrl.split('?')[0];

  if (matchesPath(pathname, '/api/purchase-returns')) {
    const action = pathAction(pathname, req.method);
    if (!action) return null;
    return accessKey('purchases', 'returns', action);
  }

  if (matchesPath(pathname, '/api/company')) {
    if (/user/i.test(pathname)) {
      if (req.method === 'GET') return 'users.directory.view';
      return accessKey('users', 'directory', pathAction(pathname, req.method));
    }
    if (/financial/i.test(pathname)) {
      if (req.method === 'GET') {
        return {
          anyOf: [
            'settings.company.view',
            'pos.billing.access',
            'purchases.invoices.create',
          ],
        };
      }
      return accessKey('settings', 'company', 'edit');
    }
    if (req.method === 'GET') {
      return {
        anyOf: [
          'company.profile.view',
          'pos.billing.access',
          'purchases.invoices.create',
        ],
      };
    }
    return accessKey('company', 'profile', pathAction(pathname, req.method) === 'view' ? 'view' : 'edit');
  }

  if (matchesPath(pathname, '/api/owners')) {
    return accessKey('company', 'profile', pathAction(pathname, req.method) === 'view' ? 'view' : 'edit');
  }

  if (matchesPath(pathname, '/api/settings') || matchesPath(pathname, '/api/app-settings')) {
    if (req.method === 'GET') {
      if (/\/companies(?:\/|$)/i.test(pathname)) return 'settings.configuration.view';
      return {
        anyOf: [
          'settings.configuration.view',
          'pos.billing.access',
          'purchases.invoices.view',
          'purchases.invoices.create',
        ],
      };
    }
    return accessKey('settings', 'configuration', 'manageSettings');
  }

  if (pathname.startsWith('/api/pos/')) {
    const lowerPath = pathname.toLowerCase();
    if (lowerPath.includes('/counters')) {
      return lowerPath.includes('/assigned')
        ? 'pos.billing.access'
        : accessKey('shifts', 'management', 'edit');
    }
    if (lowerPath.includes('/shifts')) {
      if (lowerPath.endsWith('/current')) {
        return { anyOf: ['pos.billing.access', 'shifts.management.view'] };
      }
      if (lowerPath.endsWith('/start')) {
        return { anyOf: ['pos.billing.create', 'shifts.management.start'] };
      }
      if (lowerPath.endsWith('/end')) {
        return { anyOf: ['pos.billing.access', 'shifts.management.close'] };
      }
      return accessKey('shifts', 'management', pathAction(pathname, req.method));
    }
    return accessKey('pos', 'billing', req.method === 'GET' ? 'access' : 'create');
  }

  const prefix = moduleByPrefix.find(([candidate]) =>
    pathname === candidate || pathname.startsWith(`${candidate}/`)
  );
  if (!prefix) return null;

  const [, module] = prefix;
  let action = pathAction(pathname, req.method);
  if (
    module === 'parties' &&
    req.method === 'GET' &&
    /\/invoicebyid-party(?:\/|$)/i.test(pathname)
  ) {
    return {
      anyOf: [
        'parties.directory.view',
        'sales.invoices.view',
        'purchases.invoices.view',
        'reports.business.view',
      ],
    };
  }
  if (
    module === 'parties' &&
    req.method === 'GET' &&
    /\/get-ageing(?:\/|$)/i.test(pathname)
  ) {
    return 'reports.business.view';
  }
  if (module === 'sales' && req.method === 'POST' && /\/add-sales$/i.test(pathname)) {
    const billType = String(req.body?.bill_type ?? req.body?.billType ?? 'B2C').toUpperCase();
    return billType === 'B2C'
      ? { anyOf: ['sales.invoices.create', 'pos.billing.create'] }
      : 'sales.invoices.create';
  }
  if (module === 'sales' && req.method === 'GET' && /\/get-sales\/\d+$/i.test(pathname)) {
    return { anyOf: ['sales.invoices.view', 'pos.billing.access'] };
  }
  if (
    module === 'sales' &&
    req.method === 'GET' &&
    /\/return-credits\/[^/]+$/i.test(pathname)
  ) {
    return { anyOf: ['sales.invoices.view', 'pos.billing.access'] };
  }
  if (module === 'quick-sales') {
    if (/\/resolve(?:\/|$)/i.test(pathname)) {
      return 'quick-sales.creation.create';
    }
    if (/\/reports(?:\/|$)/i.test(pathname)) {
      return action ? accessKey('quick-sales', 'reports', action) : null;
    }
    if (/\/verify[-/]/i.test(pathname)) {
      action = 'verify';
    } else if (/\/mapping(?:[-/]|$)/i.test(pathname)) {
      action = req.method === 'DELETE' ? 'unlink' : 'map';
    } else if (/\/review(?:[-/]|$)/i.test(pathname)) {
      action = 'review';
    } else if (req.method === 'GET') {
      action = 'view';
    }
    return action ? accessKey('quick-sales', 'aliases', action) : null;
  }
  if ((module === 'sales' || module === 'purchases') && action === 'delete') {
    action = 'cancel';
  }
  if (!action) return null;
  if (module === 'inventory' && /\/transfers\/[^/]+\/receive(?:\/|$)/i.test(pathname)) {
    return 'inventory.adjustments.approve';
  }
  if (
    module === 'documents' &&
    req.method === 'POST' &&
    ['SALES_RETURN', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(
      String(req.body?.documentType || req.body?.type || '').toUpperCase()
    )
  ) {
    return 'documents.business.return';
  }

  if (module === 'products' && req.method === 'GET') {
    const page = pageForRequest(pathname, module);
    return {
      anyOf: [
        accessKey('products', page, 'view'),
        'pos.billing.access',
        ...(page === 'catalog' ? ['quick-sales.aliases.map'] : []),
      ],
    };
  }
  if (
    (module === 'customers' && req.method === 'GET' &&
      /^\/api\/customers\/(get-customer|get-cusotmer)$/i.test(pathname)) ||
    (module === 'categories' && req.method === 'GET' && action === 'view') ||
    (module === 'brands' && req.method === 'GET' && action === 'view')
  ) {
    const standardPermission = accessKey(module, pageForRequest(pathname, module, action), action);
    return { anyOf: [standardPermission, 'pos.billing.access'] };
  }
  if (module === 'offers' && req.method === 'GET' && /\/preview(?:\/|$)/i.test(pathname)) {
    return { anyOf: ['offers.promotions.view', 'pos.billing.access'] };
  }
  if (module === 'sales' && req.method === 'GET' && /\/preview-next-number(?:\/|$)/i.test(pathname)) {
    return { anyOf: ['sales.invoices.view', 'sales.invoices.create', 'pos.billing.access'] };
  }
  if (module === 'customers' && pathname.startsWith('/api/loyalty/')) {
    return accessKey('customers', 'loyalty', action === 'view' ? 'view' : 'loyalty');
  }

  const page = pageForRequest(pathname, module, action);
  return page ? accessKey(module, page, action) : null;
};

const authorizeApiRequest = (req, res, next) => {
  const access = accessForRequest(req);
  if (!access) {
    if (req.isSystemAdministrator) return next();
    return res.status(403).json({
      success: false,
      message: 'No permission mapping exists for this API endpoint',
    });
  }

  const permitted = typeof access === 'string'
    ? req.isSystemAdministrator || req.permissions?.has(access)
    : req.isSystemAdministrator || access.anyOf.some((key) => req.permissions?.has(key));

  if (!permitted) {
    return res.status(403).json({
      success: false,
      message: typeof access === 'string'
        ? `Permission required: ${access}`
        : `One of these permissions is required: ${access.anyOf.join(', ')}`,
      requiredPermission: access,
    });
  }
  return next();
};

module.exports = { authorizeApiRequest, accessForRequest };
