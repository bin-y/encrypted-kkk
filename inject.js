const path = require('path');
module.paths.push(path.resolve('node_modules'));
const bitcore = require('bitcore-lib');
const ECIES = require('bitcore-ecies');
const crypto = require('crypto');

const ecies = new ECIES();
const squareServiceHash = '258EDA4ABD8DB267D185D1DAB5F649E7';
const roomName = decodeURIComponent(document.documentURI.split('/')[3]);
const sendHeader = 'SEND\ndestination:/topic/' + roomName + '\n\n'
const recvHeader = 'MESSAGE\ndestination:/topic/' + roomName + '\npublisher:CLIENT_TRANSPORT\n\n';
const saltedBlockSize = 32;
const saltInditator = '\0';

var privateKey = new bitcore.PrivateKey();
var publicKeyBoradcasted = false;
var publicKey;
var publicKeyBuffer;
var publicKeyAcquired = false;
var cypher;
var publicId;
var publicIdInitialized = false;
var keySenderPublicId;

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
    console.log(localStorage['hiroba.anonymousId']);
    var postData = '7|0|8|https://kekeke.cc/com.liquable.hiroba.square.gwt.SquareModule/|' + squareServiceHash + '|com.liquable.hiroba.gwt.client.square.IGwtSquareService|startSquare|com.liquable.hiroba.gwt.client.square.StartSquareRequest/2186526774';
    postData += '|' + localStorage['hiroba.anonymousId'];
    postData += '|com.liquable.gwt.transport.client.Destination/2061503238';
    postData += '|/topic/' + roomName;
    postData += '|1|2|3|4|1|5|5|6|0|7|8|';
    var xmlHttp = getServiceRequestObject('square', false);
    xmlHttp.send(postData);
    console.log(xmlHttp.responseText);
    if (xmlHttp.responseText.indexOf('//OK') != 0)
        return;
    var dataobj = eval(xmlHttp.responseText.substring(4));

    var squareinfo = dataobj[dataobj.length - 3];
    console.log(squareinfo);
    publicId = squareinfo[squareinfo.length - 1];
    console.log(publicId)
}

function showStatus() {
    var msgobj = {
        'senderPublicId': '',
        'senderNickName': 'STATUS',
        'anchorUsername': '',
        'content': '',
        'date': '' + Date.now(),
        'eventType': 'KEKE_MESSAGE',
        'payload': {
            'replyPublicIds': []
        }
    };
    msgobj.content = 'public-key:' + privateKey.publicKey.toString() + '\n';
    msgobj.content += 'room-name:' + roomName + '\n';
    window.realhirobaWebSocketOnMessage(recvHeader + JSON.stringify(msgobj));
}

function sendPublicKey() {
    var sendobj = {
        'senderPublicId': publicId,
        'senderNickName': localStorage['hiroba.nickname'],
        'anchorUsername': '',
        'content': privateKey.publicKey.toString(),
        'date': '' + Date.now(),
        'eventType': 'KEKE_MESSAGE',
        'payload': {
            'replyPublicIds': []
        }
    };
    console.log(sendobj);
    console.log(sendHeader + JSON.stringify(sendobj));
    hirobaWs.realsend(sendHeader + JSON.stringify(sendobj));
}

window.fakehirobaWebSocketOnMessage = function (a) {
    var msgType = a.split('\n')[0];
    if (msgType != 'MESSAGE')
        return window.realhirobaWebSocketOnMessage(a);
    // msgType == MESSAGE    

    if (!publicKeyBoradcasted) {
        loadPublicId();
        showStatus();
        sendPublicKey();
        publicKeyBoradcasted = true;
    }

    var msgContent = a.split('\n\n')[1];
    var msgobj = JSON.parse(msgContent);

    if (msgobj.eventType == 'KEKE_MESSAGE'
        || msgobj.eventType == 'CHAT_MESSAGE') {

        if (msgobj.senderPublicId == publicId) {
            return;
        }
        else if (!publicKeyAcquired) {
            try {
                if (bitcore.PublicKey.isValid(msgobj.content)) {
                    publicKey = bitcore.PublicKey(msgobj.content);
                    publicKeyBuffer = publicKey.toBuffer();
                    cypher = ecies.privateKey(privateKey).publicKey(publicKey);
                    keySenderPublicId = msgobj.senderPublicId;
                    sendPublicKey();
                    publicKeyAcquired = true;
                    return;
                }
            } catch (err) {
                console.log(err.message);
            }
        }
        else if (keySenderPublicId == msgobj.senderPublicId) {
            console.log(msgobj);
            var buffer = new Buffer(msgobj.content, 'base64');
            buffer = Buffer.concat([publicKeyBuffer, buffer], publicKeyBuffer.length + buffer.length);
            console.log(buffer);
            msgobj.content = cypher.decrypt(buffer).toString().split(saltInditator)[0];
            a = recvHeader + JSON.stringify(msgobj);
        }
        console.log(msgobj);
    }

    window.realhirobaWebSocketOnMessage(a);
}

function fakesend(a) {
    var msgobj = null;
    do {
        if (a.indexOf('SEND\n') != 0)
            break;
        msgobj = JSON.parse(a.split('\n\n')[1]);
        if (msgobj.eventType != 'CHAT_MESSAGE'
            && msgobj.eventType != 'KEKE_MESSAGE')
            break;
        if (publicKeyAcquired) {
            var unencryptedMessage = recvHeader + JSON.stringify(msgobj);
            window.realhirobaWebSocketOnMessage(unencryptedMessage);
            var buffer = new Buffer(msgobj.content + saltInditator);
            buffer = Buffer.concat([buffer, new Buffer([0, 0])], buffer.length + 2);
            var saltLength = saltedBlockSize - (buffer.length % saltedBlockSize);
            buffer = Buffer.concat([buffer, crypto.randomBytes(saltLength)], buffer.length + saltLength);
            buffer = cypher.encrypt(buffer);
            console.log(buffer);
            msgobj.content = buffer.slice(publicKeyBuffer.length).toString('base64');
            console.log(msgobj.content);
            a = sendHeader + JSON.stringify(msgobj);
        }
        console.log(msgobj);
        console.log(a);
    } while (false);
    console.log(a);
    return hirobaWs.realsend(a);
};

window.start = function () {
    var gwtIframe = document.getElementById('com.liquable.hiroba.square.gwt.SquareModule');
    if (!publicIdInitialized) {
        if (gwtIframe == null) {
            console.log('Waiting gwtIframe...');
            setTimeout('start();', 500);
            return;
        }
        try {
            window.gwtWnd = gwtIframe.contentWindow;
            window.gwtDoc = gwtIframe.contentDocument;
            gwtIframe.contentWindow.removeChild = function () { };
        } catch (err) {
            console.log(err.message);
        }
        publicIdInitialized = true;
    }

    if (window.hirobaWs == null
        || window.hirobaWs.send == null
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

    return;
}

setTimeout('window.start();', 500);