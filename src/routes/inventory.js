const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json([]); // TODO: replace with real inventory query
});

module.exports = router;