'use strict';

/**
 * Caching server.
 * (C) 2013 Alex Fernández.
 */


// requires
var Log = require('log');
var testing = require('testing');

// globals
var log = new Log('info');


/**
 * Start the server.
 */
exports.start = function(options, callback)
{
	callback(null);
};

/**
 * Test that the server starts.
 */
function testStart(callback)
{
	exports.start({}, callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run({
		start: testStart,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}


