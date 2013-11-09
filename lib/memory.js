'use strict';

/**
 * nodecached server: memory functions.
 * (C) 2013 Alex Fernández.
 */


// requires
var Log = require('log');
var testing = require('testing');

// globals
var cache = {};
var log = new Log('info');


/**
 * Get something from the cache. Params:
 *	- key: the key to look up.
 * Returns the current value, or null if not in the cache.
 */
exports.get = function(key)
{
	if (!(key in cache))
	{
		return null;
	}
	return cache[key];
};

/**
 * Set something in the cache. Params:
 *	- key: the key to look up.
 *	- expirationSeconds: the number of seconds that the item must live, at most.
 *	- value: the value to store.
 * Returns true if the item was stored.
 */
exports.set = function(key, expirationSeconds, value)
{
	cache[key] = value;
	return true;
};

/**
 * Delete something from the cache. Params:
 *	- key: the key to look up.
 * Returns true if the item was deleted, false if not in the cache.
 */
exports.delete = function(key)
{
	if (!(key in cache))
	{
		return false;
	}
	delete cache[key];
	return true;
};

/**
 * Test to get, set and delete a test value.
 */
function testGetSetDelete(callback)
{
	var key = 'test#';
	var value = {};
	testing.assertEquals(exports.get(key), null, 'Could get key before setting it', callback);
	testing.assert(exports.set(key, 0, value), 'Could not set key', callback);
	testing.assert(exports.delete(key), 'Could not delete key', callback);
	testing.assertEquals(exports.get(key), null, 'Could get key after deleting it', callback);
	testing.success(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run({
		getSet: testGetSetDelete,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}


