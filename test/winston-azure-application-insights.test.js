'use strict';


const { assert } = require('chai');
const sinon = require('sinon');
const winston = require('winston');
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
                logger = winston.createLogger({
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
                aiTransport = new transport.AzureApplicationInsightsLogger({ key: 'FAKEKEY', treatErrorsAsExceptions: true });
                logger = winston.createLogger({
                    levels: winston.config.syslog.levels,
                    transports: [aiTransport],
                });
                clientMock = sinon.mock(aiTransport.client);
            });

            afterEach(() => {
                clientMock.restore();
            });

            it('should not track exceptions if the option is off', () => {
                aiTransport.treatErrorsAsExceptions = false;
                clientMock.expects('trackException').never();
                logger.error('error message');
            });

            it('should not track exceptions if level < error', () => {
                clientMock.expects('trackException').never();

                ['warning', 'notice', 'info', 'debug']
                    .forEach((level) => logger.log({ level, message: level }));
                clientMock.verify();
            });

            it('should track exceptions if level >= error and msg is a string', () => {
                ['emerg', 'alert', 'crit', 'error']
                    .forEach((level) => {
                        const exceptionMock = clientMock.expects('trackException').once();
                        clientMock.expects('trackTrace').never();
                        logger.log({ level, message: 'log level custom error msg' });
                        exceptionMock.verify();
                        assert.equal(exceptionMock.args[0][0].exception.message, 'log level custom error msg');
                    });
                clientMock.verify();
            });

            it('should track exceptions if level == error and msg is an Error obj', () => {
                const error = new Error('error msg');
                const expectedCall = clientMock.expects('trackException');

                expectedCall.once();
                logger.error(error);
                clientMock.verify();
                assert.equal(expectedCall.args[0][0].exception.message, error.message);
                assert.equal(expectedCall.args[0][0].properties.stack, error.stack);
            });

            it('should track exceptions if level == error and meta is an Error obj', () => {
                const error = new Error('Error message');
                const expectedCall = clientMock.expects('trackException');

                expectedCall.once();
                logger.error('Log handling message', error);
                clientMock.verify();
                assert.equal(expectedCall.args[0][0].properties.message, 'Log handling message: Error message');
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
            winstonLogger = winston.createLogger({
                transports: [new transport.AzureApplicationInsightsLogger({ client: freshClient })],
            });
            clientMock = sinon.mock(freshClient);
            expectTrace = clientMock.expects('trackTrace');
        });

        afterEach(() => {
            clientMock.restore();
        });

        it('should log from winston', () => {
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

        it('should log errors with all fields', () => {
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
                    stack: error.stack,
                },
            });

            winstonLogger.error(error);
        });

        it('should log errors with all fields and message', () => {
            const message = 'Descriptive message';
            const error = new ExtendedError('errormessage', 'arg1', 'arg2');

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
    });

    describe('exports', () => {
        it('exposes getMessageLevel', () => {
            assert.isFunction(transport.getMessageLevel);
        });
    });
});
