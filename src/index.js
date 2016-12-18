const assert = require('assert');
const fetch = require('node-fetch');
const lodash = require('lodash');
const Promise = require('bluebird');

const envName = process.env.NODE_ENV || 'production';
const config = require(process.env.configFile || `/h/private-config/scraperbot/${envName}`);
const state = {};
const redis = require('redis');
const client = Promise.promisifyAll(redis.createClient(config.telebotRedis));

const logger = require('winston');
logger.level = config.loggerLevel || 'info';

class Counter {
    constructor() {
        this.count = 0;
    }
}

class TimestampedCounter {
    constructor() {
        this.timestamp = Date.now();
        this.count = 0;
    }
}

const counters = {
    concurrent: new Counter(),
    perMinute: new TimestampedCounter()
};

async function multiExecAsync(client, multiFunction) {
    const multi = client.multi();
    multiFunction(multi);
    return Promise.promisify(multi.exec).call(multi);
}

async function delay(duration) {
    logger.debug('delay', duration);
    return new Promise(resolve => setTimeout(resolve, duration));
}

async function start() {
    state.started = Math.floor(Date.now()/1000);
    state.pid = process.pid;
    state.instanceId = await client.incrAsync(`${config.namespace}:instance:seq`);
    const instanceKey = `${config.namespace}:instance:${state.instanceId}:h`;
    logger.info('start', {config, state, instanceKey});
    await multiExecAsync(client, multi => {
        ['started', 'pid'].forEach(property => {
            multi.hset(instanceKey, property, state[property]);
        });
        multi.expire(instanceKey, config.processExpire);
    });
    if (process.env.NODE_ENV === 'development') {
        //await startDevelopment();
    } else if (process.env.NODE_ENV === 'test') {
        return startTest();
    } else {
    }
    client.on('message', (channel, message) => {
        handle(JSON.parse(message));
    });
    client.subscribe('telebot:' + config.secret);
}

async function handle(message) {
    logger.debug('handle', message.message.text, message.message.chat.id, message.message.from.username, JSON.stringify(message, null, 2));
    return sendTelegram(message.message.chat.id, 'text', `Thanks ${message.message.from.username} (${message.message.text})`);
}

async function sendTelegram(chatId, format, ...content) {
    logger.debug('sendTelegram', chatId, format, content);
    try {
        const text = lodash.trim(lodash.flatten(content).join(' '));
        assert(chatId, 'chatId');
        let uri = `sendMessage?chat_id=${chatId}`;
        uri += '&disable_notification=true';
        if (format === 'markdown') {
            uri += `&parse_mode=Markdown`;
        } else if (format === 'html') {
            uri += `&parse_mode=HTML`;
        }
        uri += `&text=${encodeURIComponent(text)}`;
        const url = `https://api.telegram.org/bot${config.token}/${uri}`;
        const res = await fetch(url);
        if (res.status !== 200) {
            logger.warn('sendTelegram', chatId, url);
        }
    } catch (err) {
        logger.error('sendTelegram', err);
    }
}

async function startTest() {
}

const testData = {
    ok: (multi, ctx) => {
        multi.hset(`${config.namespace}:${ctx.id}:h`, 'url', 'http://httpstat.us/200');
        multi.lpush(queue.req, ctx.id);
    },
};

async function startDevelopment() {
    logger.info('startDevelopment', config.namespace, queue.req);
    await Promise.all(Object.keys(testData).map(async (key, index) => {
        const id = index + 101;
        const results = await multiExecAsync(client, multi => {
            testData[key](multi, {id});
        });
        logger.info('results', key, id, results.join(' '));
    }));
    logger.info('llen', queue.req, await client.llenAsync(queue.req));
}

async function end() {
    client.quit();
}

start().then(() => {
    logger.info('started');
}).catch(err => {
    logger.error(err);
    return end();
}).finally(() => {
});
