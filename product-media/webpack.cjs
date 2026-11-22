const path = require('node:path');
const { globalPaths } = require('node:module');

module.exports = {
  mode: 'production',
  entry: path.resolve(__dirname, 'ProductMediaGallery.js'),
  output: { path: path.resolve(__dirname, '../public/product-media'), filename: 'gallery.js' },
  resolve: { modules: [path.resolve(__dirname, '../GerainaOS/frontend/node_modules'), 'node_modules', ...globalPaths] },
  performance: { hints: false },
};
