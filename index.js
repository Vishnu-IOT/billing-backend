const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');
require('./mysql-models/modelfk');

// Load env vars
dotenv.config();

// Connect to database
// await connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes
app.use('/api/parties', require('./routes/partyRoutes'));
app.use('/api/users', require('./routes/usersRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/purchase', require('./routes/purchaseRoutes'));
app.use('/api/category', require('./routes/categoryRoutes'));
app.use('/api/company', require('./routes/companyRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/documents', require('./routes/documentRoutes'));
app.use('/api/compliance', require('./routes/complianceRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/owners', require('./routes/ownerRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));


app.get('/', (req, res) => {
  res.send('API is working for Sales Website');
});

app.get('/new', (req, res) => {
  res.send('API is working on new platform!');
});

// Error Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

app.listen(PORT, '0.0.0.0', () =>
  console.log(`Server started on port ${PORT}`)
);
