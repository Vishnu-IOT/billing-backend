const EInvoice = require('../mysql-models/EInvoice');
const EWayBill = require('../mysql-models/EWayBill');
const Sale = require('../mysql-models/SalesBill');
const SalesItem = require('../mysql-models/Sales-Items');
const Purchase = require('../mysql-models/PurchaseBill');
const PurchaseItem = require('../mysql-models/Purchase-Items');
const Party = require('../mysql-models/Party');
const { Op } = require('sequelize');

const getEInvoices = async (req, res) => {
  try {
    const records = await EInvoice.findAll({
      include: [{ model: Sale, attributes: ['invoiceNumber', 'totalAmount', 'saleDate'] }],
      order: [['createdAt', 'DESC']],
    });
    
    const result = records.map(r => {
      const plain = r.toJSON();
      return {
        ...plain,
        invoiceNumber: plain.Sale?.invoiceNumber || '',
        totalAmount: plain.Sale?.totalAmount || 0,
        saleDate: plain.Sale?.saleDate || null,
      };
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getEWayBills = async (req, res) => {
  try {
    const records = await EWayBill.findAll({
      include: [{ model: Sale, attributes: ['invoiceNumber', 'totalAmount', 'saleDate'] }],
      order: [['createdAt', 'DESC']],
    });
    
    const result = records.map(r => {
      const plain = r.toJSON();
      return {
        ...plain,
        invoiceNumber: plain.Sale?.invoiceNumber || '',
        totalAmount: plain.Sale?.totalAmount || 0,
        saleDate: plain.Sale?.saleDate || null,
      };
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const generateEInvoice = async (req, res) => {
  try {
    const { billId, billType } = req.body;
    const sale = await Sale.findByPk(billId);

    if (!sale) {
      return res.status(404).json({ message: 'Sale invoice not found' });
    }

    const irn = `IRN${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const ackNo = `ACK${Math.floor(100000000 + Math.random() * 900000000)}`;
    const ackDate = new Date().toISOString();

    const record = await EInvoice.create({
      saleId: billId,
      billType: billType || 'SALE',
      irn,
      ackNo,
      ackDate,
      qrCode: `eInvoice-QR-Code-${irn}`,
      status: 'GENERATED',
      companyId: 1,
    });

    return res.status(201).json({
      success: true,
      message: 'E-Invoice generated successfully',
      data: record,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const generateEWayBill = async (req, res) => {
  try {
    const { billId, billType, transporterId, transporterName, distance, vehicleNo } = req.body;
    const sale = await Sale.findByPk(billId);

    if (!sale) {
      return res.status(404).json({ message: 'Sale invoice not found' });
    }

    const ewbNo = `EWB${Math.floor(100000000000 + Math.random() * 900000000000)}`;
    const ewbDate = new Date().toISOString();

    const record = await EWayBill.create({
      saleId: billId,
      billType: billType || 'SALE',
      ewbNo,
      ewbDate,
      validUpto: new Date(Date.now() + 86400000 * 2).toISOString(),
      transporterId,
      transporterName,
      distance: distance || 100,
      vehicleNo: vehicleNo || 'KA01AB1234',
      status: 'GENERATED',
      companyId: 1,
    });

    return res.status(201).json({
      success: true,
      message: 'E-Way Bill generated successfully',
      data: record,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const cancelEInvoice = async (req, res) => {
  try {
    const { irn, cancelReason } = req.body;
    const record = await EInvoice.findOne({ where: { irn } });

    if (!record) {
      return res.status(404).json({ message: 'E-Invoice record not found' });
    }

    await record.update({
      status: 'CANCELLED',
      cancelReason: cancelReason || 'Cancelled by user',
      cancelDate: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: 'E-Invoice cancelled successfully',
      data: record,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const cancelEWayBill = async (req, res) => {
  try {
    const { ewbNo, cancelReason } = req.body;
    const record = await EWayBill.findOne({ where: { ewbNo } });

    if (!record) {
      return res.status(404).json({ message: 'E-Way Bill record not found' });
    }

    await record.update({
      status: 'CANCELLED',
      cancelReason: cancelReason || 'Cancelled by user',
      cancelDate: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: 'E-Way Bill cancelled successfully',
      data: record,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getGSTR1 = async (req, res) => {
  try {
    const { period } = req.query;
    let whereClause = {};

    if (period) {
      const [year, month] = period.split('-');
      const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
      const startOfNextMonth = new Date(Date.UTC(year, month, 1));
      whereClause.saleDate = {
        [Op.gte]: startOfMonth,
        [Op.lt]: startOfNextMonth
      };
    }

    const sales = await Sale.findAll({
      where: whereClause,
      include: [
        { model: Party, attributes: ['name', 'GST', 'address'] },
        { model: SalesItem }
      ],
    });

    let totalTaxable = 0;
    let totalTax = 0;
    
    let b2bRows = [];
    let b2bTaxable = 0;
    
    let b2cTaxableValue = 0;
    let b2cTax = 0;
    let b2cCount = 0;

    let hsnMap = {};

    sales.forEach((sale) => {
      const baseRate = Number(sale.baseRate || 0);
      const taxAmount = Number(sale.tax || 0);
      
      totalTaxable += baseRate;
      totalTax += taxAmount;

      const isB2B = sale.bill_type === 'B2B' || (sale.Party && sale.Party.GST);

      if (isB2B) {
        b2bTaxable += baseRate;
        b2bRows.push({
          id: sale.id,
          gstin: sale.Party?.GST || '',
          partyName: sale.Party?.name || 'Walk-in',
          invoiceNumber: sale.invoiceNumber,
          invoiceDate: sale.saleDate ? new Date(sale.saleDate).toISOString().split('T')[0] : null,
          taxableValue: baseRate,
          igst: taxAmount * 0.5,
          cgst: taxAmount * 0.25,
          sgst: taxAmount * 0.25,
          totalValue: Number(sale.totalAmount || 0)
        });
      } else {
        b2cTaxableValue += baseRate;
        b2cTax += taxAmount;
        b2cCount++;
      }

      if (sale.SalesItems && sale.SalesItems.length > 0) {
        sale.SalesItems.forEach(item => {
          const hsnCode = item.hsncode || 'Others';
          if (!hsnMap[hsnCode]) {
            hsnMap[hsnCode] = {
              hsnCode,
              description: item.name || '',
              quantity: 0,
              taxableValue: 0,
              igst: 0,
              cgst: 0,
              sgst: 0
            };
          }
          const itemBaseRate = Number(item.baseRate || 0);
          const itemTax = Number(item.taxAmount || 0);
          hsnMap[hsnCode].quantity += Number(item.quantity || 0);
          hsnMap[hsnCode].taxableValue += itemBaseRate;
          hsnMap[hsnCode].igst += itemTax * 0.5;
          hsnMap[hsnCode].cgst += itemTax * 0.25;
          hsnMap[hsnCode].sgst += itemTax * 0.25;
        });
      }
    });

    const hsnArray = Object.values(hsnMap);

    return res.status(200).json({
      summary: {
        totalTaxable,
        igst: totalTax * 0.5,
        cgst: totalTax * 0.25,
        sgst: totalTax * 0.25,
        totalInvoices: sales.length,
        totalTax
      },
      b2b: {
        key: "b2b",
        rows: b2bRows
      },
      b2c: {
        taxableValue: b2cTaxableValue,
        igst: b2cTax * 0.5,
        cgst: b2cTax * 0.25,
        sgst: b2cTax * 0.25,
        count: b2cCount
      },
      hsn: hsnArray,
      sections: [
        { key: "b2b", title: "4A - B2B Invoices", amount: b2bTaxable, count: b2bRows.length },
        { key: "b2c", title: "7 - B2C Small Invoices", amount: b2cTaxableValue, count: b2cCount },
        { key: "hsn", title: "12 - HSN Summary", totalTax }
      ]
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getGSTR3B = async (req, res) => {
  try {
    const { period } = req.query;
    let saleWhere = {};
    let purchaseWhere = {};

    if (period) {
      const [year, month] = period.split('-');
      const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
      const startOfNextMonth = new Date(Date.UTC(year, month, 1));
      
      saleWhere.saleDate = {
        [Op.gte]: startOfMonth,
        [Op.lt]: startOfNextMonth
      };
      purchaseWhere.purchaseDate = {
        [Op.gte]: startOfMonth,
        [Op.lt]: startOfNextMonth
      };
    }

    const sales = await Sale.findAll({ where: saleWhere });
    const purchases = await Purchase.findAll({ where: purchaseWhere });

    const outwardTaxable = sales.reduce((acc, s) => acc + Number(s.baseRate || 0), 0);
    const outwardTax = sales.reduce((acc, s) => acc + Number(s.tax || 0), 0);
    const outwardIgst = outwardTax * 0.5;
    const outwardCgst = outwardTax * 0.25;
    const outwardSgst = outwardTax * 0.25;

    const purchaseValue = purchases.reduce((acc, p) => acc + Number(p.baseRate || 0), 0);
    const totalItc = purchases.reduce((acc, p) => acc + Number(p.tax || 0), 0);
    const itcIgst = totalItc * 0.5;
    const itcCgst = totalItc * 0.25;
    const itcSgst = totalItc * 0.25;

    const netPayable = Math.max(0, outwardTax - totalItc);
    const payableIgst = Math.max(0, outwardIgst - itcIgst);
    const payableCgst = Math.max(0, outwardCgst - itcCgst);
    const payableSgst = Math.max(0, outwardSgst - itcSgst);
    const interest = 0;

    return res.status(200).json({
      summary: {
        outwardTaxable,
        outwardIgst,
        outwardCgst,
        outwardSgst,
        totalItc,
        itcIgst,
        itcCgst,
        itcSgst,
        netPayable,
        payableIgst,
        payableCgst,
        payableSgst,
        interest
      },
      sections: [
        { title: '3.1 Outward Taxable Supplies', taxableValue: outwardTaxable, integratedTax: outwardIgst, centralTax: outwardCgst, stateTax: outwardSgst },
        { title: '4. Eligible ITC', taxableValue: purchaseValue, integratedTax: itcIgst, centralTax: itcCgst, stateTax: itcSgst },
        { title: '5. Payment of Tax', netPayable }
      ]
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getEInvoices,
  getEWayBills,
  generateEInvoice,
  generateEWayBill,
  cancelEInvoice,
  cancelEWayBill,
  getGSTR1,
  getGSTR3B,
};
