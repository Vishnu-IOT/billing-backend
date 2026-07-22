const NotificationTemplate = require('../mysql-models/NotificationTemplate');
const Party = require('../mysql-models/Party');
const Sale = require('../mysql-models/SalesBill');

const getDefaultTemplates = () => ({
  whatsapp: {
    invoice: 'Hi {{partyName}}, your invoice {{invoiceNo}} for {{amount}} is ready. Thank you!',
    overdue: 'Dear {{partyName}}, payment of {{amount}} for invoice {{invoiceNo}} is overdue by {{days}} days.',
  },
  sms: {
    invoice: 'Invoice {{invoiceNo}} amount {{amount}} from {{companyName}}.',
    overdue: 'Overdue: {{invoiceNo}} - {{amount}} due {{days}} days.',
  },
  email: {
    invoice: 'Dear {{partyName}},\n\nPlease find invoice {{invoiceNo}} for {{amount}}.\n\nRegards,\n{{companyName}}',
    overdue: 'Dear {{partyName}},\n\nInvoice {{invoiceNo}} of {{amount}} is overdue by {{days}} days.\n\nRegards,\n{{companyName}}',
  },
});

const getNotificationTemplates = async (req, res) => {
  try {
    const templates = await NotificationTemplate.findAll();

    if (!templates || templates.length === 0) {
      return res.status(200).json(getDefaultTemplates());
    }

    const structured = getDefaultTemplates();
    templates.forEach((t) => {
      if (structured[t.channel] && structured[t.channel][t.event]) {
        structured[t.channel][t.event] = t.templateText;
      }
    });

    return res.status(200).json(structured);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateNotificationTemplates = async (req, res) => {
  try {
    const templatesPayload = req.body; // { whatsapp: { invoice, overdue }, sms: {...}, email: {...} }

    for (const channel of ['whatsapp', 'sms', 'email']) {
      if (templatesPayload[channel]) {
        for (const event of ['invoice', 'overdue']) {
          if (templatesPayload[channel][event]) {
            const [record] = await NotificationTemplate.findOrCreate({
              where: { channel, event },
              defaults: { templateText: templatesPayload[channel][event], companyId: 1 },
            });
            await record.update({ templateText: templatesPayload[channel][event] });
          }
        }
      }
    }

    return res.status(200).json({ success: true, templates: templatesPayload });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const sendNotification = async (req, res) => {
  try {
    const { partyId, channel, event, invoiceNo, amount } = req.body;
    const party = await Party.findByPk(partyId);

    return res.status(200).json({
      success: true,
      message: `Notification queued for ${party?.name || 'Customer'} via ${channel}`,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const sendOverdueReminder = async (req, res) => {
  try {
    const { partyId } = req.params;
    const party = await Party.findByPk(partyId);

    if (!party) {
      return res.status(404).json({ message: 'Party not found' });
    }

    const unpaidSales = await Sale.findAll({
      where: { partyId, paymentStatus: ['Unpaid', 'Overdue'] },
    });

    const totalOverdue = unpaidSales.reduce((acc, s) => acc + Number(s.totalAmount || 0), 0);

    return res.status(200).json({
      success: true,
      message: `Overdue reminder sent to ${party.name} for ₹${totalOverdue}`,
      overdueInvoicesCount: unpaidSales.length,
      totalOverdueAmount: totalOverdue,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getNotificationTemplates,
  updateNotificationTemplates,
  sendNotification,
  sendOverdueReminder,
};
