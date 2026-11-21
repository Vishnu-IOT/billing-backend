'use strict';

const express = require('express');
const router = express.Router();
const { authenticateLoyaltyUser } = require('../middleware/loyaltyAuth');
const {
  listOffers,
  getOffer,
  createOffer,
  updateOffer,
  archiveOffer,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  archiveCampaign,
  addCampaignProduct,
  updateCampaignProduct,
  removeCampaignProduct,
  previewPromotion,
} = require('../mysql-controllers/promotionController');

router.get('/preview', authenticateLoyaltyUser, previewPromotion);
router.route('/offers')
  .get(listOffers)
  .post(createOffer);
router.route('/offers/:id')
  .get(getOffer)
  .put(updateOffer)
  .delete(archiveOffer);

router.route('/campaigns')
  .get(listCampaigns)
  .post(createCampaign);
router.route('/campaigns/:id')
  .get(getCampaign)
  .put(updateCampaign)
  .delete(archiveCampaign);
router.route('/campaigns/:campaignId/products')
  .post(addCampaignProduct);
router.route('/campaigns/:campaignId/products/:productId')
  .put(updateCampaignProduct)
  .delete(removeCampaignProduct);

module.exports = router;
