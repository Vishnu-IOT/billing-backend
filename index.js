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
