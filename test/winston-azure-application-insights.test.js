'use strict';


const { assert } = require('chai');
const sinon = require('sinon');
const { createLogger, format, config } = require('winston');
const appInsights = require('applicationinsights');
const transport = require('../lib/winston-azure-application-insights');

afterEach('teardown appInsights', () => {
    appInsights.dispose();
});

describe('winston-azure-application-insights', () => {
    describe('class', () => {
        describe('constructor', () => {
            beforeEach(() => {
                delete process.env.APPINSIGHTS_INSTRUMENTATIONKEY;
            });

            it('should fail if no instrumentation insights instance, client or key specified', () => {
                assert.throws(() => {
                    new transport.AzureApplicationInsightsLogger(); // eslint-disable-line no-new
                }, /key not found/);
            });

            it('should accept an App Insights instance with the insights option', () => {
                let aiLogger;

                assert.doesNotThrow(() => {
                    appInsights.setup('FAKEKEY');

                    aiLogger = new transport.AzureApplicationInsightsLogger({
                        insights: appInsights,
                    });
                });

                assert.ok(aiLogger.client);
            });

            it('should accept an App Insights client with the client option', () => {
                let aiLogger;

                assert.doesNotThrow(() => {
                    aiLogger = new transport.AzureApplicationInsightsLogger({
                        client: new appInsights.TelemetryClient('FAKEKEY'),
                    });
                });

                assert.ok(aiLogger.client);
            });

            it('should accept an instrumentation key with the key option', () => {
                let aiLogger;

                assert.doesNotThrow(() => {
                    aiLogger = new transport.AzureApplicationInsightsLogger({
                        key: 'FAKEKEY',
                    });
                });

                assert.ok(aiLogger.client);
            });

            it('should use the APPINSIGHTS_INSTRUMENTATIONKEY environment variable if defined', () => {
                let aiLogger;

                process.env.APPINSIGHTS_INSTRUMENTATIONKEY = 'FAKEKEY';

                assert.doesNotThrow(() => {
                    aiLogger = new transport.AzureApplicationInsightsLogger();
                });

                assert.ok(aiLogger.client);
            });

            it('should set default logging level to info', () => {
                const aiLogger = new transport.AzureApplicationInsightsLogger({
                    key: 'FAKEKEY',
                });

                assert.equal(aiLogger.level, 'info');
            });

            it('should set logging level', () => {
                const aiLogger = new transport.AzureApplicationInsightsLogger({
                    key: 'FAKEKEY',
                    level: 'warn',
                });

                assert.equal(aiLogger.level, 'warn');
            });

            it('should declare a Winston logger', () => {
                const theTransport = new transport.AzureApplicationInsightsLogger({
                    key: 'FAKEKEY',
                });

                assert.ok(theTransport);
            });
        });

        describe('#log', () => {
            let logger;
            let aiTransport;
            let clientMock;

            beforeEach(() => {
                aiTransport = new transport.AzureApplicationInsightsLogger({ key: 'FAKEKEY' });
                logger = createLogger({
                    transports: [aiTransport],
                });
                clientMock = sinon.mock(appInsights.defaultClient);
            });

            afterEach(() => {
                clientMock.restore();
            });

            it('should log with correct log levels', () => {
                clientMock.expects('trackTrace').once().withArgs({ message: 'error', severity: 3, properties: {} });
                clientMock.expects('trackTrace').once().withArgs({ message: 'warn', severity: 2, properties: {} });
                clientMock.expects('trackTrace').once().withArgs({ message: 'notice', severity: 1, properties: {} });
                clientMock.expects('trackTrace').once().withArgs({ message: 'info', severity: 1, properties: {} });
                clientMock.expects('trackTrace').once().withArgs({ message: 'verbose', severity: 0, properties: {} });
                clientMock.expects('trackTrace').once().withArgs({ message: 'debug', severity: 0, properties: {} });
                clientMock.expects('trackTrace').once().withArgs({ message: 'silly', severity: 0, properties: {} });

                ['error', 'warn', 'info', 'verbose', 'debug', 'silly']
                    .forEach((level) => logger.log(level, level));
            });
        });

        describe('#log errors as exceptions', () => {
            let logger;
            let aiTransport;
            let clientMock;

            beforeEach(() => {
                aiTransport = new transport.AzureApplicationInsightsLogger({
                    key: 'FAKEKEY',
                    sendErrorsAsExceptions: true,
                });
                logger = createLogger({
                    levels: config.syslog.levels,
                    transports: [aiTransport],
                });
                clientMock = sinon.mock(aiTransport.client);
            });

            afterEach(() => {
                clientMock.restore();
            });

            it('should not track exceptions if the option is off', () => {
                aiTransport.sendErrorsAsExceptions = false;
                clientMock.expects('trackException').never();
                logger.error('error message');
            });

            it('should not track exceptions if level < error', () => {
                clientMock.expects('trackException').never();

                ['warning', 'notice', 'info', 'debug']
                    .forEach((level) => logger.log({ level, message: level }));
                clientMock.verify();
            });

            it('should not track exceptions if level >= error and msg is a string', () => {
                ['emerg', 'alert', 'crit', 'error']
                    .forEach((level) => {
                        const exceptionMock = clientMock.expects('trackException').never();
                        logger.log({ level, message: 'log level custom error msg' });
                        exceptionMock.verify();
                    });
                clientMock.verify();
            });

            it('should track exceptions if level == error and msg is an Error obj', () => {
                const error = new Error('error msg');
                const expectedCall = clientMock.expects('trackException');

                expectedCall.once().withArgs({
                    exception: error,
                    properties: {},
                });
                logger.error(error);
                clientMock.verify();
            });

            it('should track exceptions if level == error and meta is an Error obj', () => {
                const error = new Error('Error message');
                const expectedCall = clientMock.expects('trackException');
                expectedCall.once().withArgs({
                    exception: error,
                    properties: {
                        message: 'Log handling message',
                    },
                });
                logger.error('Log handling message', error);
                clientMock.verify();
            });

            it('should track exceptions if level == error, msg is Error and logMeta is context obj', () => {
                const logContext = {
                    propBag: true,
                };
                const error = new Error('Error message');
                clientMock.expects('trackException').once().withArgs({
                    exception: error,
                    properties: {
                        propBag: true,
                    },
                });
                clientMock.expects('trackTrace').once().withArgs({
                    message: error.toString(),
                    severity: 3,
                    properties: {
                        message: error.message,
                        propBag: true,
                    },
                });
                logger.error(error, logContext);
                clientMock.verify();
            });
        });

        describe('#formatter properties', () => {
            let logger;
            let aiTransport;
            let clientMock;
            const TEST_EXTRA_INFO = {
                my_app_version: '1.0.0-testsuite',
            };
            const addTestAppVersions = format((info) => {
                return Object.assign(info, TEST_EXTRA_INFO);
            });

            beforeEach(() => {
                aiTransport = new transport.AzureApplicationInsightsLogger({
                    key: 'FAKEKEY',
                });
                logger = createLogger({
                    transports: [aiTransport],
                    format: format.combine(addTestAppVersions(), format.json()),
                });
                clientMock = sinon.mock(aiTransport.client);
            });

            afterEach(() => {
                clientMock.restore();
            });

            it('appends my_app_version to the trace properties', () => {
                clientMock.expects('trackTrace').once().withArgs({
                    message: 'Test message',
                    severity: 1,
                    properties: TEST_EXTRA_INFO,
                });
                logger.info('Test message');
            });

            it('appends my_app_version to existing logMeta', () => {
                clientMock.expects('trackTrace').once().withArgs({
                    message: 'Test message',
                    severity: 1,
                    properties: Object.assign(TEST_EXTRA_INFO, { propBag: true }),
                });
                logger.info('Test message', { propBag: true });
            });

            it('appends my_app_version to extracted error properties', () => {
                const error = new Error('Test error');
                clientMock.expects('trackTrace').once().withArgs({
                    message: error.message,
                    severity: 3,
                    properties: Object.assign(TEST_EXTRA_INFO, { message: error.message }),
                });
                logger.error('Test message', error);
            });
        });
    });

    describe('winston', () => {
        class ExtendedError extends Error {
            constructor(message, arg1, arg2) {
                super(message);
                this.name = 'ExtendedError';
                this.arg1 = arg1;
                this.arg2 = arg2;
            }
        }

        let winstonLogger;
        let clientMock;
        let expectTrace;

        beforeEach(() => {
            const freshClient = new appInsights.TelemetryClient('FAKEKEY');
            winstonLogger = createLogger({
                transports: [new transport.AzureApplicationInsightsLogger({ client: freshClient })],
            });
            clientMock = sinon.mock(freshClient);
            expectTrace = clientMock.expects('trackTrace');
        });

        afterEach(() => {
            clientMock.restore();
        });

        it('converts .log(level, string, object) to a trackTrace', () => {
            const logMessage = 'some log text...';
            const logLevel = 'error';
            const logMeta = {
                message: 'some meta text',
                value: 42,
            };

            expectTrace.once();

            winstonLogger.log(logLevel, logMessage, logMeta);

            const traceArg = expectTrace.args[0][0];

            assert.equal(traceArg.message, logMessage);
            assert.equal(traceArg.severity, 3);
            assert.deepEqual(traceArg.properties, logMeta);
        });

        it('converts .error(Error) to a useful trace', () => {
            const error = new ExtendedError('errormessage', 'arg1', 'arg2');

            expectTrace.once().withArgs({
                message: error.message,
                severity: 3,
                properties: {
                    level: 'error',
                    arg1: error.arg1,
                    arg2: error.arg2,
                    name: error.name,
                    message: error.message,
                },
            });

            winstonLogger.error(error);
        });

        it('converts .error(string, Error) to a useful trace', () => {
            const logMessage = 'Encountered an exception here';
            const error = new ExtendedError('Detailed error', 'problem', 'here');

            expectTrace.once().withArgs({
                message: logMessage,
                severity: 3,
                properties: {
                    message: error.message,
                    name: error.name,
                    arg1: error.arg1,
                    arg2: error.arg2,
                },
            });
            winstonLogger.error(logMessage, error);
        });
    });

    describe('exports', () => {
        it('exposes getMessageLevel', () => {
            assert.isFunction(transport.getMessageLevel);
        });
    });
});
