var index = 'http://data.gov.au/api/action/datastore_search?resource_id=31575e61-8524-4b4f-8471-156fe127878e';
var details = 'http://www.citycycle.com.au/service/stationdetails/brisbane/';

var async = require('async');
var parseString = require('xml2js').parseString;
var request = require('request');
var fs = require('fs');
var moment = require('moment');
var hbs = require('handlebars');

var popupTemplate = hbs.compile(fs.readFileSync('popup.html','utf-8'));

var opts = {
    trim: true,
    normalize: true,
    explicitArray:false,
    normalizeTags:true
}

var geoJson = {
    "type": "FeatureCollection",
    "features": []
};

var stationStatus = {};
try{
    stationStatus = JSON.parse(fs.readFileSync('laststatus.json'));
} catch(e){
    //Oh well.
}


function get(url,callback){
    console.log('getting',url);
    request(url,function(error,response,body){
        if (error || response.statusCode != 200) {
            console.error(new Date(),'Respose returned error',response ? response.statusCode : '');
            callback();
            return;
        }
        callback(body);
    });
}

function getIndex(){
    get(index,function(body){
        var json = JSON.parse(body);

        if(!json.success || !json.result.records){
            console.error(new Date(),'Response returned but gave bad data.');
            return;
        }

        json.result.records.forEach(function(station){
            getStations.push(station);
        });
    });
}

function number2color(number){
    if(number == 0){
        return 'red';
    } else if(number < 2) {
        return 'orange';
    } else {
        return 'green';
    }
}

var getStations = async.queue(function (station, callback) {
    console.log('requesting station',station.id);
    get(details+station["Station No"],function(xml){
        if(!xml){
            xml = '<xml></xml>';
        }
        parseString(xml, opts, function (err, result) {
            var statusIcon = 'grey';
            if(result && result.station){
                stationStatus[station.id] = result;
                var time = moment(result.station.updated*1000);
                result.ts = time.format();
                result.updated = time.format("ddd Do, hA");

                result.freeClass = number2color(result.station.free);
                result.avClass = number2color(result.station.available);
                statusIcon = number2color(Math.min(result.station.available,result.station.free));

                var available = result.station.available;
                if(available == 0){
                    result.avClass = 'red';
                } else if(available < 2) {
                    result.avClass = 'orange';
                } else {
                    result.avClass = 'green';
                }
                result.closed = result.station.open != "1";
                result.disonnected = result.station.connected != "1";
                result.show = !result.closed && !result.disconnected;
                if(!result.show){
                    statusIcon = 'grey';
                }
            } else {
                result = false;
            }

            var stationName = station['Main Street'] + '/' + station['Cross Street'];
            geoJson.features.push({
                "id": station['Station No'],
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [Number(station.Longitude), Number(station.Latitude)]
                },
                "properties": {
                    "description": popupTemplate({name:stationName,status:result}),
                    "category": "citycycle/citycycle-"+statusIcon
                }
            });
            callback();
        });
    });
}, 4);


// assign a callback
getStations.drain = function() {
    fs.writeFileSync('citycycle.json',JSON.stringify(geoJson));
    fs.writeFileSync('laststatus.json',JSON.stringify(stationStatus));
    fs.writeFileSync('archive/'+moment().format('YYYY-MM-DD')+'.json',JSON.stringify(stationStatus));
}

getIndex();