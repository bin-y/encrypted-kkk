'use strict';

const app = require('electron').app;
const crypto = require('crypto');
const version = 1;

module.exports.version = version;

var localToken;
module.exports.get = function(parameters) {
    return localToken;
};

module.exports.create = function(parameters) {
    var cipher = crypto.createCipher('aes-128-ecb', app.getName());
    parameters.version = version;

    var buffer = new Buffer(JSON.stringify(parameters));
    var firstChunk = cipher.update(buffer);
    var secondChunk = cipher.final();
    return Buffer.concat([firstChunk, secondChunk]);
}

module.exports.load = function(token) {
    var decipher = crypto.createDecipher('aes-128-ecb', app.getName());
    var firstChunk = decipher.update(token);
    var secondChunk = decipher.final();

    var tokenString = Buffer.concat([firstChunk, secondChunk]).toString();
    console.log('Decrypted token:', tokenString);
    var tokenObject = JSON.parse(tokenString);
    if (!tokenObject)
        return null;
    if (tokenObject.version != version)
        return null;

    localToken = tokenObject;
    return localToken;
}