const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const frontendRequire = createRequire(resolve(__dirname, '../GerainaOS/frontend/package.json'));
const webpack = frontendRequire('webpack');
const config = require('./webpack.cjs');
webpack(config, (error, stats) => { if (error || stats.hasErrors()) { console.error(error || stats.toString({errors:true})); process.exitCode=1; } else console.log(stats.toString({assets:true,modules:false})); });
