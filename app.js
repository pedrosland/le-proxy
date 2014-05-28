var http = require('http'),
	url = require('url'),
	q = require('q'),
	request = require('request'),
	tough = require('tough-cookie');

var Cookie = tough.Cookie;

// Parse/check args
var argv = require('yargs')
	.usage('Proxy requests so that your source files come from dev.logentries.net ' +
		'and your data comes from logentries.com.\n' +
		'Usage: $0 [devSessionId] [liveSessionId]')
	.demand(2)
	.argv;

var devSessionId = argv._[0];
var liveSessionId = argv._[1];

// Set up cookie jars
var liveJar = request.jar();
var devJar = request.jar();

// Insert session IDs into the cookie jars
devJar.setCookie(request.cookie('sessionid=' + devSessionId + '; Path=/'), 'https://dev.logentries.net');
liveJar.setCookie(request.cookie('sessionid=' + liveSessionId + '; Path=/'), 'https://logentries.com');

// Regex to match text to replace when merging /app pages
var appHtmlUserInfo = /\/\/ Logentries namespace[\w\W]*?Default screen/;

// Disable request()'s strict ssl checks as they will fail for https://dev.logentries.net
request = request.defaults({strictSSL: false});

// Http server
var server = http.createServer(function(req, res) {
	var uri = url.parse(req.url);

	if(uri.pathname.indexOf('/app') === 0){
		// App page: merge in requests

		proxyAppPage(req, res);
	}else if(uri.pathname.match(/\.(js|less|css|html|jpg|jpeg|png|gif)$/) !== null) {
		// Asset: load from dev

		proxyDevPage(req, res);
	}else{
		// Not app index and not asset: load from live

		proxyLivePage(req, res);
	}

});

/**
 * Proxies requests to app page.
 *
 * Makes 2 requests, one to dev and one to live and replaces the user info from dev
 * with user info from live.
 *
 * @param req {Object} http request
 * @param res {Object} http response
 */
function proxyAppPage(req, res){
	q.all([
		promiseRequest({url: 'https://dev.logentries.net/app', jar: devJar}),
		promiseRequest({url: 'https://logentries.com' + req.url, jar: liveJar})
	]).then(function(results){
		var dev = results[0].response;
		var live = results[1].response;

		var devBody = dev.body;
		var liveBody = live.body;

		var liveBodyMatch = liveBody.match(appHtmlUserInfo);

		if(liveBodyMatch === null){
			res.setHeader('X-Lep-Error', 'Not found live app page');
			res.setHeader('X-Lep-Status', 'Live');
			res.end(liveBody);
			return;
		}

		var devBoxTest = appHtmlUserInfo.test(devBody);

		if(!devBoxTest){
			res.setHeader('X-Lep-Error', 'Not found dev app page');
			res.setHeader('X-Lep-Status', 'Dev');
			res.end(devBody);
			return;
		}

		devBody = devBody.replace(appHtmlUserInfo, liveBodyMatch[0]);

		copySetCookie(live, res);

		res.setHeader('X-Lep-Status', 'Mixed');
		res.end(devBody);
	}).fail(function(err){
		console.log(err);
		console.error(err.stack);

		res.setHeader('X-Lep-Error', err.toString());
		res.setHeader('X-Lep-Status', 'Error');
		res.end(err);
	});
}

/**
 * Proxies requests to local dev environment.
 *
 * This is really simple as we don't care about cookies.
 *
 * @param req {Object} http request
 * @param res {Object} http response
 */
function proxyDevPage(req, res){
	res.setHeader('X-Lep-Status', 'Dev');
	req.pipe(request({
		url: 'https://dev.logentries.net' + req.url,
		jar: devJar
	})).pipe(res);
}

/**
 * Proxies requests to live.
 *
 * Modifications to handle cookies. Uses request()'s streams.
 *
 * @param req {Object} http request
 * @param res {Object} http response
 */
function proxyLivePage(req, res){
	var headers = req.headers;
	headers['referer'] = 'https://logentries.com/app/';
	delete headers.host;
	delete headers.cookie;

	res.setHeader('X-Lep-Status', 'Live');

    var proxyReq = request({
        //url: 'http://localhost:5000' + req.url,
        url: 'https://logentries.com' + req.url,
        headers: headers,
        method: req.method,
        jar: liveJar
    });

    proxyReq.pipe(res);

    req.on('data', function(data){
        proxyReq.write(data);
    });

    req.on('error', function(){
        proxyReq.destroy();
    });

    req.on('end', function(){
        proxyReq.end();
    });
}

/**
 * Makes a request using request() but wraps it in a promise.
 *
 * Note: Does not use request()'s stream API.
 *
 * @param options {Object} Options for request()
 * @returns {promise|*|Q.promise} Promise
 */
function promiseRequest(options){
	var deferred = q.defer();

	var req = request(options, function(e){
		if(e){
			deferred.reject(e);
		}else{
			deferred.resolve(req);
		}
	});

	return deferred.promise;
}

function updateCookieJar(jar, res){
	if (res.headers['set-cookie'] instanceof Array)
		res.headers['set-cookie'].forEach(function (c) { jar.setCookie(c, res.url); });
	else
		jar.setCookie(Cookie.parse(res.headers['set-cookie']), res.url);
}

/**
 * Copy set-cookie header (if it exists) from response to response.
 *
 * We remove the secure attribute as we're not running this proxy over a secure connection.
 *
 * @param src  {Object} Incoming http response
 * @param dest {Object} Outgoing http response
 */
function copySetCookie(src, dest){
	if (src.headers['set-cookie']) {
		dest.setHeader('Set-Cookie', src.headers['set-cookie'].map(function(c) { return c.replace(/; ?secure/, ''); }));
	}
}

console.log("listening on port 5050");
server.listen(5050);