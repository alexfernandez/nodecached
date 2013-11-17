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
var log = new Log('info');


/**
 * A record to store in memory. Params:
 *	- value: the value to store.
 *	- expirationSeconds: the number of seconds that the item must live, at most.
 *	- flags: to store with the value.
 */
var Record = function(value, expirationSeconds, flags)
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
	var record = new Record('b', 1, null);
	testing.assert(record.isValid(), 'Should be valid', callback);
	record = new Record('b', -1, null);
	testing.assert(!record.isValid(), 'Should not be valid', callback);
	testing.success(callback);
}

/**
 * An in-memory cache object.
 * Options can be an integer defining the size of the cache in items.
 * Otherwise it is an object that may hold:
 *	- maxSizeMb: max size of the cache in MB.
 * Compatible with jscache API: https://github.com/monsur/jscache.
 */
exports.Cache = function(options)
{
	// self-reference
	var self = this;

	// attributes
	var records = {};
	var maxRecords;
	var maxSizeMb;

	// init
	init();

	/**
	 * Init memory structures.
	 */
	function init()
	{
		var size = parseInt(options, 10);
		if (size)
		{
			maxRecords = size;
			return;
		}
		maxSizeMb = options.maxSizeMb;
	}

	/**
	 * Get a record from the cache. Params:
	 *	- key: the key to look up.
	 * Returns the current record (with flags, expiration and value), or null if not in the cache.
	 */
	self.getRecord = function(key)
	{
		if (!(key in records))
		{
			return null;
		}
		var record = records[key];
		if (!record.isValid())
		{
			return null;
		}
		return record;
	};

	/**
	 * Set a record in the cache. Params:
	 *	- key: the key to look up.
	 *	- value: to store.
	 *	- expirationSeconds: time to live, or 0 for unlimited.
	 *	- flags: for the value.
	 * Returns true if the item was stored.
	 */
	self.setRecord = function(key, value, expirationSeconds, flags)
	{
		var record = new Record(value, expirationSeconds, flags);
		log.debug('storing: %j', record);
		records[key] = record;
		process.nextTick(purge);
		return true;
	};

	/**
	 * Delete a record from the cache. Params:
	 *	- key: the key to look up.
	 * Returns true if the item was deleted, false if not in the cache.
	 */
	self.deleteRecord = function(key)
	{
		if (!(key in records))
		{
			return false;
		}
		delete records[key];
		process.nextTick(purge);
		return true;
	};

	/**
	 * Get item directly. Params:
	 *	- key: the key to look up.
	 * Part of jscache API.
	 */
	self.getItem = function(key)
	{
		var record = records[key];
		log.debug('Got record: %j', record);
		if (!record)
		{
			return null;
		}
		return record.value;
	};

	/**
	 * Set an item directly. Params:
	 *	- key: the key to look up.
	 *	- value: to set.
	 *	- itemOptions: may contain:
	 *		- expirationAbsolute: the time to expire.
	 *		- expirationSeconds: seconds to expire.
	 * Part of jscache API.
	 */
	self.setItem = function(key, value, itemOptions)
	{
		var lifetime = 0;
		if (itemOptions.expirationSeconds)
		{
			lifetime = itemOptions.expirationSeconds;
		}
		if (itemOptions.expirationAbsolute)
		{
			lifetime = (Date.now() - itemOptions.expirationAbsolute.getTime()) / 1000;
		}
		log.debug('storing: %j', value);
		self.setRecord(key, value, lifetime, 0);
	};

	/**
	 * Remove an item. Params:
	 *	- key: the key to look up.
	 * Part of jscache API.
	 */
	self.removeItem = function(key)
	{
		return self.deleteRecord(key);
	};

	/**
	 * Purge memory, if needed.
	 */
	function purge()
	{
		if (maxRecords)
		{
			purgeRecords();
		}
		if (maxSizeMb)
		{
			purgeMemory();
		}
	}

	function purgeRecords()
	{
		if (records.countProperties() < maxRecords)
		{
			return;
		}
		for (var key in records)
		{
			delete records[key];
			if (records.countProperties() < maxRecords)
			{
				return;
			}
		}
	}

	function purgeMemory()
	{
		var usageMb = process.memoryUsage().rss / 1024 / 1024;
		if (usageMb < maxSizeMb)
		{
			return;
		}
		log.info('Memory used %s, max %s: purging', usageMb, maxSizeMb);
		for (var key in records)
		{
			if (!records[key].isValid())
			{
				delete records[key];
			}
		}
		if (usageMb < maxSizeMb)
		{
			return;
		}
		for (key in records)
		{
			delete records[key];
			if (usageMb < maxSizeMb)
			{
				return;
			}
		}
	}
};

/**
 * Test to get, set and delete a test record.
 */
function testGetRecord(callback)
{
	var key = 'test#' + token.create();
	var value = {a: 'b'};
	var cache = new exports.Cache();
	testing.assertEquals(cache.getRecord(key), null, 'Could get record before setting it', callback);
	testing.assert(cache.setRecord(key, value), 'Could not set record', callback);
	var result = cache.getRecord(key);
	testing.assert(result, 'Could not get record', callback);
	testing.assertEquals(result.value, value, 'Got different record', callback);
	testing.assert(cache.deleteRecord(key), 'Could not delete record', callback);
	testing.assertEquals(cache.getRecord(key), null, 'Could get record after deleting it', callback);
	testing.success(callback);
}

/**
 * Get the default cache, or create it if necessary.
 */
function getDefaultCache()
{
	if (!getDefaultCache.cache)
	{
		log.debug('Creating default cache');
		getDefaultCache.cache = new exports.Cache(0);
	}
	return getDefaultCache.cache;
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
 * Delete a value. Params:
 *	- key: to look up.
 *	- value: to store.
 *	- lifetime: seconds to live, 0 for always.
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
		testRecord: testRecord,
		testGetRecord: testGetRecord,
		testNodeMemcached: testNodeMemcachedAPI,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}


