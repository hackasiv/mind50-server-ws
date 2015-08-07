var mongoose = require("mongoose");

var mongodb = {
    user: "admin",
    password: "x63b1JH8tTpt",
    dbname: "mind50"
}

if (!process.env.OPENSHIFT_MONGODB_DB_HOST) {
    process.env.OPENSHIFT_MONGODB_DB_HOST =  "127.7.155.2";
}

if (!process.env.OPENSHIFT_MONGODB_DB_PORT) {
    process.env.OPENSHIFT_MONGODB_DB_PORT =  27017;
}

var connection_string = "mongodb://" + mongodb.user + ":" + mongodb.password + "@" + process.env.OPENSHIFT_MONGODB_DB_HOST + ":" + process.env.OPENSHIFT_MONGODB_DB_PORT + "/" + mongodb.dbname;

if (process.env.OPENSHIFT_MONGODB_DB_HOST == "127.0.0.1") {
    connection_string = "mongodb://" + process.env.OPENSHIFT_MONGODB_DB_HOST + ":" + process.env.OPENSHIFT_MONGODB_DB_PORT + "/" + mongodb.dbname
}

mongoose.connect(connection_string);

var GeoType = {
    type      : String,
    required  : true,
    enum      : ["Point", "LineString", "Polygon"],
    default   : "Point"
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
    _user : { type: Number, ref: "User" },
    message: String,
    created_time: { type: Date, default: Date.now }
});

userSchema.index({geo: "2dsphere"});

userSchema.methods.findNear = function (distance, cb) {
    console.log(distance, "distance");
    console.log(this.geo);
    var model = this.model("User");
    var user = this;
    var now = new Date();
    var delta = new Date(now.getTime() - 30 * 60000);
    // executing the command
    model.db.db.command({
        "geoNear": model.collection.name,
        "uniqueDocs": true,
        "includeLocs": true,
        "near": user.geo.coordinates,
        "spherical": true,
        "distanceField": "d",
        "maxDistance": distance / 6371000,
        "query": {last_time: { $gte : delta}}
      }, { dbName: mongodb.dbname }, function (err, doc) {
        cb(err, doc);
      }
    );


    //return .geoNear(this.geo, {maxDistance: distance, spherical: true});
}

var User    = mongoose.model("User", userSchema);
var Message = mongoose.model("Message", messageSchema);

module.exports.userSchema = userSchema;
module.exports.messageSchema = messageSchema;
module.exports.User = User;
module.exports.Message = Message;