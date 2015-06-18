#!/usr/bin/env node --harmony-generators
'use strict';

var fs = require('fs');
var Twit = require('twit');
var suspend = require('suspend');
var resume = suspend.resume;
var request = require('superagent');
var cheerio = require('cheerio');
var Untappd = require('node-untappd');

// https://dev.twitter.com/overview/api/counting-characters
var MAX_TWEET = 140;

// https://dev.twitter.com/overview/t.co
// https://support.twitter.com/articles/78124-posting-links-in-a-tweet
var TWEET_URL_COUNT = 22;

// words to NOT include in the Untappd API beer search query
var blacklist = [
  'beer',
  'brewery',
  'brewing',
  'company',
  'the',
  'on',
  'and',
  'nitro'
];

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
// the callback function, and will incorrectly give the `res` as the `err`…
function resumeSA () {
  var done = resume();
  return function (err, res) {
    if (err) return done(err);
    done(null, res);
  };
}

suspend.run(function* () {
  var twit = new Twit(require('./twitter-auth'));

  var untappd = new Untappd();
  var untappdAuth = require('./untappd-auth');
  untappd.setClientId(untappdAuth.clientId);
  untappd.setClientSecret(untappdAuth.clientSecret);

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
      var tweet = beer.brewery + '\n' + beer.name;

      // try to get an Untappd beer search match,
      // lowercasing the brewery and beer name, and removing common
      // words to try and get better search result matches
      var query = (beer.brewery + ' ' + beer.name)
        .toLowerCase()
        .match(/\S+/g)
        .filter(function (word) {
          return -1 === blacklist.indexOf(word);
        })
        .join(' ');

      res = yield untappd.searchBeer(resume(), query);

      // if we got an Untappd API match, then attempt to include the
      // ABV, IBUs and URL to the beer on Untappd in the tweep
      if (res.response.found > 0) {
        var match = res.response.beers.items[0].beer;
        var url = 'https://untappd.com/beer/' + match.bid;

        // attempt to resolve the unsatisfying url to one with a nice slug
        res = yield request.head(url, resumeSA());
        if (res.headers.location) {
          url = res.headers.location;
        }

        if (match.beer_abv) {
          var abv = '\nABV: ' + match.beer_abv + '%';
          if (tweet.length + TWEET_URL_COUNT + 1 + abv.length <= MAX_TWEET) {
            tweet += abv;
          }
        }
        if (match.beer_ibu) {
          var ibu = '\nIBUs: ' + match.beer_ibu;
          if (tweet.length + TWEET_URL_COUNT + 1 + ibu.length <= MAX_TWEET) {
            tweet += ibu;
          }
        }
        if (tweet.length + TWEET_URL_COUNT + 1 <= MAX_TWEET) {
          tweet += '\n' + url;
        }
      }

      // finally do the damn tweet!
      var data = yield twit.post('statuses/update', { status: tweet }, resume());
      console.log(data);

      // wait 5 seconds to avoid a potential Twitter/Untappd rate limiters
      yield setTimeout(resume(), 5000);
    }
  }

  // save down the "known" beers list for next run
  var json = JSON.stringify(beers, null, 2) + '\n';
  yield fs.writeFile(knownFilename, json, resume());
});
