const Brand = require('../mysql-models/Brand');

const getBrands = async (req, res) => {
  try {
    const brands = await Brand.findAll({ order: [['name', 'ASC']] });
    return res.status(200).json({ success: true, data: brands });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createBrand = async (req, res) => {
  try {
    const { name, logo, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Brand name is required' });

    const brand = await Brand.create({ name, logo, description, isActive: true });
    return res.status(201).json({ success: true, message: 'Brand created', data: brand });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, logo, description, isActive } = req.body;

    const brand = await Brand.findByPk(id);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    await brand.update({
      name: name !== undefined ? name : brand.name,
      logo: logo !== undefined ? logo : brand.logo,
      description: description !== undefined ? description : brand.description,
      isActive: isActive !== undefined ? Boolean(isActive) : brand.isActive,
    });

    return res.status(200).json({ success: true, message: 'Brand updated', data: brand });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deleteBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const brand = await Brand.findByPk(id);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    await brand.destroy();
    return res.status(200).json({ success: true, message: 'Brand deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { getBrands, createBrand, updateBrand, deleteBrand };
