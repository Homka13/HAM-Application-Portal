const express = require('express');
const { createApplication, getApplications } = require('../controllers/applicationController');

const router = express.Router();

router.post('/', createApplication);
router.get('/', getApplications);

module.exports = router;
