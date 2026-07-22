const express = require('express');
const router = express.Router();
const {
  getNotificationTemplates,
  updateNotificationTemplates,
  sendNotification,
  sendOverdueReminder,
} = require('../mysql-controllers/notificationController');

router.get('/get-Templates', getNotificationTemplates);
router.post('/update-Templates', updateNotificationTemplates);
router.post('/send-Notification', sendNotification);
router.post('/send-OverdueReminder/:partyId', sendOverdueReminder);

module.exports = router;
