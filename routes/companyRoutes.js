const express = require('express');
const router = express.Router();

const {
  getCompanyById,
  getUsers,
  addUser,
  updateUser,
  createCompany,
  updateCompany,
  createCompanyFinancials,
  getCompanyFinancials,
  updateCompanyFinancials,
  deleteUsers,
} = require('../mysql-controllers/companyController');

router.get('/get-User/:companyId', getUsers);
router.post('/add-User/:companyId', addUser);
router.post('/update-User/:id', updateUser);
router.post('/delete-User/:id', deleteUsers);

router.get('/get-Company/:id', getCompanyById);
router.post('/add-Company', createCompany);
router.post('/update-Company/:id', updateCompany);

router.get('/get-CompanyFinancials/:id', getCompanyFinancials);
router.post('/add-CompanyFinancials', createCompanyFinancials);
router.post(
  '/update-CompanyFinancials/:companyId/:id',
  updateCompanyFinancials
);

module.exports = router;
