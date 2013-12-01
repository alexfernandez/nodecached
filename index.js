'use strict';

/**
 * Publish API functions for caching.
 * (C) 2013 Alex Fernández.
 */


// requires
var server = require('./lib/server.js');
var client = require('./lib/client.js');
var memory = require('./lib/memory.js');

// exports
exports.start = server.start;
exports.Client = client.Client;
exports.Cache = memory.Cache;


