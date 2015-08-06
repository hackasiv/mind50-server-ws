# mind50-server-ws
Mind50 Server on Websockets


## Websockets Protocol description

At now websockets hosted on [**wss://mind50-grimmlab.rhcloud.com:8443/ws**](wss://mind50-grimmlab.rhcloud.com:8443/ws) (this is an OpenShift cloud whith our custom NodeJS code)

User ID is bound to openned connection. So, UID in each request is not needed more.

### SignIn
```javascript
message body: {"action": "signin", "lat": 41.000, "lon": 32.0002, nick: "Jasper"}
/* Request sample */
{"errors":null,"user":{"__v":0,"_id":8,"wssid":"MTMtMTQzODg4MDQ4MDI2MQ==","nick":"Гость_8","last_time":"2015-08-06T17:01:28.017Z","geo":{"coordinates":[41,32.0002],"type":"Point"}}}
```
### Post message
```javascript
message body: {"action": "post", "message": "Some text"}
```
