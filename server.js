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

mongoose.connect("mongodb://" + mongodb.user + ":" + mongodb.password + "@" + process.env.OPENSHIFT_MONGODB_DB_HOST + ":" + process.env.OPENSHIFT_MONGODB_DB_PORT + "/" + mongodb.dbname);


var userSchema = mongoose.Schema({
    _id     : Number,
    nick: String,
    geo: {
        type: {
          type: String,
          required: true,
          enum: ['Point', 'LineString', 'Polygon'],
          default: 'Point'
        },
        coordinates: [Number]
    },
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
    return this.model('User').geoNear(this.geo, {maxDistance: distance, spherical: true}, cb);
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
            var last_id = 0;
            User.find({})
                .limit(1)
                .sort({ _id: -1 })
                .select({ _id: 1 })
                .exec(function(errors, users) {
                    if (users && users.length) {
                        var last_id = users[0]._id;
                    }
                    var new_id = ++last_id;
                    var user = new User({
                        _id: new_id,
                        nick: req.params.name ? req.params.name : 'Гость_' + new_id,
                        geo: {
                            coordinates: [req.params.lat, req.params.lon]
                        }
                    });
                    user.save(function(errors) {
                        res.json({errors: errors, user: user});
                    });
                });
        }};

        self.routes['/api/users'] = {method: 'GET', handler: function(req, res) {

            var users = User.find({}).exec(function(errors, users) {
                res.json(users);
            });
            
        }};

        self.routes['/api/users/:uid/near/:distance'] = {method: 'GET', handler: function(req, res) {
            var distance = 50;
            var users = User.findOne({_id: req.params.uid}).exec(function(errors, user) {
                if (req.params.distance) {
                    distance = req.params.distance;
                }
                user.findNear(distance, function(errors, users) {
                    res.json(users);
                });
            });
            
        }};

    };


    /**
     *  Initialize the server (express) and create the routes and register
     *  the handlers.
     */
    self.initializeServer = function() {
        self.createRoutes();
        self.app = express.createServer();

        //  Add handlers for the app (from the routes).
        for (var r in self.routes) {
            self.app[self.routes[r].method.toLowerCase()](r, self.routes[r].handler);
        }
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
        });
    };

};   /*  Sample Application.  */



/**
 *  main():  Main code.
 */
var zapp = new SampleApp();
zapp.initialize();
zapp.start();

