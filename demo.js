'use strict';

const winston = require('winston');
const appInsights = require('applicationinsights');
const { AzureApplicationInsightsLogger } = require('./lib/winston-azure-application-insights');

const shouldPushToAppInsights = 'APPINSIGHTS_INSTRUMENTATIONKEY' in process.env;

if (shouldPushToAppInsights) {
    appInsights.setup().start();
    winston.add(new AzureApplicationInsightsLogger({
        client: appInsights.defaultClient,
    }));
} else {
    winston.add(new winston.transports.Console());
}

winston.info('Let\'s log something new...');
winston.error('This is an error log!');
winston.warn('And this is a warning message.');
winston.log('info', 'Log with some metadata', {
    question: 'Answer to the Ultimate Question of Life, the Universe, and Everything',
    answer: 42,
});

class ErrorWithMeta extends Error {
    constructor(message, arg1, arg2) {
        super(message);
        this.message = message;
        this.name = 'ExtendedError';
        this.arg1 = arg1;
        this.arg2 = arg2;
    }
}

winston.error('Log extended errors with properties', new ErrorWithMeta('some error', 'answer', 42));
