'use strict';


var assert = require('chai').assert,
	sinon = require('sinon');

var winston = require('winston'),
	appInsights = require("applicationinsights"),
	transport = require('../lib/winston-azure-application-insights');

afterEach('teardown appInsights', function() {
	appInsights.dispose();
})

describe ('winston-azure-application-insights', function() {
	describe('class', function() {
		describe('constructor', function() {

			beforeEach(function() {
				delete process.env['APPINSIGHTS_INSTRUMENTATIONKEY'];
			});

			it('should fail if no instrumentation insights instance, client or key specified', function() {
				assert.throws(function() {
					new transport.AzureApplicationInsightsLogger();
				}, /key not found/);
			});

			it('should accept an App Insights instance with the insights option', function() {

				var aiLogger;

				assert.doesNotThrow(function() {
					appInsights.setup('FAKEKEY');

					aiLogger = new transport.AzureApplicationInsightsLogger({
						insights: appInsights
					});
				});

				assert.ok(aiLogger.client);
			});

			it('should accept an App Insights client with the client option', function() {

				var aiLogger;

				assert.doesNotThrow(function() {
					aiLogger = new transport.AzureApplicationInsightsLogger({
						client: new appInsights.TelemetryClient('FAKEKEY')
					});
				});

				assert.ok(aiLogger.client);
			});

			it('should accept an instrumentation key with the key option', function() {

				var aiLogger;

				assert.doesNotThrow(function() {
					aiLogger = new transport.AzureApplicationInsightsLogger({
						key: 'FAKEKEY'
					});
				});

				assert.ok(aiLogger.client);
			});

			it('should use the APPINSIGHTS_INSTRUMENTATIONKEY environment variable if defined', function() {

				var aiLogger;

				process.env['APPINSIGHTS_INSTRUMENTATIONKEY'] = 'FAKEKEY';

				assert.doesNotThrow(function() {
					aiLogger = new transport.AzureApplicationInsightsLogger();
				});

				assert.ok(aiLogger.client);
			});

			it('should set default logging level to info', function() {
				var aiLogger = new transport.AzureApplicationInsightsLogger({
						key: 'FAKEKEY'
					});

				assert.equal(aiLogger.level, 'info');
			});

			it('should set logging level', function() {
				var aiLogger = new transport.AzureApplicationInsightsLogger({
						key: 'FAKEKEY',
						level: 'warn'
					});

				assert.equal(aiLogger.level, 'warn');
			});

			it('should declare a Winston logger', function() {
				new transport.AzureApplicationInsightsLogger({
					key: 'FAKEKEY'
				});

				assert.ok(transport.AzureApplicationInsightsLogger);
			});
		});

		describe('#log', function() {

			let logger;
			let aiTransport;
			let clientMock;
			let expectTrace;

			beforeEach(function() {
				aiTransport = new transport.AzureApplicationInsightsLogger({ key: 'FAKEKEY' });
				logger = winston.createLogger({
					transports: [aiTransport],
				});
				clientMock = sinon.mock(appInsights.defaultClient);
				expectTrace = clientMock.expects("trackTrace");
			});

			afterEach(function() {
				clientMock.restore();
			});

			it('should log with correct log levels', function() {
				clientMock.expects("trackTrace").once().withArgs({ message: 'error', severity: 3, properties: {} });
				clientMock.expects("trackTrace").once().withArgs({ message: 'warn', severity: 2, properties: {} });
				clientMock.expects("trackTrace").once().withArgs({ message: 'notice', severity: 1, properties: {} });
				clientMock.expects("trackTrace").once().withArgs({ message: 'info', severity: 1, properties: {} });
				clientMock.expects("trackTrace").once().withArgs({ message: 'verbose', severity: 0, properties: {} });
				clientMock.expects("trackTrace").once().withArgs({ message: 'debug', severity: 0, properties: {} });
				clientMock.expects("trackTrace").once().withArgs({ message: 'silly', severity: 0, properties: {} });

				['error', 'warn', 'info', 'verbose', 'debug', 'silly']
				.forEach(function(level) {
					logger.log(level, level);
				});
			});
		});

		describe('#log errors as exceptions', function() {

			let logger;
			let aiTransport;
			let clientMock;

			beforeEach(function() {
				aiTransport = new transport.AzureApplicationInsightsLogger({ key: 'FAKEKEY', treatErrorsAsExceptions: true });
				logger = winston.createLogger({
					levels: winston.config.syslog.levels,
					transports: [aiTransport],
				});
				clientMock = sinon.mock(aiTransport.client);
			});

			afterEach(function() {
				clientMock.restore();
			});

			it('should not track exceptions if the option is off', function() {
				aiTransport.treatErrorsAsExceptions = false;
				clientMock.expects("trackException").never();
				logger.error('error message');
			});

			it('should not track exceptions if level < error', function() {
				clientMock.expects("trackException").never();

				['warning', 'notice', 'info', 'debug']
				.forEach(function(level) {
					logger.log({ level, message: level });
				});
				clientMock.verify();
			});

			it('should track exceptions if level >= error and msg is a string', function() {
				['emerg', 'alert', 'crit', 'error']
				.forEach(function(level) {
					const exceptionMock = clientMock.expects("trackException").once();
					clientMock.expects("trackTrace").never();
					logger.log({ level, message: 'log level custom error msg' });
					exceptionMock.verify();
					assert.equal(exceptionMock.args[0][0].exception.message, 'log level custom error msg');
				});
				clientMock.verify();
			});

			it('should track exceptions if level == error and msg is an Error obj', function() {
				var error = new Error('error msg');
				var expectedCall = clientMock.expects("trackException");

				expectedCall.once();
				logger.error(error);
				clientMock.verify();
				assert.equal(expectedCall.args[0][0].exception.message, error.message);
				assert.equal(expectedCall.args[0][0].properties.stack, error.stack);
			});

			it('should track exceptions if level == error and meta is an Error obj', function() {
				const error = new Error('Error message');
				const expectedCall = clientMock.expects("trackException");

				expectedCall.once();
				logger.error('Log handling message', error);
				clientMock.verify();
				assert.equal(expectedCall.args[0][0].properties.message, 'Log handling message: Error message');
			});
		});
	});

	describe('winston', function() {

		class ExtendedError extends Error {
			constructor(message, arg1, arg2) {
				super(message);
				this.name = 'ExtendedError';
				this.arg1 = arg1;
				this.arg2 = arg2;
			}
		}

		var winstonLogger,
			clientMock,
			expectTrace;

		beforeEach(function() {

			var freshClient = new appInsights.TelemetryClient('FAKEKEY');

			winstonLogger = winston.createLogger({
				transports: [ new transport.AzureApplicationInsightsLogger({ client: freshClient })	]
			});

			clientMock = sinon.mock(freshClient);
			expectTrace = clientMock.expects("trackTrace");
		})

		afterEach(function() {
			clientMock.restore();
		});

		it('should log from winston', function() {
			const logMessage = "some log text...";
			const logLevel = 'error';
			const logMeta = {
				message: 'some meta text',
				value: 42
			};

			expectTrace.once();

			winstonLogger.log(logLevel, logMessage, logMeta);

			var traceArg = expectTrace.args[0][0];

			assert.equal(traceArg.message, logMessage);
			assert.equal(traceArg.severity, 3);
			assert.deepEqual(traceArg.properties, logMeta);
		});

		it('should log errors with all fields', function() {
			var error = new ExtendedError("errormessage", "arg1", "arg2");

			expectTrace.once().withArgs({
				message: error.message,
				severity: 3,
				properties: {
					level: 'error',
					arg1: error.arg1,
					arg2: error.arg2,
					name: error.name,
					message: error.message,
					stack: error.stack,
				},
			});

			winstonLogger.error(error);
		});

		it('should log errors with all fields and message', function() {
			const message = "Descriptive message";
			const error = new ExtendedError("errormessage", "arg1", "arg2");

			expectTrace.once().withArgs({
				message: message,
				severity: 3,
				properties: {
					arg1: error.arg1,
					arg2: error.arg2,
					message: error.message,
					name: error.name,
					stack: error.stack,
				},
			});

			winstonLogger.error(message, error);
		});

		it('stringifies nested customDimensions to workaround AI\'s display problem', function () {
			expectTrace.once();
			winstonLogger.info('test', {
				'errors': [
					new Error('Custom error 123'),
				],
				'is': {
					'very': {
						'nested': [true],
					},
				},
			});
			expectTrace.verify();
			var traceProps = expectTrace.args[0][0].properties;
			assert.include(traceProps.errors, 'Custom error 123');
			assert.equal(traceProps.is, '{ very: { nested: [ true ] } }');
		});

		describe('formatter', function() {

			var winstonLogger,
				formatterSpy,
				clientMock;

			function testFormatter(methodName, ownLevel, options) {
				return Object.assign({}, options, {
					'_wasFormatted': true,
				});
			}

			beforeEach(function() {
				var freshClient = new appInsights.TelemetryClient('FAKEKEY');
				formatterSpy = sinon.spy(testFormatter);
				winstonLogger = winston.createLogger({
					transports: [
						new transport.AzureApplicationInsightsLogger({
							client: freshClient,
							formatter: formatterSpy,
							treatErrorsAsExceptions: true,
						}),
					],
				});
				clientMock = sinon.mock(freshClient);
			});

			afterEach(function() {
				clientMock.restore();
			});

			it('passes log traces through a formatter', function() {
				var logMessage = "some log text...";
				var logLevel = 'info';

				var expectTrace = clientMock.expects("trackTrace");

				winstonLogger.log(logLevel, logMessage);
				assert.isTrue(formatterSpy.called);
				expectTrace.once().calledWithExactly(formatterSpy.firstCall.returnValue);
				var formatterArgs = formatterSpy.firstCall.args;
				assert.equal(formatterArgs[0], 'trackTrace');
				assert.equal(formatterArgs[1], logLevel);
				expectTrace.verify();
			});

			it('passes log exceptions through a formatter', function() {
				var logMessage = "some log text...";
				var logLevel = 'error';

				var expectException = clientMock.expects("trackException");

				winstonLogger.log(logLevel, logMessage);
				assert.isTrue(formatterSpy.called);
				expectException.once().calledWithExactly(formatterSpy.firstCall.returnValue);
				var formatterArgs = formatterSpy.firstCall.args;
				assert.equal(formatterArgs[0], 'trackException');
				assert.equal(formatterArgs[1], logLevel);
				expectException.verify();
			});
		});
	});

	describe('exports', function () {
		it('exposes defaultFormatter', function () {
			assert.isFunction(transport.defaultFormatter);
		});
		it('exposes getMessageLevel', function () {
			assert.isFunction(transport.getMessageLevel);
		});
	});

});
