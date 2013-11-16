'use strict';

/**
 * nodecached server: memory functions.
 * (C) 2013 Alex Fernández.
 */


// requires
var Log = require('log');
var token = require('./token.js');
var testing = require('testing');

// globals
var cache = {};
var log = new Log('info');


/**
 * Get a record from the cache. Params:
 *	- key: the key to look up.
 * Returns the current record (with key, flags, expiration and value), or null if not in the cache.
 */
exports.getRecord = function(key)
{
	if (!(key in cache))
	{
		return null;
	}
	var record = cache[key];
	if (!record.isValid())
	{
		return null;
	}
	return record;
};

/**
 * Set something in the cache. Params:
 *	- key: the key to look up.
 *	- flags: to store with the value.
 *	- expirationSeconds: the number of seconds that the item must live, at most.
 *	- value: the value to store.
 * Returns true if the item was stored.
 */
exports.setRecord = function(key, flags, expirationSeconds, value)
{
	cache[key] = new Record(flags, expirationSeconds, value);
	return true;
};

/**
 * Delete a record from the cache. Params:
 *	- key: the key to look up.
 * Returns true if the item was deleted, false if not in the cache.
 */
exports.deleteRecord = function(key)
{
	if (!(key in cache))
	{
		return false;
	}
	delete cache[key];
	return true;
};

/**
 * Test to get, set and delete a test record.
 */
function testGetRecord(callback)
{
	var key = 'test#' + token.create();
	var value = {};
	testing.assertEquals(exports.getRecord(key), null, 'Could get key before setting it', callback);
	testing.assert(exports.setRecord(key, 0, value), 'Could not set key', callback);
	testing.assert(exports.deleteRecord(key), 'Could not delete key', callback);
	testing.assertEquals(exports.getRecord(key), null, 'Could get key after deleting it', callback);
	testing.success(callback);
}

/**
 * A record to store in memory.
 */
var Record = function(flags, expirationSeconds, value)
{
	// self-reference
	var self = this;

	// attributes
	self.flags = flags;
	self.expiration = 0;
	self.value = value;

	// init
	if (expirationSeconds)
	{
		self.expiration = Date.now() + 1000 * expirationSeconds;
	}

	/**
	 * Find out if the record is still valid.
	 */
	self.isValid = function()
	{
		if (!self.expiration)
		{
			return true;
		}
		log.debug('Now: %s, expiration: %s', Date.now(), self.expiration);
		return (Date.now() < self.expiration);
	};
};

/**
 * Test record creation.
 */
function testRecord(callback)
{
	var record = new Record(null, 1, 'b');
	testing.assert(record.isValid(), 'Should be valid', callback);
	record = new Record(null, -1, 'b');
	testing.assert(!record.isValid(), 'Should not be valid', callback);
	testing.success(callback);
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
	var record = exports.getRecord(key);
	if (!record)
	{
		return callback(null);
	}
	callback(null, record.value);
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
	cache[key] = new Record(0, lifetime, value);
	if (callback)
	{
		callback(null, true);
	}
};

/**
 * Delete a value. Params:
 *	- key: to look up.
 *	- value: to store.
 *	- lifetime: seconds to live, 0 for always.
 *	- callback: function(error, result) where result is true if deleted.
 * Part of the node-memcached API.
 */
exports.delete = function(key, callback)
{
	var deleted = exports.deleteRecord(key);
	if (callback)
	{
		callback(null, deleted);
	}
};

/**
 * Test the node-memcached API.
 */
function testNodeMemcachedAPI(callback)
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
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run({
		getRecord: testGetRecord,
		record: testRecord,
		nodeMemcached: testNodeMemcachedAPI,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}


