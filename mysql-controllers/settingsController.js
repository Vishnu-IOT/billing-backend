const InvoiceSettings = require('../mysql-models/Invoice_Settings');
const Company = require('../mysql-models/Company');

const getSettings = async (req, res) => {
  try {
    const company = await Company.findByPk(1, {
      include: [{ model: InvoiceSettings, as: 'invoiceSettings' }],
    });

    if (!company) {
      return res.status(200).json({
        companyName: 'Your Business Name',
        companyAddress: 'Your Address',
        companyGstin: '',
        companyPhone: '',
        billTheme: 'classic',
      });
    }

    return res.status(200).json({
      companyName: company.company_name,
      companyAddress: company.address,
      companyGstin: company.gstin,
      companyPhone: company.phone,
      billTheme: company.invoiceSettings?.theme || 'classic',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const { companyName, companyAddress, companyGstin, companyPhone, billTheme } = req.body;

    const [company] = await Company.findOrCreate({
      where: { id: 1 },
      defaults: {
        company_name: companyName || 'My Company',
        address: companyAddress || '',
        gstin: companyGstin || '',
        phone: companyPhone || '',
      },
    });

    await company.update({
      company_name: companyName,
      address: companyAddress,
      gstin: companyGstin,
      phone: companyPhone,
    });

    const [settings] = await InvoiceSettings.findOrCreate({
      where: { companyId: company.id },
      defaults: { theme: billTheme || 'classic' },
    });

    await settings.update({ theme: billTheme });

    return res.status(200).json({
      success: true,
      settings: {
        companyName: company.company_name,
        companyAddress: company.address,
        companyGstin: company.gstin,
        companyPhone: company.phone,
        billTheme: settings.theme,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getSettings,
  updateSettings,
};
