#!/bin/env node
//  OpenShift sample Node application
var express = require('express');
var fs      = require('fs');
var mongoose = require('mongoose');

var mongodb = {
    user: 'admin',
    password: 'x63b1JH8tTpt',
    dbname: 'mind50'
}

if (!process.env.OPENSHIFT_MONGODB_DB_HOST) {
    process.env.OPENSHIFT_MONGODB_DB_HOST =  '127.7.155.2';
}

if (!process.env.OPENSHIFT_MONGODB_DB_PORT) {
    process.env.OPENSHIFT_MONGODB_DB_PORT =  27017;
}

var connection_string = "mongodb://" + mongodb.user + ":" + mongodb.password + "@" + process.env.OPENSHIFT_MONGODB_DB_HOST + ":" + process.env.OPENSHIFT_MONGODB_DB_PORT + "/" + mongodb.dbname;

if (process.env.OPENSHIFT_MONGODB_DB_HOST == '127.0.0.1') {
    connection_string = "mongodb://" + process.env.OPENSHIFT_MONGODB_DB_HOST + ":" + process.env.OPENSHIFT_MONGODB_DB_PORT + "/" + mongodb.dbname
}

mongoose.connect(connection_string);

var GeoType = {
    type      : String,
    required  : true,
    enum      : ['Point', 'LineString', 'Polygon'],
    default   : 'Point'
};

var Geo = {
    type        : GeoType,
    coordinates : [Number]
};

var userSchema = mongoose.Schema({
    _id: Number,
    wssid: String,
    nick: String,
    geo: Geo,
    last_time: { type: Date, default: Date.now }
});

var messageSchema = mongoose.Schema({
    _user : { type: Number, ref: 'User' },
    message: String,
    created_time: { type: Date, default: Date.now }
});

userSchema.index({geo: '2dsphere'});

userSchema.methods.findNear = function (distance, cb) {
    console.log(distance, 'distance');
    console.log(this.geo);
    var model = this.model('User');
    var user = this;
    // executing the command
    model.db.db.command({
        "geoNear": model.collection.name,
        "uniqueDocs": true,
        "includeLocs": true,
        "near": user.geo.coordinates,
        "spherical": true,
        "distanceField": "d",
        "maxDistance": distance / 6371000,
        "query": {}
      }, { dbName: mongodb.dbname }, function (err, doc) {
        cb(err, doc);
      }
    );


    //return .geoNear(this.geo, {maxDistance: distance, spherical: true});
}

var User    = mongoose.model('User', userSchema);
var Message = mongoose.model('Message', messageSchema);

/**
 *  Define the sample application.
 */
var SampleApp = function() {

    //  Scope.
    var self = this;


    /*  ================================================================  */
    /*  Helper functions.                                                 */
    /*  ================================================================  */

    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    self.setupVariables = function() {
        //  Set the environment variables we need.
        self.ipaddress = process.env.OPENSHIFT_NODEJS_IP;
        self.port      = process.env.OPENSHIFT_NODEJS_PORT || 8080;

        if (typeof self.ipaddress === "undefined") {
            //  Log errors on OpenShift but continue w/ 127.0.0.1 - this
            //  allows us to run/test the app locally.
            console.warn('No OPENSHIFT_NODEJS_IP var, using 127.0.0.1');
            self.ipaddress = "127.0.0.1";
        };
    };


    /**
     *  Populate the cache.
     */
    self.populateCache = function() {
        if (typeof self.zcache === "undefined") {
            self.zcache = { 'index.html': '' };
        }

        //  Local cache for static content.
        self.zcache['index.html'] = fs.readFileSync('./index.html');
    };


    /**
     *  Retrieve entry (content) from cache.
     *  @param {string} key  Key identifying content to retrieve from cache.
     */
    self.cache_get = function(key) { return self.zcache[key]; };


    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        if (typeof sig === "string") {
           console.log('%s: Received %s - terminating sample app ...',
                       Date(Date.now()), sig);
           process.exit(1);
        }
        console.log('%s: Node server stopped.', Date(Date.now()) );
    };


    /**
     *  Setup termination handlers (for exit and a list of signals).
     */
    self.setupTerminationHandlers = function(){
        //  Process on exit and signals.
        process.on('exit', function() { self.terminator(); });

        // Removed 'SIGPIPE' from the list - bugz 852598.
        ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
         'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
        ].forEach(function(element, index, array) {
            process.on(element, function() { self.terminator(element); });
        });
    };


    /*  ================================================================  */
    /*  App server functions (main app logic here).                       */
    /*  ================================================================  */

    /**
     *  Create the routing table entries + handlers for the application.
     */
    self.createRoutes = function() {
        self.routes = { };

        self.routes['/asciimo'] = {method: 'GET', handler: function(req, res) {
            var link = "http://i.imgur.com/kmbjB.png";
            res.send("<html><body><img src='" + link + "'></body></html>");
        }};

        self.routes['/'] = {method:'GET', handler: function(req, res) {
            res.setHeader('Content-Type', 'text/html');
            res.send(self.cache_get('index.html') );
        }};

        self.routes['/api/uid/:lat/:lon/:nick'] = {method: 'POST', handler: function(req, res) {
            self.createUser(req.params, function(errors, user) {
                res.json({errors: errors, user: user});
            });
        }};

        self.routes['/api/users'] = {method: 'GET', handler: function(req, res) {
            var users = User.find({}).exec(function(errors, users) {
                res.json(users);
            });
        }};

        self.routes['/api/users/:uid/near/:distance'] = {method: 'GET', handler: function(req, res) {
            self.getNearestUsers(req.params.uid, req.params.distance, function(errors, users) {
                console.log(errors, 'errors');
                res.json({errors: errors, users: users});
            });            
        }};

    };

    /**
     * [createUser description]
     * @param  {[type]}   data {name: 'Jasper', lat: 43.0001, lon: 123.0234453}
     * @param  {Function} cb   [description]
     * @return {[type]}        [description]
     */
    self.createUser = function(data, cb) {
        var last_id = 0;
        User.find({})
            .limit(1)
            .sort({ _id: -1 })
            .select({ _id: 1 })
            .exec(function(errors, users) {
                if (users && users.length) {
                    last_id = users[0]._id;
                }
                var new_id = 1 + last_id;
                var user = new User({
                    _id: new_id,
                    wssid: data.wssid,
                    nick: data.name ? data.name : 'Гость_' + new_id,
                    geo: {
                        coordinates: [data.lat, data.lon]
                    }
                });
                user.save(function(errors) {
                    cb(errors, user);
                });
            }); 
    };

    /**
     * [createMessage description]
     * @param  Number   uid  [description]
     * @param  Object   data {message: "Temp message"}
     * @param  {Function} cb   [description]
     * @return {[type]}        [description]
     */
    self.createMessage = function(uid, data, cb) {
        self.getUser(uid, function(errors, user) {
            var message = new Message({
                _user: user._id,
                message: data.message
            });
            message.save(function(errors){
                cb(errors, message);
            });
        })
    };

    /**
     * [findUserByWSSID description]
     * @param  {[type]}   wssid [description]
     * @param  {Function} cb    [description]
     * @return {[type]}         [description]
     */
    self.findUserByWSSID = function(wssid, cb) {
        User.findOne({wssid: wssid}).exec(function(errors, user) {
            cb(errors, user);
        });
    };

    /**
     * [getNearestUsers description]
     * @param  {[type]}   uid      [description]
     * @param  {[type]}   distance [description]
     * @param  {Function} cb       [description]
     * @return {[type]}            [description]
     */
    self.getNearestUsers = function(uid, distance, cb) {
        self.getUser(uid, function(errors, user) {
            if (!distance) {
                distance = 50;
            }

            user.findNear(distance, function(errors, results) {
                console.log(errors, 'errors');
                cb(errors, results.results);
            });
        });
    };

    /**
     * [getNearestUsersCount description]
     * @param  {[type]}   uid      [description]
     * @param  {[type]}   distance [description]
     * @param  {Function} cb       [description]
     * @return {[type]}            [description]
     */
    self.getNearestUsersCount = function(uid, distance, cb) {
        self.getNearestUsers(uid, distance, function(errors, users){
            cb(errors, users.length);
        });
    };

    self.getUser = function(uid, cb) {
        User.findOne({_id: uid}).exec(function(errors, user) {
            cb(errors, user);
        });
    }

    self.handleWS = function(message, ws, wss) {

        var getUser = function(cb) {
            User.findOne({wssid: ws.upgradeReq.headers['sec-websocket-key']}, function(errors, user){
                cb(errors, user);
            });
        };

        try {
            var message = JSON.parse(message);   
            if (message.action == 'signin') {
                if ('undefined' == typeof message.lat || 'undefined' == typeof message.lon) {
                    throw "Error";
                }
                self.createUser({
                    wssid: ws.upgradeReq.headers['sec-websocket-key'],
                    name: message.nick,
                    lat: message.lat,
                    lon: message.lon
                }, function(errors, user) {
                    self.getNearestUsersCount(user._id, 1000, function(errors, count) {
                        ws.send(JSON.stringify({errors: errors, data: user, action: 'signin', nearest_users: count}));
                    });
                });                  
            } else if (message.action == 'post') { // Request to post message(Mind)
                getUser(function(errors, user) {
                    self.createMessage(user._id, {message: message.message}, function(errors, message){
                        var msg = {
                            message: message.message,
                            user: {
                                _id: user._id,
                                _nick: user.nick
                            },
                            created_time: message.created_time.getTime()
                        };
                        self.getNearestUsers(user._id, 1000, function(errors, users) {
                            for(var i in users) {
                                var user = users[i].obj;
                                console.log(msg, 'msg');
                                wss.clients.forEach(function(client) {
                                    if (client.upgradeReq.headers['sec-websocket-key'] == user.wssid) {
                                        client.send(JSON.stringify({
                                            errors: errors, 
                                            data: msg,
                                            action: 'post'
                                        }));
                                    }
                                });
                            }                     
                        });
                    });
                });

            } else if (message.action == 'update_geo') { // Request to update position

            }
            // setInterval(function() {
            //     ws.send(JSON.stringify({message: 'Random message', uid: Math.random()}));
            // }, 3000);
        } catch(ex) {
            console.log(500, ex);
        }
    };

    /**
     *  Initialize the server (express) and create the routes and register
     *  the handlers.
     */
    self.initializeServer = function() {
        self.createRoutes();
        self.app = express();
        var expressWs = require('express-ws')(self.app);

        //  Add handlers for the app (from the routes).
        for (var r in self.routes) {
            self.app[self.routes[r].method.toLowerCase()](r, self.routes[r].handler);
        }

        self.app.ws('/ws', function(ws, req) {
          var wss = expressWs.getWss('/ws');
                    
          ws.on('message', function(msg) {
            // console.log(msg);
            self.handleWS(msg, ws, wss);
          });

          // console.log('socket', req.testing);
        });


    };


    /**
     *  Initializes the sample application.
     */
    self.initialize = function() {
        self.setupVariables();
        self.populateCache();
        self.setupTerminationHandlers();

        // Create the express server and routes.
        self.initializeServer();
    };


    /**
     *  Start the server (starts up the sample application).
     */
    self.start = function() {
        //  Start the app on the specific interface (and port).
        self.app.listen(self.port, self.ipaddress, function() {
            console.log('%s: Node server started on %s:%d ...',
                        Date(Date.now() ), self.ipaddress, self.port);
            User.remove({'_id': 0}, function(errors) {
                console.log(errors);
            });
        });
    };

};   /*  Sample Application.  */



/**
 *  main():  Main code.
 */
var zapp = new SampleApp();
zapp.initialize();
zapp.start();

