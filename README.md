# LE Proxy

This is a proxy so that we can use development sources with production data and APIs.

## Why?

So that changes to fix an issue that only appears on a production account or 
an account with a large dataset can be tested before being moved to staging.

At the moment this is also handy since we don't have source maps.

## Usage

You must be logged in to your dev environment and production to use this.

Also for the proxy to pass on the CSRF token, please make your first request is
a GET request. Just requesting /app will do this for you.

```
node app.js [devSessionId] [liveSessionId]
```

Where `devSessionId` is your `sessionid` cookie from your dev environment
and `liveSessionId` is your `sessionid` cookie from production.

## Todo

* Perhaps we could provide an interface so that we can log in to dev and live
through this and then this tool is able to get the session ids.