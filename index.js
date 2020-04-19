'use strict';

/**
 * Publish API functions for caching.
 * (C) 2013 Alex Fernández.
 */


// requires
const {start} = require('./lib/server.js');
const {Client} = require('./lib/client.js');
const {Cache} = require('./lib/memory.js');

// exports
module.exports = {start, Client, Cache}

