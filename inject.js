const path = require('path');
module.paths.push(path.resolve('node_modules'));
const ecies = require('standard-ecies');
const crypto = require('crypto');
const remote = require('electron').remote;
const TOKEN = remote.require('./token.js');

const squareServiceHash = '258EDA4ABD8DB267D185D1DAB5F649E7';
const roomName = decodeURIComponent(window.location.pathname.substring(1));
const sendHeader = 'SEND\ndestination:/topic/' + roomName + '\n\n';
const recvHeader = 'MESSAGE\ndestination:/topic/' + roomName + '\npublisher:CLIENT_TRANSPORT\n\n';
const saltedBlockSize = 32;
const saltInditator = '\0';
var totalMessageCount = 0;

var eciesEncryptionOptions = {
    hashName: 'sha256',
    hashLength: 32,
    macName: 'sha256',
    macLength: 32,
    curveName: 'secp256k1',
    symmetricCypherName: 'aes-256-ecb',
    iv: null, // iv is used in symmetric cipher, set null if cipher is in ECB mode.  
    keyFormat: 'compressed',
    s1: null, // optional shared information1 
    s2: null // optional shared information2 
};

var eciesDecryptionOptions = {
    hashName: 'sha256',
    hashLength: 32,
    macName: 'sha256',
    macLength: 32,
    curveName: 'secp256k1',
    symmetricCypherName: 'aes-256-ecb',
    iv: null, // iv is used in symmetric cipher, set null if cipher is in ECB mode.  
    keyFormat: 'compressed',
    s1: null, // optional shared information1 
    s2: null // optional shared information2 
};

var ecdh = crypto.createECDH(eciesEncryptionOptions.curveName);
ecdh.generateKeys();
var publicKey;
var publicId;
var publicIdInitialized = false;
var keySenderPublicId;
var inputArea;

localStorage['hiroba.nickname'] = crypto.randomBytes(4).toString('hex');

function getServiceRequestObject(service, async) {
    if (async == undefined)
        async = true;
    if (service == 'vote')
        service = 'https://kekeke.cc/com.liquable.hiroba.gwt.server.GWTHandler/voteService';
    else if (service == 'square')
        service = 'https://kekeke.cc/com.liquable.hiroba.gwt.server.GWTHandler/squareService';
    else if (service == 'pollingmessage')
        service = 'https://kekeke.cc/com.liquable.hiroba.gwt.server.GwtPollingMessageServlet';
    else if (service == 'anonymous')
        service = 'https://kekeke.cc/com.liquable.hiroba.gwt.server.GWTHandler/anonymousService';
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open('POST', service, async);
    xmlHttp.setRequestHeader('Content-Type', 'text/x-gwt-rpc; charset=utf-8');
    xmlHttp.setRequestHeader('X-GWT-Module-Base', window.gwtWnd.$moduleBase);
    xmlHttp.setRequestHeader('X-GWT-Permutation', window.gwtWnd.$strongName);
    return xmlHttp;
};

function loadPublicId() {
    var postData = '7|0|8|https://kekeke.cc/com.liquable.hiroba.square.gwt.SquareModule/|' + squareServiceHash + '|com.liquable.hiroba.gwt.client.square.IGwtSquareService|startSquare|com.liquable.hiroba.gwt.client.square.StartSquareRequest/2186526774';
    postData += '|' + localStorage['hiroba.anonymousId'];
    postData += '|com.liquable.gwt.transport.client.Destination/2061503238';
    postData += '|/topic/' + roomName;
    postData += '|1|2|3|4|1|5|5|6|0|7|8|';
    var xmlHttp = getServiceRequestObject('square', false);
    xmlHttp.send(postData);
    console.log('startSquare response:', xmlHttp.responseText);
    if (xmlHttp.responseText.indexOf('//OK') != 0)
        return;
    var dataString = xmlHttp.responseText.substring(4);
    dataString = dataString.replace(/\'/g, '"');
    var dataobj = JSON.parse(dataString);

    var squareinfo = dataobj[dataobj.length - 3];
    console.log('squareinfo:', squareinfo);
    publicId = squareinfo[squareinfo.length - 1];
    console.log('publicId:', publicId)
}

function showHint(hint) {
    var msgobj = {
        'senderPublicId': '',
        'senderNickName': 'HINT',
        'anchorUsername': '',
        'content': hint,
        'date': '' + Date.now(),
        'eventType': 'KEKE_MESSAGE',
        'payload': {
            'replyPublicIds': [publicId]
        }
    };

    window.realhirobaWebSocketOnMessage(recvHeader + JSON.stringify(msgobj));
}

function createAndShowToken() {
    var msgobj = {
        'senderPublicId': '',
        'senderNickName': 'TOKEN',
        'anchorUsername': '',
        'content': '',
        'date': '' + Date.now(),
        'eventType': 'KEKE_MESSAGE',
        'payload': {
            'replyPublicIds': [publicId]
        }
    };

    tokenParameter = {
        roomName: roomName,
        publicKey: ecdh.getPublicKey('base64', eciesEncryptionOptions.keyFormat),
        publicId: publicId
    };

    console.log('token:', tokenParameter);

    msgobj.content = TOKEN.create(tokenParameter).toString('base64');
    window.realhirobaWebSocketOnMessage(recvHeader + JSON.stringify(msgobj));
    showHint('Share token to your partner and wait for him to join.')
}

function sendPublicKey() {
    var sendobj = {
        'senderPublicId': publicId,
        'senderNickName': localStorage['hiroba.nickname'],
        'anchorUsername': '',
        'content': '',
        'date': '' + Date.now(),
        'eventType': 'KEKE_MESSAGE',
        'payload': {
            'replyPublicIds': [publicId]
        }
    };
    sendobj.content = ecdh.getPublicKey('base64', eciesEncryptionOptions.keyFormat);
    console.log('send publicKey:', sendobj.content);
    console.log('encryption options:', eciesEncryptionOptions);
    var message = sendHeader + JSON.stringify(sendobj);
    // let fake send do encryption
    hirobaWs.fakesend(message);
}

window.fakehirobaWebSocketOnMessage = function(message) {
    console.log('received message:', message);
    var msgType = message.split('\n')[0];
    if (msgType != 'MESSAGE')
        return window.realhirobaWebSocketOnMessage(message);
    // msgType == MESSAGE    


    if (publicId == undefined) {
        loadPublicId();
        eciesEncryptionOptions.s1 = new Buffer(publicId, 'hex');
        eciesDecryptionOptions.s2 = new Buffer(publicId, 'hex');
        if (TOKEN.get()) {
            console.log('token:', TOKEN.get());
            publicKey = new Buffer(TOKEN.get().publicKey, 'base64');
            keySenderPublicId = TOKEN.get().publicId;
            eciesEncryptionOptions.s2 = new Buffer(keySenderPublicId, 'hex');
            eciesDecryptionOptions.s1 = new Buffer(keySenderPublicId, 'hex');
            console.log('encrypt options:', eciesEncryptionOptions);
            sendPublicKey();
            inputArea.hidden = false;
        }
        else {
            createAndShowToken();
        }
    }

    var msgContent = message.split('\n\n')[1];
    var msgobj = JSON.parse(msgContent);

    if (msgobj.eventType == 'KEKE_MESSAGE'
        || msgobj.eventType == 'CHAT_MESSAGE') {

        if (msgobj.senderPublicId == publicId) {
            return;
        }
        else {
            var buffer = new Buffer(msgobj.content, 'base64');
            if (!publicKey) {

                eciesDecryptionOptions.s1 = new Buffer(msgobj.senderPublicId, 'hex');

                try {
                    console.log('decrypt options:', eciesDecryptionOptions);
                    publicKey = ecies.decrypt(ecdh, buffer, eciesDecryptionOptions).toString();
                    publicKey = new Buffer(publicKey.split(saltInditator)[0], 'base64');

                    eciesEncryptionOptions.s2 = new Buffer(msgobj.senderPublicId, 'hex');
                    keySenderPublicId = msgobj.senderPublicId;
                    inputArea.hidden = false;

                    showHint('Your partner has joined in, enjoy your encrypted chat.')
                    return;
                } catch (err) {
                    console.log(err.message);
                }
            }
            else if (keySenderPublicId == msgobj.senderPublicId) {
                msgobj.content = ecies.decrypt(ecdh, buffer, eciesDecryptionOptions).toString();
                msgobj.content = msgobj.content.split(saltInditator)[0];

                message = recvHeader + JSON.stringify(msgobj);
            }
        }
        console.log('processed message:', msgobj);
    }

    window.realhirobaWebSocketOnMessage(message);
}

function fakesend(message) {
    console.log('sending message:', message);
    var msgobj = null;
    do {
        if (message.indexOf('SEND\n') != 0)
            break;
        msgobj = JSON.parse(message.split('\n\n')[1]);
        if (msgobj.eventType != 'CHAT_MESSAGE'
            && msgobj.eventType != 'KEKE_MESSAGE')
            break;
        if (publicKey) {
            var unencryptedMessage = recvHeader + JSON.stringify(msgobj);
            window.realhirobaWebSocketOnMessage(unencryptedMessage);
            var buffer = new Buffer(msgobj.content + saltInditator);
            var saltLength = saltedBlockSize - (buffer.length % saltedBlockSize);
            buffer = Buffer.concat([buffer, crypto.randomBytes(saltLength)], buffer.length + saltLength);
            buffer = ecies.encrypt(
                publicKey,
                buffer,
                eciesEncryptionOptions
            );
            msgobj.content = buffer.toString('base64');
            console.log('encrypted message:', msgobj.content);
            message = sendHeader + JSON.stringify(msgobj);
        }
        console.log('modified message:', msgobj);
    } while (false);
    return hirobaWs.realsend(message);
};

window.start = function() {
    var gwtIframe = document.getElementById('com.liquable.hiroba.square.gwt.SquareModule');
    if (!publicIdInitialized) {
        if (gwtIframe == null) {
            console.log('Waiting gwtIframe...');
            setTimeout('start();', 100);
            return;
        }
        try {
            window.gwtWnd = gwtIframe.contentWindow;
            window.gwtDoc = gwtIframe.contentDocument;
            gwtIframe.contentWindow.removeChild = function() { };
        } catch (err) {
            console.log(err.message);
        }
        publicIdInitialized = true;
    }

    if (window.hirobaWs == null
        || window.hirobaWs.send == null
        || window.hirobaWebSocketOnMessage == null
    ) {
        console.log('Waiting ws...');
        setTimeout('start();', 100);
        return;
    }

    window.hirobaWs.realsend = window.hirobaWs.send;
    window.hirobaWs.fakesend = fakesend;
    window.hirobaWs.send = window.hirobaWs.fakesend;
    window.realhirobaWebSocketOnMessage = window.hirobaWebSocketOnMessage;
    window.hirobaWebSocketOnMessage = window.fakehirobaWebSocketOnMessage;

    inputArea = document.querySelector('table.SquareCssResource-inputArea');
    inputArea.hidden = true;
    return;
}

setTimeout('window.start();', 500);
