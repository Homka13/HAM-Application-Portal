const prisma = require('../config/db');

const createApplication = async (req, res) => {
  const { applicantName } = req.body;
  const application = await prisma.application.create({
    data: { applicantName },
  });
  res.status(201).json(application);
};

const getApplications = async (req, res) => {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.status(200).json(applications);
};

module.exports = { createApplication, getApplications };
