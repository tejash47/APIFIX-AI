const products = [
  { id: 'prd_1', name: 'APIFIX Reliability Agent', price: 99, category: 'DevTools' },
  { id: 'prd_2', name: 'Sandbox Isolated Runner', price: 49, category: 'Infrastructure' }
];

function getProducts(req, res) {
  res.status(200).json({ products });
}

module.exports = { getProducts };
