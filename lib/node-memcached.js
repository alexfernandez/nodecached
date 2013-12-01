'use strict';

/**
 * nodecached server: node-memcached interface.
 * https://github.com/3rd-Eden/node-memcached
 * (C) 2013 Alex Fernández.
 */


// requires
var Log = require('log');
var Cache = require('./memory.js').Cache;
var token = require('./token.js');
var testing = require('testing');

// globals
var defaultCache = null;
var log = new Log('info');


/**
 * Get the default cache, or create it if necessary.
 */
function getDefaultCache()
{
	if (!defaultCache)
	{
		log.debug('Creating default cache');
		defaultCache = new Cache(0);
	}
	return defaultCache;
}

/**
 * Get a value from the cache. Params:
 *	- key: to look up.
 *	- callback: function(error, result) to call with the value.
 * Part of the node-memcached API.
 */
exports.get = function(key, callback)
{
	if (!callback)
	{
		log.error('Missing callback in get()');
		return;
	}
	callback(null, getDefaultCache().getItem(key));
};

/**
 * Set a value in the cache. Params:
 *	- key: to look up.
 *	- value: to store.
 *	- lifetime: seconds to live, 0 for always.
 *	- callback: function(error, result) called with always null, true.
 * Part of the node-memcached API.
 */
exports.set = function(key, value, lifetime, callback)
{
	var options = {
		expirationSeconds: lifetime,
	};
	getDefaultCache().setItem(key, value, options);
	if (callback)
	{
		callback(null, true);
	}
};

/**
 * Add a value to the cache, only if not present. Params the same as set().
 */
exports.add = function(key, value, lifetime, callback)
{
	if (getDefaultCache().contains(key))
	{
		return callback(null, false);
	}
	return exports.set.apply(exports, arguments);
};

/**
 * Replace a value in the cache, only if already present. Params the same as set().
 */
exports.replace = function(key, value, lifetime, callback)
{
	if (!getDefaultCache().contains(key))
	{
		return callback(null, false);
	}
	return exports.set.apply(exports, arguments);
};

/**
 * Append to a value in the cache, only if already present.
 */
exports.append = function(key, value, callback)
{
	var appended = getDefaultCache().append(key, value);
	if (callback)
	{
		callback(null, appended);
	}
};

/**
 * Prepend to a value in the cache, only if already present.
 */
exports.prepend = function(key, value, callback)
{
	var prepended = getDefaultCache().prepend(key, value);
	if (callback)
	{
		callback(null, prepended);
	}
};

/**
 * Delete a value. Params:
 *	- key: to look up.
 *	- callback: function(error, result) where result is true if deleted.
 * Part of the node-memcached API.
 */
exports.delete = function(key, callback)
{
	var deleted = getDefaultCache().removeItem(key);
	if (callback)
	{
		callback(null, deleted);
	}
};

/**
 * Increment a value. Params:
 *	- key: to look up.
 *	- value: to increment.
 *	- callback: function(error, result) where result is the incremented value.
 * Part of the node-memcached API.
 */
exports.incr = function(key, value, callback)
{
	var result = getDefaultCache().incr(key, value);
	if (callback)
	{
		callback(null, result);
	}
};

/**
 * Decrement a value. Params:
 *	- key: to look up.
 *	- value: to decrement.
 *	- callback: function(error, result) where result is the decremented value.
 * Part of the node-memcached API.
 */
exports.decr = function(key, value, callback)
{
	var result = getDefaultCache().decr(key, value);
	if (callback)
	{
		callback(null, result);
	}
};

/**
 * Touch a value. Params:
 *	- key: to look up.
 *	- lifetime: new expiration time.
 *	- callback: function(error, result) where result is true if touched.
 * Part of the node-memcached API.
 */
exports.touch = function(key, lifetime, callback)
{
	var result = getDefaultCache().touch(key, lifetime);
	if (callback)
	{
		callback(null, result);
	}
};

/**
 * Test get, set and delete.
 */
function testGetSetDelete(callback)
{
	var key = 'test#' + token.create();
	var value = {a: 'b'};
	exports.get(key, function(error, result)
	{
		testing.check(error, 'Error getting first', callback);
		testing.assert(!result, 'Should not get', callback);
		exports.set(key, value, 10, function(error, result)
		{
			testing.check(error, 'Error setting', callback);
			testing.assert(result, 'Could not set', callback);
			exports.get(key, function(error, result)
			{
				testing.check(error, 'Error getting', callback);
				testing.assert(result, 'Could not get', callback);
				testing.assertEquals(result, value, 'Different get', callback);
				exports.delete(key, function(error, result)
				{
					testing.check(error, 'Error deleting', callback);
					testing.assert(result, 'Could not delete', callback);
					exports.get(key, function(error, result)
					{
						testing.check(error, 'Error getting last', callback);
						testing.assert(!result, 'Should not get last', callback);
						testing.success(callback);
					});
				});
			});
		});
	});
}

/**
 * Test append and prepend.
 */
function testAppendPrepend(callback)
{
	var key = 'test#' + token.create();
	var value = 'abcde';
	exports.set(key, value, 10, function(error, result)
	{
		testing.check(error, 'Error in set', callback);
		testing.assert(result, 'Should set', callback);
		exports.append(key, 'fg', function(error, result)
		{
			testing.check(error, 'Error in append', callback);
			testing.assert(result, 'Should append', callback);
			exports.prepend(key, 'z', function(error, result)
			{
				testing.check(error, 'Error in prepend', callback);
				testing.assert(result, 'Should prepend', callback);
				exports.get(key, function(error, result)
				{
					testing.check(error, 'Error in get', callback);
					testing.assertEquals(result, 'zabcdefg', 'Invalid get', callback);
					testing.success(callback);
				});
			});
		});
	});
}

/**
 * Test incr, decr and touch.
 */
function testIncrDecrTouch(callback)
{
	var key = 'test#' + token.create();
	exports.incr(key, 5, function(error, result)
	{
		testing.check(error, 'Error in incr', callback);
		testing.assert(!result, 'Should not incr', callback);
		exports.decr(key, 6, function(error, result)
		{
			testing.check(error, 'Error in decr', callback);
			testing.assert(!result, 'Should not decr', callback);
			exports.touch(key, 0, function(error, result)
			{
				testing.check(error, 'Error in touch', callback);
				testing.assert(!result, 'Should not touch', callback);
				testing.success(callback);
			});
		});
	});
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run([
		testGetSetDelete,
		testAppendPrepend,
		testIncrDecrTouch,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}


