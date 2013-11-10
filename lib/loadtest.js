'use strict';

/**
 * nodecached loadtesting client.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var token = require('./token.js');
var Client = require('./client.js').Client;
var Log = require('log');
var testing = require('testing');

// globals
var log = new Log('info');


/**
 * Run load tests on a memcached server. Options is an object which may have:
 *	- host: to test.
 *	- port: to connect to.
 *	- concurrency: number of simultaneous connections to make.
 *	- maxRequests: number of requests to send.
 *	- maxSeconds: time to spend sending requests.
 *	- key: the key to use.
 * An optional callback is called after tests have run.
 */
exports.run = function(options, callback)
{
	var operation = new Operation(options);
	operation.start(callback);
};

/**
 * A load test operation. Options are the same as for exports.run.
 */
function Operation(options)
{
	// self-reference
	var self = this;

	// attributes
	var freeClients = {};
	var busyClients = {};
	var requests = 0;
	var responses = 0;
	var errors = 0;
	var start = Date.now();
	var key = options.key || 'test' + token.create();
	var callback;

	// init
	init();

	/**
	 * Init the operation.
	 */
	function init()
	{
		var concurrency = options.concurrency || 1;
		for (var i = 0; i < concurrency; i++)
		{
			freeClients[i] = new Client(options, run);
		}
	}

	/**
	 * Start the operation.
	 * An optional callback will be called after tests finish.
	 */
	self.start = function(hook)
	{
		callback = hook;
	};

	/**
	 * Run a few requests on free clients.
	 */
	function run()
	{
		if (isFinished())
		{
			finish();
		}
		for (var index in freeClients)
		{
			makeBusy(index);
		}
	}

	/**
	 * Make a client busy.
	 */
	function makeBusy(index)
	{
		if (options.maxRequests && requests >= options.maxRequests)
		{
			return;
		}
		var client = freeClients[index];
		if (!client)
		{
			log.error('Client %s not free', index);
			return;
		}
		requests += 1;
		delete freeClients[index];
		busyClients[index] = client;
		client.get(key, getReceiver(index, client));
	}
	
	/**
	 * Get a function to receive a response.
	 */
	function getReceiver(index)
	{
		return function(error, result)
		{
			log.info('Received response: %s', result);
			responses += 1;
			if (error)
			{
				log.error('Received error: %s', error);
				errors += 1;
			}
			else if (!result)
			{
				log.error('Empty result');
				errors += 1;
			}
			var client = busyClients[index];
			if (!client)
			{
				log.error('Client %s is not busy', index);
				return;
			}
			delete busyClients[index];
			freeClients[index] = client;
			run();
		};
	}

	function isFinished()
	{
		if (options.maxRequests && responses >= options.maxRequests)
		{
			return true;
		}
		if (options.maxSeconds)
		{
			var elapsed = (Date.now() - start) / 1000;
			if (elapsed >= options.maxSeconds)
			{
				return true;
			}
		}
		return false;
	}

	/**
	 * Finish the load test.
	 */
	function finish()
	{
		freeClients.overwriteWith(busyClients);
		for (var index in freeClients)
		{
			freeClients[index].stop();
		}
		callback({
			requests: requests,
			responses: responses,
			errors: errors,
		});
	}
}

/**
 * Test loadtest.
 */
function testLoadTest(callback)
{
	var options = {
		port: 11215,
		maxRequests: 10,
		debug: true,
		key: 'test' + token.create(),
	};
	var client = new Client(options, function(error)
	{
		testing.check(error, 'Could not create test client', callback);
		client.set(options.key, 10, {b: 'c'}, function(error, result)
		{
			client.stop();
			testing.check(error, 'Could not set test', callback);
			testing.assert(result, 'Could not set test', callback);
			exports.run(options, function(results)
			{
				testing.assertEquals(results.responses, options.maxRequests, 'Invalid number of responses', callback);
				testing.success(results, callback);
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
		loadTest: testLoadTest,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

