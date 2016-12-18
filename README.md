# scraperbot

Telegram bot

## Configuration

`config/development.js`
```javascript
namespace: 'scraperbot',
loggerLevel: 'debug'
```
where all Redis keys will be prefixed with `scraperbot`

```javascript
```

## Test data

```javascript
const testData = {
    ok: (multi, ctx) => {
    },
};
```

Note our convention that Redis keys for hashes are postfixed with `:h`


## Error handling

```javascript
```
