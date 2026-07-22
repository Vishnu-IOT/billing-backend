const Owner = require('../mysql-models/Owner');

const getOwners = async (req, res) => {
  try {
    const owners = await Owner.findAll();
    return res.status(200).json(owners);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const addOwner = async (req, res) => {
  try {
    const { name, phone, email, sharePercentage, role, address } = req.body;

    const owner = await Owner.create({
      name,
      phone,
      email,
      sharePercentage,
      role,
      address,
    });

    return res.status(201).json(owner);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateOwner = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, sharePercentage, role, address } = req.body;

    const owner = await Owner.findByPk(id);
    if (!owner) {
      return res.status(404).json({ message: 'Owner not found' });
    }

    await owner.update({
      name,
      phone,
      email,
      sharePercentage,
      role,
      address,
    });

    return res.status(200).json(owner);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deleteOwner = async (req, res) => {
  try {
    const { id } = req.params;
    const owner = await Owner.findByPk(id);

    if (!owner) {
      return res.status(404).json({ message: 'Owner not found' });
    }

    await owner.destroy();
    return res.status(200).json({ message: 'Owner deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getOwners,
  addOwner,
  updateOwner,
  deleteOwner,
};
