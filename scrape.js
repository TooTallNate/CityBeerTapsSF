
var fs = require('fs');
var Twit = require('twit');
var request = require('superagent');
var cheerio = require('cheerio');

var knownFilename = __dirname + '/known.json';
var knownBeers;

try {
  knownBeers = require(knownFilename);
} catch (e) {
  knownBeers = [];
}

request.get('http://citybeerstore.com/menu/', function (err, res) {
  if (err) throw err;
  var $ = cheerio.load(res.text);
  var ul = $('.taps ul.beers');
  var lis = ul.find('li.beer');
  var beers = [];
  lis.each(function (n, li) {
    var brewery = $(li).find('.brewery').text().trim();
    var name = $(li).find('.name').text().trim();
    var notes = $(li).find('.tasting-notes').text().trim();

    var dash = name.indexOf('-');
    if (-1 !== dash) {
      // sometimes they separate the "name" and description
      // of the beer with a hyphen. give the leftover to `notes`
      notes = name.substring(dash + 1) + notes;
      name = name.substring(0, dash);
    }

    beers.push({
      brewery: brewery,
      name: name,
      notes: notes
    });
  });

  var list = beers.slice();

  function beerIsKnown (beer, beers) {
    return beers.some(function (b) {
      return b.name === beer.name &&
        b.brewery === beer.brewery;
    });
  }

  function next () {
    if (!list.length) return finish();
    var beer = list.shift();

    if (!beerIsKnown(beer, knownBeers)) {
      // make this more interesting?
      var tweet = beer.brewery + '\n' + beer.name;

      var twit = new Twit(require('./auth'));
      twit.post('statuses/update', { status: tweet }, ontweet);
    } else {
      next();
    }
  }

  function ontweet (err, data, response) {
    if (err) throw err;

    console.log(data);

    // wait 5 seconds to avoid a potential Twitter rate limiter
    setTimeout(next, 5000);
  }

  function finish () {
    // save down the "known" beers list for next run
    fs.writeFile(knownFilename, JSON.stringify(beers, null, 2) + '\n', function (err) {
      if (err) throw err;
    });
  }

  next();
});


