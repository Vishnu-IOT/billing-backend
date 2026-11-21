'use strict';

const getPartyInvoiceVisibility = ({
  isSystemAdministrator = false,
  permissions = new Set(),
}) => {
  const canViewAllInvoices =
    isSystemAdministrator || permissions.has('reports.business.view');
  return {
    sales: canViewAllInvoices || permissions.has('sales.invoices.view'),
    purchases: canViewAllInvoices || permissions.has('purchases.invoices.view'),
  };
};

module.exports = { getPartyInvoiceVisibility };
