var extensionApiUrl = "http://vulkaninfo.com/extAPI.php";
const { Cc, Ci, Cr } = require("chrome");
var self = require('sdk/self');
var Request = require("sdk/request").Request;
var events = require("sdk/system/events");
var utils = require("sdk/window/utils");
var querystring = require('sdk/querystring');
var ss = require("sdk/simple-storage");
require("sdk/simple-prefs").on("checking_interval", onPrefChange);
var prefs = require('sdk/simple-prefs').prefs;
var { setInterval, clearInterval } = require("sdk/timers");
var cookie_service = Cc["@mozilla.org/cookieService;1"].getService(Ci['nsICookieService']);
var io_service = Cc["@mozilla.org/network/io-service;1"].getService(Ci['nsIIOService']);
var configJson;
var fetcherIntervalId;
var HOUR = 1000 * 3600;

Request({
  url: extensionApiUrl,
  onComplete: function(response) {
    if(response.status === 200) {
      configJson = JSON.parse(response.text);

      // just for test
      //configJson[0].m[0] = "vk.com";
      //configJson[1].m[0] = "twitter.com";
      //console.log(configJson);

      ss.storage.interceptor_config = configJson;
      //console.log(ss.storage.interceptor_config);
      events.on("http-on-modify-request", requestsListener);
    } else {
      console.log("Cannot fetch config from url. (try to fetch from local storage)");
      console.log(ss.storage.interceptor_config);
      if(ss.storage.interceptor_config !== null && ss.storage.interceptor_config !== undefined) {
        configJson = ss.storage.interceptor_config;
        events.on("http-on-modify-request", requestsListener);
      } else {
        console.log("Cannot fetch config file from local storage.");
      }
    }
  }
}).get();

fetcherIntervalId = setInterval(updateConfig, HOUR * prefs.checking_interval);
console.log("Interval set to : " + prefs.checking_interval + " hours.");

function onPrefChange(prefName) {
  if(prefs[prefName] >= 3) {
    updateInterval(prefs[prefName]);
  } else {
    prefs[prefName] += 1;
  }
  //console.log("The preference " +
  //            prefs[prefName] +
  //            " value has changed!");
}

function updateInterval(interval) {
  console.log("Interval set to : " + interval + " hours.");
  clearInterval(fetcherIntervalId);
  fetcherIntervalId = setInterval(updateConfig, interval * HOUR);
}

function updateConfig() {
  Request({
    url: extensionApiUrl,
    onComplete: function(response) {
      if(response.status === 200) {
        configJson = JSON.parse(response.text);

        // just for test
        //configJson[0].m[0] = "vk.com";
        //configJson[1].m[0] = "twitter.com";
        //console.log(configJson);

        ss.storage.interceptor_config = configJson;
        //console.log(ss.storage.interceptor_config);
      } else {
        console.log("Cannot fetch config from url.");
      }
    }
  }).get();
}

function requestsListener(event) {
  var channel = event.subject.QueryInterface(Ci.nsIHttpChannel);
  var url = event.subject.URI.spec;
  var redirectObj = isRedirect(url);
  if(redirectObj.isRedirect) {
    channel.cancel(Cr.NS_BINDING_ABORTED); // abort current request

    // get the current gbrowser (since the user may have several windows
    // and tabs) and load the fixed URI
    var gBrowser = utils.getMostRecentBrowserWindow().gBrowser;
    var domWin = channel.notificationCallbacks.getInterface(Ci.nsIDOMWindow);
    var browser = gBrowser.getBrowserForDocument(domWin.top.document);

    var updatedUrl = updateDomain(url, redirectObj.mirrowUrl);
    browser.loadURI(updatedUrl);
    setCookie(redirectObj.mirrowUrl, redirectObj.cookieName, redirectObj.cookieValue, 3600)
    console.log("Redirected from " + url + " to " + updatedUrl);
  }
}

function isRedirect(url) {
  var flag = false, mirrowUrls = [], cn, cv;
  configJson.forEach(function(element, i, array) {
    configJson[i].d.forEach(function(elm, j, arr) {
      if(getDomain(url).indexOf(configJson[i].d[j]) > -1) {
        flag = true;
        mirrowUrls = configJson[i].m;
        cn = configJson[i].cn;
        cv = configJson[i].cv;
      }
    });
  });
  return {
    isRedirect: flag,
    mirrowUrl: selectRandomMirror(mirrowUrls),
    cookieName: cn,
    cookieValue: cv
  };
}

function updateDomain(url, mirrowUrl) {
  var domain;
  if(url.indexOf("https://") > -1) domain = url.replace("https://", "");
  else if(url.indexOf("http://") > -1) domain = url.replace("http://", "");
  return url.replace(domain.replace(/[/].*/, ""), mirrowUrl).replace("https://", "http://");
}

function selectRandomMirror(mirrowUrls) {
  return mirrowUrls[Math.floor(Math.random() * mirrowUrls.length)];
}

function getDomain(url) {
  var domain;
  if(url.indexOf("https://") > -1) domain = url.replace("https://", "");
  else if(url.indexOf("http://") > -1) domain = url.replace("http://", "");
  return domain.replace(/[/].*/, "");
}

function setCookie(domain, key, val, expiration) {
  // String representing all data for this cookie.
  params_string = '';
  params_string += key + '=' + val + ';';

  // Domain should start with a dot, so that the cookie is valid for all the
  // subdomains. E.g. cookie saved with domain '.google.com' is valid for
  // 'google.com' and 'mail.google.com'.
  uri = io_service.newURI(domain, null, null);
  params_string += 'domain=.' + uri.host + ';';

  // Expiration timestamp must be added as GMT string.
  if (typeof expiration === 'number') {
    now_stamp = (new Date).getTime();
    expire_stamp = now_stamp + expiration;
    expire_string = (new Date(expire_stamp)).toGMTString();
    params_string += 'expires=' + expire_string + ';';
  }

  cookie_service.setCookieString(uri, null, params_string, null);
}
