#!/usr/bin/env node --harmony-generators
'use strict';

var fs = require('fs');
var Twit = require('twit');
var suspend = require('suspend');
var resume = suspend.resume;
var request = require('superagent');
var cheerio = require('cheerio');

var knownFilename = __dirname + '/known.json';
var knownBeers;

try {
  knownBeers = require(knownFilename);
} catch (e) {
  knownBeers = [];
}

function beerIsKnown (beer, beers) {
  return beers.some(function (b) {
    return b.name === beer.name &&
      b.brewery === beer.brewery;
  });
}

// necessary because superagent kind of sucks, and it checks the arity of
// the callback function
function resumeSA () {
  var done = resume();
  return function (err, res) {
    if (err) return done(err);
    done(null, res);
  };
}

suspend.run(function* () {
  var res = yield request.get('http://citybeerstore.com/menu/', resumeSA());

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

  for (var i = 0; i < beers.length; i++) {
    var beer = beers[i];

    if (!beerIsKnown(beer, knownBeers)) {
      // make this more interesting?
      var tweet = beer.brewery + '\n' + beer.name;

      //var twit = new Twit(require('./auth'));
      //yield twit.post('statuses/update', { status: tweet }, resume());

      //console.log(data);

      //// wait 5 seconds to avoid a potential Twitter rate limiter
      //yield setTimeout(resume(), 5000);
      console.log(tweet);
      console.log();
    }
  }

  // save down the "known" beers list for next run
  //var json = JSON.stringify(beers, null, 2) + '\n';
  //yield fs.writeFile(knownFilename, json, resume());
});
