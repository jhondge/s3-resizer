/*
 * @Author: Jackson
 * @Email: zhangjiajun@everimaging.com
 * @Date: 2020-09-24 14:32:09
 * @Description: 
 * 
 */
'use strict'


const AWS = require('aws-sdk');
const S3 = new AWS.S3({signatureVersion: 'v4'});
const Sharp = require('sharp');
// const PathPattern = /(.*\/)?(.*)\/(.*)/;
const PathPattern = /(.*\/)?(.*)@(\d+)w_(\d+)h_1(l|e|s).src/;

// parameters
const {BUCKET, URL} = process.env;
const WHITELIST = process.env.WHITELIST
    ? Object.freeze(process.env.WHITELIST.split(' '))
    : null;


exports.handler = async (event) => {
    // @150w_150h_1e.src
    //assets/bg/b0e9b163-9df7-4cb6-bc55-74c2a411b6ea.jpg@150w_150h_1e.src
    // /@(\d+)w_(\d+)h_1l.src/.exec(url);
    let path = event.queryStringParameters.path;
    console.log('resize path:', path);
    const parts = PathPattern.exec(path);
    const dir = parts[1] || '';
    // const resizeOption = parts[];  // e.g. "150x150_max"
    // const sizeAndAction = resizeOption.split('_');
    const filename = parts[2];

    const action = parts[5];
    // const sizes = sizeAndAction[0].split("x");
    const sizes = [parts[3], parts[4]];
    
    // const action = sizeAndAction.length > 1 ? sizeAndAction[1] : null;

    // Whitelist validation.
    if (WHITELIST && !WHITELIST.includes(resizeOption)) {
        return {
            statusCode: 400,
            body: `WHITELIST is set but does not contain the size parameter "${resizeOption}"`,
            headers: {"Content-Type": "text/plain"}
        };
    }

    // Action validation.
    if (action && action !== 'l' && action !== 's' && action !== 'e') {
        return {
            statusCode: 400,
            body: `Unknown func parameter "${action}"\n` +
                  'For query ".../150x150_func", "_func" must be either empty, "_min" or "_max"',
            headers: {"Content-Type": "text/plain"}
        };
    }

    try {
        const data = await S3
            .getObject({Bucket: BUCKET, Key: dir + filename})
            .promise();

        const width = sizes[0] === 'AUTO' ? null : parseInt(sizes[0]);
        const height = sizes[1] === 'AUTO' ? null : parseInt(sizes[1]);
        let fit;
        switch (action) {
            case 'l':
                fit = 'inside';
                break;
            case 's':
                fit = 'outside';
                break;
            default:
                fit = 'cover';
                break;
        }
        const result = await Sharp(data.Body, {failOnError: false})
            .resize(width, height, {withoutEnlargement: true, fit})
            .rotate()
            .toBuffer();

        await S3.putObject({
            Body: result,
            Bucket: BUCKET,
            ContentType: data.ContentType,
            Key: path,
            CacheControl: 'public, max-age=86400'
        }).promise();
        if(path.indexOf('?ts=') !== -1) {
            path = path.replace(/\?ts=[0-9]/, '?ts=' + Date.now());
        } else {
            path = path + '?ts=' + Date.now();
        }
        return {
            statusCode: 301,
            headers: {"Location" : `${URL}/${path}`, 
            "Access-Control-Allow-Headers": "Authorization,Cross-flag,X-XSRF-TOKEN",
            "Access-Control-Allow-Origin" : "*"
            }
        };
    } catch (e) {
        return {
            statusCode: e.statusCode || 400,
            body: 'Exception: ' + e.message,
            headers: {"Content-Type": "text/plain"}
        };
    }
}
