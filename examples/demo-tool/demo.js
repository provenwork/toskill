'use strict';
if (process.argv.length !== 3) { console.error('usage: node demo.js text'); process.exitCode = 1; }
else console.log(process.argv[2].toUpperCase());

