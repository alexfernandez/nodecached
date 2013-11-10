'use strict';

/**
 * nodecached loadtesting client.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var token = require('./token.js');
var server = require('./server.js');
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
	var totalRequests = 0;
	var totalResponses = 0;
	var totalErrors = 0;
	var start = Date.now();
	var key = options.key || 'test' + token.create();
	var concurrency = options.concurrency || 1;
	var callback;

	// init
	init();

	/**
	 * Init the operation.
	 */
	function init()
	{
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
		if (options.maxRequests && totalRequests >= options.maxRequests)
		{
			return;
		}
		var client = freeClients[index];
		if (!client)
		{
			log.error('Client %s not free', index);
			return;
		}
		totalRequests += 1;
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
			log.debug('Received response: %s', result);
			totalResponses += 1;
			if (error)
			{
				log.error('Received error: %s', error);
				totalErrors += 1;
			}
			else if (!result)
			{
				totalErrors += 1;
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
		if (options.maxRequests && totalResponses >= options.maxRequests)
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
		var elapsedSeconds = (Date.now() - start) / 1000;
		var rps = Math.round(totalRequests / elapsedSeconds);
		var meanTimeMs = 1000 * elapsedSeconds / totalRequests;
		if (callback)
		{
			callback({
				totalRequests: totalRequests,
				totalResponses: totalResponses,
				totalErrors: totalErrors,
				totalTimeSeconds: elapsedSeconds,
				rps: rps,
				meanTimeMs: meanTimeMs,
			});
		}
		else
		{
			log.info('Concurrency Level:      %s', concurrency);
			log.info('Time taken for tests:   %s seconds', elapsedSeconds);
			log.info('Complete requests:      %s', totalRequests);
			log.info('Failed requests:        %s', totalErrors);
			log.info('Write errors:           0');
			//log.info('Total transferred:      x bytes');
			log.info('Requests per second:    %s [#/sec] (mean)', rps);
			log.info('Time per request:       %s [ms] (mean)', meanTimeMs);
			log.info('Time per request:       %s [ms] (mean, across all concurrent requests)', meanTimeMs / concurrency);
			//log.info('Transfer rate:          x [Kbytes/sec] received');
		}
	}
}

/**
 * Test loadtest.
 */
function testLoadTest(callback)
{
	var options = {
		port: 11237,
		maxRequests: 10000,
		key: 'test' + token.create(),
	};
	server.start(options, function(error, nodecached)
	{
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
					testing.assertEquals(results.totalResponses, options.maxRequests, 'Invalid number of responses', callback);
					server.stop(nodecached, function(error)
					{
						testing.check(error, 'Could not stop server', callback);
						testing.success(results, callback);
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
		loadTest: testLoadTest,
	}, 5000, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	return exports.test(testing.show);
}

