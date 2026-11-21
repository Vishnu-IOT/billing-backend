'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  permissionCatalog,
  permissionKeySet,
  staffSystemPermissions,
  purchaseManagerSystemPermissions,
  systemRoleDefinitions,
} = require('../rbac/permissionCatalog');
const { accessForRequest, authorizeApiRequest } = require('../middleware/authorizeApiRequest');

const requestFor = (method, originalUrl, body = {}) => ({ method, originalUrl, body });

test('permission catalog keys are unique and every default staff permission exists', () => {
  const keys = permissionCatalog.map(({ permissionKey }) => permissionKey);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of staffSystemPermissions) {
    assert.ok(permissionKeySet.has(key), `${key} must exist in the permission catalogue`);
  }
});

test('fixed roles have only their intended permission sets', () => {
  assert.deepEqual([...staffSystemPermissions].sort(), [
    'pos.billing.access',
    'pos.billing.create',
    'quick-sales.creation.create',
  ]);
  assert.ok(purchaseManagerSystemPermissions.has('purchases.invoices.create'));
  assert.ok(purchaseManagerSystemPermissions.has('parties.directory.view'));
  assert.ok(purchaseManagerSystemPermissions.has('shifts.management.view'));
  assert.ok(!purchaseManagerSystemPermissions.has('sales.invoices.view'));
  assert.ok(!purchaseManagerSystemPermissions.has('users.directory.view'));
  assert.ok(!purchaseManagerSystemPermissions.has('settings.configuration.view'));
  assert.deepEqual(
    [...systemRoleDefinitions.ADMIN.permissions].sort(),
    [...permissionKeySet].sort()
  );
  for (const [systemKey, role] of Object.entries(systemRoleDefinitions)) {
    for (const permissionKey of role.permissions) {
      assert.ok(permissionKeySet.has(permissionKey), `${systemKey}: ${permissionKey} must be catalogued`);
    }
  }
  assert.deepEqual(Object.keys(systemRoleDefinitions).sort(), [
    'ADMIN',
    'PURCHASE_MANAGER',
    'STAFF',
  ]);
});

test('API access mappings distinguish catalog, stock-batch, and POS permissions', () => {
  assert.deepEqual(
    accessForRequest(requestFor('GET', '/api/products/get-Products')),
    {
      anyOf: [
        'products.catalog.view',
        'pos.billing.access',
        'quick-sales.aliases.map',
      ],
    }
  );
  assert.equal(
    accessForRequest(requestFor('POST', '/api/products/add-Batch/142')),
    'products.batches.create'
  );
  assert.equal(
    accessForRequest(requestFor('POST', '/api/sales/add-sales', { bill_type: 'B2B' })),
    'sales.invoices.create'
  );
  assert.deepEqual(
    accessForRequest(requestFor('POST', '/api/sales/add-sales', { bill_type: 'B2C' })),
    { anyOf: ['sales.invoices.create', 'pos.billing.create'] }
  );
  assert.deepEqual(
    accessForRequest(requestFor('GET', '/api/sales/return-credits/RETURN-CREDIT-123')),
    { anyOf: ['sales.invoices.view', 'pos.billing.access'] }
  );
  assert.deepEqual(
    accessForRequest(requestFor('GET', '/api/customers/get-Cusotmer')),
    { anyOf: ['customers.directory.view', 'pos.billing.access'] }
  );
  assert.deepEqual(
    accessForRequest(requestFor('GET', '/api/parties/invoiceById-Party/5')),
    {
      anyOf: [
        'parties.directory.view',
        'sales.invoices.view',
        'purchases.invoices.view',
        'reports.business.view',
      ],
    }
  );
  assert.equal(
    accessForRequest(requestFor('GET', '/api/customers/12')),
    'customers.directory.view'
  );
  assert.deepEqual(
    accessForRequest(requestFor('GET', '/api/pos/shifts/current')),
    { anyOf: ['pos.billing.access', 'shifts.management.view'] }
  );
  assert.equal(
    accessForRequest(requestFor('GET', '/api/pos/shifts/all-shifts')),
    'shifts.management.view'
  );
  assert.equal(
    accessForRequest(requestFor('DELETE', '/api/sales/delete-sales/32')),
    'sales.invoices.cancel'
  );
  assert.deepEqual(
    accessForRequest(requestFor('GET', '/api/app-settings?companyId=1')),
    {
      anyOf: [
        'settings.configuration.view',
        'pos.billing.access',
        'purchases.invoices.view',
        'purchases.invoices.create',
      ],
    }
  );
  assert.deepEqual(
    accessForRequest(requestFor('GET', '/api/promotions/preview?productId=142')),
    { anyOf: ['offers.promotions.view', 'pos.billing.access'] }
  );
});

test('Quick Sale mapping permission can read the product catalog without POS access', () => {
  const req = {
    ...requestFor('GET', '/api/products/get-Products'),
    permissions: new Set(['quick-sales.aliases.map']),
    isSystemAdministrator: false,
  };
  let continued = false;
  authorizeApiRequest(req, { status: () => ({ json: () => {} }) }, () => {
    continued = true;
  });
  assert.equal(continued, true);
});

test('preview endpoint allows a POS permission without granting offer administration', () => {
  const access = accessForRequest(requestFor('GET', '/api/promotions/preview?productId=142'));
  assert.deepEqual(access, { anyOf: ['offers.promotions.view', 'pos.billing.access'] });

  const req = {
    ...requestFor('GET', '/api/promotions/preview?productId=142'),
    permissions: new Set(['pos.billing.access']),
    isSystemAdministrator: false,
  };
  let continued = false;
  authorizeApiRequest(req, { status: () => ({ json: () => {} }) }, () => {
    continued = true;
  });
  assert.equal(continued, true);

  const unauthorized = {
    ...req,
    permissions: new Set(['products.catalog.view']),
  };
  let deniedStatus;
  authorizeApiRequest(unauthorized, {
    status(status) {
      deniedStatus = status;
      return { json: () => {} };
    },
  }, () => {
    throw new Error('Unauthorized request must not continue');
  });
  assert.equal(deniedStatus, 403);
});

test('Staff can use POS reads and own shift controls but cannot use business modules', () => {
  const allowedPaths = [
    ['GET', '/api/products/get-Products'],
    ['GET', '/api/customers/get-Cusotmer'],
    ['GET', '/api/pos/shifts/current'],
    ['POST', '/api/pos/shifts/start'],
    ['POST', '/api/pos/shifts/end'],
    ['GET', '/api/quick-sales/resolve'],
    ['GET', '/api/sales/return-credits/RETURN-CREDIT-123'],
    ['POST', '/api/sales/add-sales'],
  ];
  for (const [method, path] of allowedPaths) {
    let continued = false;
    authorizeApiRequest({
      ...requestFor(method, path, { bill_type: 'B2C' }),
      permissions: new Set(staffSystemPermissions),
      isSystemAdministrator: false,
    }, { status: () => ({ json: () => {} }) }, () => {
      continued = true;
    });
    assert.equal(continued, true, `${method} ${path} should be available to POS Staff`);
  }

  const deniedPaths = [
    ['GET', '/api/sales/get-sales'],
    ['POST', '/api/sales/add-sales', { bill_type: 'B2B' }],
    ['GET', '/api/purchase/get-purchase'],
    ['GET', '/api/customers/get-Cusotmer/1'],
    ['GET', '/api/pos/shifts/all-shifts'],
    ['GET', '/api/loyalty/gifts'],
    ['POST', '/api/loyalty/redeem/manual'],
  ];
  for (const [method, path, body] of deniedPaths) {
    let deniedStatus;
    authorizeApiRequest({
      ...requestFor(method, path, body),
      permissions: new Set(staffSystemPermissions),
      isSystemAdministrator: false,
    }, {
      status(status) {
        deniedStatus = status;
        return { json: () => {} };
      },
    }, () => {
      throw new Error(`${method} ${path} must not be available to POS Staff`);
    });
    assert.equal(deniedStatus, 403, `${method} ${path} must be forbidden`);
  }
});

test('Purchase Manager can manage purchasing but cannot browse sales or administration', () => {
  const permitted = new Set(purchaseManagerSystemPermissions);
  const allowedPaths = [
    ['GET', '/api/purchase/get-purchase'],
    ['POST', '/api/purchase/add-purchase'],
    ['GET', '/api/parties/get-Party'],
    ['GET', '/api/parties/invoiceById-Party/5'],
    ['GET', '/api/app-settings?companyId=5'],
  ];
  for (const [method, path] of allowedPaths) {
    let continued = false;
    authorizeApiRequest({
      ...requestFor(method, path),
      permissions: permitted,
      isSystemAdministrator: false,
    }, { status: () => ({ json: () => {} }) }, () => {
      continued = true;
    });
    assert.equal(continued, true, `${method} ${path} should be available to Purchase Managers`);
  }

  for (const [method, path] of [
    ['GET', '/api/sales/get-sales'],
    ['GET', '/api/company/get-User/5'],
    ['GET', '/api/roles'],
    ['PUT', '/api/app-settings'],
  ]) {
    let deniedStatus;
    authorizeApiRequest({
      ...requestFor(method, path),
      permissions: permitted,
      isSystemAdministrator: false,
    }, {
      status(status) {
        deniedStatus = status;
        return { json: () => {} };
      },
    }, () => {
      throw new Error(`${method} ${path} must not be available to Purchase Managers`);
    });
    assert.equal(deniedStatus, 403, `${method} ${path} must be forbidden`);
  }
});

test('unmapped API paths are denied by default', () => {
  assert.equal(accessForRequest(requestFor('GET', '/api/unknown/private-data')), null);
});

test('Administrator may access unmapped APIs while other roles are denied', () => {
  let continued = false;
  authorizeApiRequest({
    ...requestFor('GET', '/api/unknown/private-data'),
    isSystemAdministrator: true,
  }, { status: () => ({ json: () => {} }) }, () => {
    continued = true;
  });
  assert.equal(continued, true);

  let deniedStatus;
  authorizeApiRequest({
    ...requestFor('GET', '/api/unknown/private-data'),
    isSystemAdministrator: false,
    permissions: new Set(['pos.billing.access']),
  }, {
    status(status) {
      deniedStatus = status;
      return { json: () => {} };
    },
  }, () => {
    throw new Error('Unmapped API must remain denied to non-administrators');
  });
  assert.equal(deniedStatus, 403);
});
