const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
    },
    GST: {
      type: String,
      required: [true, 'Please add a GST'],
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    phone: {
      type: String,
      required: [true, 'Please add a phone number'],
    },
    // address: {
    //   street: String,
    //   city: String,
    //   state: String,
    //   zipCode: String,
    //   country: String,
    // },
    address:{
      type: String,
      required: [true, 'Please add a Address'],
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Customer', customerSchema);
