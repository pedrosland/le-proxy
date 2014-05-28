var http = require('http');

// This is just a server that will echo the url and headers sent to it
// and set a cookie on every response.
// It is for debugging the proxy, especially since logentries requires https.

var server = http.createServer(function(req, res) {
    console.log(req.url);
    console.log(req.headers);

    res.setHeader('set-cookie', 'hello=world; Path=/');

    res.end('hello');
});

server.listen(5000);