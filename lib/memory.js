'use strict';
/* jshint camelcase: false */

/**
 * nodecached server: memory functions.
 * (C) 2013 Alex Fernández.
 */


// requires
var Log = require('log');
var token = require('./token.js');
var packageJson = require('../package.json');
var prototypes = require('prototypes');
var testing = require('testing');

// globals
var log = new Log('info');

// constants
var MAX_RELATIVE_SECONDS = 60*60*24*30;


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
		if (expirationSeconds < MAX_RELATIVE_SECONDS)
		{
			self.expiration = Date.now() + 1000 * expirationSeconds;
		}
		else
		{
			self.expiration = 1000 * expirationSeconds;
		}
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
	var totalItems = 0;

	// init
	init();

	/**
	 * Init memory structures.
	 */
	function init()
	{
		if (!options)
		{
			options = {port: 0};
			return;
		}
		var size = parseInt(options, 10);
		if (size)
		{
			maxRecords = size;
			return;
		}
		maxSizeMb = options.maxSizeMb;
	}

	/**
	 * Find out if the cache contains the given key.
	 */
	self.contains = function(key)
	{
		if (!(key in records))
		{
			return false;
		}
		var record = records[key];
		if (!record.isValid())
		{
			return false;
		}
		return true;
	};

	/**
	 * Get a value from the cache. Params:
	 *	- key: the key to look up.
	 * Returns the current value, or null if not in the cache.
	 */
	self.get = function(key)
	{
		if (!self.contains(key))
		{
			return null;
		}
		return records[key].value;
	};

	/**
	 * Set a record in the cache. Params:
	 *	- key: the key to look up.
	 *	- value: to store.
	 *	- expirationSeconds: time to live, or 0 for unlimited.
	 *	- flags: for the value.
	 * Returns true if the item was stored.
	 */
	self.set = function(key, value, expirationSeconds, flags)
	{
		var record = new Record(value, expirationSeconds, flags);
		records[key] = record;
		totalItems++;
		process.nextTick(purge);
		return true;
	};

	/**
	 * Add a record to the cache, only if it is not present. Params equal to set().
	 */
	self.add = function(key)
	{
		if (self.contains(key))
		{
			return false;
		}
		return self.set.apply(self, arguments);
	};

	/**
	 * Replace a record in the cache, only if already present. Params equal to set().
	 */
	self.replace = function(key)
	{
		if (!self.contains(key))
		{
			return false;
		}
		return self.set.apply(self, arguments);
	};

	/**
	 * Append to a record in the cache, only if already present. Params equal to set().
	 * Expiration seconds and flags ignored.
	 */
	self.append = function(key, value)
	{
		return getStringRecord(key, function(record)
		{
			record.value += value;
		});
	};

	/**
	 * Append to a record in the cache, only if already present. Params equal to set().
	 * Expiration seconds and flags ignored.
	 */
	self.prepend = function(key, value)
	{
		return getStringRecord(key, function(record)
		{
			record.value = value + record.value;
		});
	};

	/**
	 * Get the record with the value as a string.
	 */
	function getStringRecord(key, modify)
	{
		if (!self.contains(key))
		{
			return false;
		}
		var record = records[key];
		if (typeof record.value != 'string')
		{
			record.value = JSON.stringify(record.value);
		}
		modify(record);
		return true;
	}

	/**
	 * Delete a record from the cache. Params:
	 *	- key: the key to look up.
	 * Returns true if the item was deleted, false if not in the cache.
	 */
	self.delete = function(key)
	{
		if (!self.contains(key))
		{
			return false;
		}
		delete records[key];
		process.nextTick(purge);
		return true;
	};

	/**
	 * Increment a key with a value. Only valid for numbers. Params:
	 *	- key: the key to look up.
	 * Returns false if not found, new value otherwise.
	 */
	self.incr = function(key, value)
	{
		if (!self.contains(key))
		{
			return false;
		}
		var record = records[key];
		if (!prototypes.isNumber(record.value))
		{
			throw new Error('cannot increment or decrement non-numeric value');
		}
		var original = parseInt(record.value, 10);
		var result = original + value;
		if (result < 0)
		{
			result = 0;
		}
		record.value = result;
		return record.value;
	};

	/**
	 * Decrement a key with a value. Only valid for numbers. Params:
	 *	- key: the key to look up.
	 * Returns false if not found, new value otherwise.
	 */
	self.decr = function(key, value)
	{
		return self.incr(key, -value);
	};


	/**
	 * Change the expiration seconds of a record. Params:
	 *	- key: the key to look up.
	 *	- expirationSeconds: time to live, or 0 for unlimited.
	 */
	self.touch = function(key, expirationSeconds)
	{
		if (!self.contains(key))
		{
			return false;
		}
		var record = records[key];
		log.debug('touching: %j', record);
		record.expirationSeconds = expirationSeconds;
		process.nextTick(purge);
		return true;
	};

	/**
	 * Return an object with stats. Params:
	 *	- type: of stats wanted, ignored by now.
	 */
	self.stats = function(type)
	{
		if (type)
		{
			log.error('Unsupported stats type %s', type);
		}
		return {
			pid: process.pid,
			uptime: process.uptime(),
			time: Math.floor(Date.now() / 1000),
			version: self.version(),
			curr_items: records.countProperties(),
			total_items: totalItems,
			bytes: process.memoryUsage().rss,
			max_bytes: maxSizeMb * 1024 * 1024,
			tcpport: options.port,
			num_threads: 1,
			cas_enabled: 'no',
			evictions: 'on',
		};
	};

	/**
	 * Flush all items.
	 */
	self.flush = function()
	{
		records = {};
		log.notice('All items flushed');
		return true;
	};

	/**
	 * Flush all after an optional expiration in seconds.
	 */
	self.flush_all = function(expiration)
	{
		setTimeout(self.flush, expiration * 1000);
		return true;
	};

	/**
	 * Return the current version string.
	 */
	self.version = function()
	{
		return packageJson.name + '-' + packageJson.version;
	};

	/**
	 * Get a complete record from the cache. Params:
	 *	- key: the key to look up.
	 * Returns the current record (with flags, expiration and value), or null if not in the cache.
	 * Warning: returns even expired records, use with care.
	 */
	self.getRecord = function(key)
	{
		return records[key];
	};

	/**
	 * Get item directly. Params:
	 *	- key: the key to look up.
	 * Part of jscache API.
	 */
	self.getItem = function(key)
	{
		if (!self.contains(key))
		{
			return null;
		}
		return records[key].value;
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
		if (itemOptions)
		{
			if (itemOptions.expirationSeconds)
			{
				lifetime = itemOptions.expirationSeconds;
			}
			if (itemOptions.expirationAbsolute)
			{
				lifetime = (Date.now() - itemOptions.expirationAbsolute.getTime()) / 1000;
			}
		}
		log.debug('storing: %j', value);
		self.set(key, value, lifetime, 0);
	};

	/**
	 * Remove an item. Params:
	 *	- key: the key to look up.
	 * Part of jscache API.
	 */
	self.removeItem = function(key)
	{
		return self.delete(key);
	};

	/**
	 * Get how many items are stored.
	 * Part of jscache API.
	 */
	self.size = function()
	{
		return records.countProperties();
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
function testGetSet(callback)
{
	var key = 'test#' + token.create();
	var value = {a: 'b'};
	var cache = new exports.Cache();
	testing.assertEquals(cache.get(key), null, 'Could get record before setting it', callback);
	testing.assert(cache.set(key, value), 'Could not set record', callback);
	testing.assertEquals(cache.get(key), value, 'Got different record', callback);
	testing.assert(cache.append(key, 'aa'), 'Could not append', callback);
	var appended = JSON.stringify(value) + 'aa';
	testing.assertEquals(cache.get(key), appended, 'Invalid appended', callback);
	testing.assert(cache.prepend(key, 'bb'), 'Could not preppend', callback);
	testing.assertEquals(cache.get(key), 'bb' + appended, 'Invalid prepended', callback);
	testing.assert(cache.delete(key), 'Could not delete record', callback);
	testing.assertEquals(cache.get(key), null, 'Could get record after deleting it', callback);
	testing.success(callback);
}

/**
 * Test the stats function.
 */
function testStats(callback)
{
	var key = 'test#' + token.create();
	var value = {a: 'b'};
	var cache = new exports.Cache();
	testing.assert(cache.set(key, value), 'Could not set record 1', callback);
	testing.assert(cache.set(key, value), 'Could not set record 2', callback);
	var stats = cache.stats();
	testing.assert(stats, 'Could not get stats', callback);
	testing.assertEquals(stats.curr_items, 1, 'Invalid curr_items', callback);
	testing.assertEquals(stats.total_items, 2, 'Invalid total_items', callback);
	testing.success(callback);
}

/**
 * Test incr and decr.
 */
function testIncrDecr(callback)
{
	var key = 'test#' + token.create();
	var cache = new exports.Cache();
	testing.assert(cache.set(key, '10'), 'Should set record', callback);
	testing.assertEquals(cache.incr(key, 5), 15, 'Not incremented', callback);
	testing.assertEquals(cache.decr(key, 5), 10, 'Not decremented', callback);
	testing.assertEquals(cache.decr(key, 15), 0, 'Not decremented to 0', callback);
	testing.assert(cache.set(key, 'aaa'), 'Should set record again', callback);
	try
	{
		cache.incr(key, 5);
		testing.failure('Incr with non-number should fail', callback);
	}
	catch(exception)
	{
		testing.assert(exception.message.startsWith('cannot'), 'Invalid exception', callback);
	}
	testing.success(callback);
}

/**
 * Test other functions.
 */
function testOther(callback)
{
	var cache = new exports.Cache();
	testing.assert(!cache.touch('a', 5), 'Should not touch invalid key', callback);
	testing.assert(cache.version().startsWith('nodecached'), 'Invalid version string', callback);
	testing.assert(cache.flush(), 'Not flushed', callback);
	testing.success(callback);
}

/**
 * Test the jscache interface.
 * https://github.com/monsur/jscache
 */
function testJsCache(callback)
{
	var key = 'test#' + token.create();
	var value = {a: 'a'};
	var cache = new exports.Cache();
	testing.assert(!cache.getItem(key), 'Should not getItem()', callback);
	testing.assertEquals(cache.size(), 0, 'Invalid size() befoe get', callback);
	cache.setItem(key, value);
	testing.assertEquals(cache.getItem(key), value, 'Invalid getItem()', callback);
	testing.assertEquals(cache.size(), 1, 'Invalid size() after set', callback);
	cache.removeItem(key);
	testing.assert(!cache.getItem(key), 'Should not getItem() after deleting it', callback);
	testing.assertEquals(cache.size(), 0, 'Invalid size() after delete', callback);
	testing.success(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run([
		testRecord,
		testGetSet,
		testStats,
		testIncrDecr,
		testOther,
		testJsCache,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}


