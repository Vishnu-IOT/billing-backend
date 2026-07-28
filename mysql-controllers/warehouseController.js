const Warehouse = require('../mysql-models/Warehouse');

// Ensure at least default warehouse exists
const ensureDefaultWarehouse = async () => {
  const count = await Warehouse.count();
  if (count === 0) {
    await Warehouse.create({
      name: 'Main Warehouse',
      code: 'WH-MAIN',
      address: 'Headquarters Godown',
      isDefault: true,
      isActive: true,
    });
  }
};

// Get all warehouses
const getWarehouses = async (req, res) => {
  try {
    await ensureDefaultWarehouse();
    const warehouses = await Warehouse.findAll({
      order: [['isDefault', 'DESC'], ['createdAt', 'ASC']],
    });
    return res.status(200).json({
      success: true,
      data: warehouses,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Create a warehouse
const createWarehouse = async (req, res) => {
  try {
    const { name, code, address, phone, isDefault } = req.body;

    if (!name || !code) {
      return res.status(400).json({ message: 'Warehouse name and code are required' });
    }

    if (isDefault) {
      await Warehouse.update({ isDefault: false }, { where: {} });
    }

    const warehouse = await Warehouse.create({
      name,
      code: code.toUpperCase(),
      address,
      phone,
      isDefault: Boolean(isDefault),
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Warehouse created successfully',
      data: warehouse,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Update warehouse
const updateWarehouse = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, address, phone, isDefault, isActive } = req.body;

    const warehouse = await Warehouse.findByPk(id);
    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    if (isDefault) {
      await Warehouse.update({ isDefault: false }, { where: {} });
    }

    await warehouse.update({
      name: name !== undefined ? name : warehouse.name,
      code: code !== undefined ? code.toUpperCase() : warehouse.code,
      address: address !== undefined ? address : warehouse.address,
      phone: phone !== undefined ? phone : warehouse.phone,
      isDefault: isDefault !== undefined ? Boolean(isDefault) : warehouse.isDefault,
      isActive: isActive !== undefined ? Boolean(isActive) : warehouse.isActive,
    });

    return res.status(200).json({
      success: true,
      message: 'Warehouse updated successfully',
      data: warehouse,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Delete warehouse
const deleteWarehouse = async (req, res) => {
  try {
    const { id } = req.params;
    const warehouse = await Warehouse.findByPk(id);

    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    if (warehouse.isDefault) {
      return res.status(400).json({ message: 'Cannot delete default warehouse' });
    }

    await warehouse.destroy();

    return res.status(200).json({
      success: true,
      message: 'Warehouse deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
