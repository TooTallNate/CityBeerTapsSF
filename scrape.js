#!/usr/bin/env node
'use strict';
const ms = require('ms');
const Twit = require('twit');
const fs = require('fs-extra');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const sleep = require('then-sleep');
const { inspect } = require('util');
const Untappd = require('node-untappd');

const twit = new Twit(require('./twitter-auth'));

// https://dev.twitter.com/overview/api/counting-characters
const MAX_TWEET = 140;

// https://dev.twitter.com/overview/t.co
// https://support.twitter.com/articles/78124-posting-links-in-a-tweet
const TWEET_URL_COUNT = 22;

// https://untappd.com/v/city-beer-store/3595
const VENUE_ID = 3595;
const VENUE_URL = 'https://untappd.com/v/city-beer-store/3595';

const knownFilename = __dirname + '/known.json';

let knownBeers;
try {
  knownBeers = new Set(require(knownFilename));
} catch (e) {
  knownBeers = new Set();
}

const untappdBeerURL = beer =>
  `https://untappd.com/b/${beer.beer_slug}/${beer.bid}`;

async function getMoreMenu(venueId, index, sectionId) {
  const url = `https://untappd.com/venue/more_menu/${venueId}/${
    index
  }?section_id=${sectionId}`;
  const res = await fetch(url, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
  const body = await res.json();
  const $ = cheerio.load(body.view);
  return getBeers($);
}

function getBeers($) {
  const beers = $('.beer-info');
  const ids = Array.from(
    $('.beer-info .beer-details a[data-href=":beer"]')
  ).map(a =>
    Number(
      $(a)
        .attr('href')
        .split('/')
        .pop()
    )
  );
  return ids;
}

async function tweetBeer(beer) {
  //console.log(beer);
  let tweet = `${beer.beer_name}\n${beer.brewery.brewery_name}`;

  if (beer.beer_abv) {
    const abv = '\nABV: ' + beer.beer_abv + '%';
    if (tweet.length + TWEET_URL_COUNT + 1 + abv.length <= MAX_TWEET) {
      tweet += abv;
    }
  }
  if (beer.beer_ibu) {
    const ibu = '\nIBUs: ' + beer.beer_ibu;
    if (tweet.length + TWEET_URL_COUNT + 1 + ibu.length <= MAX_TWEET) {
      tweet += ibu;
    }
  }
  if (beer.rating_score) {
    let rating = '\n';
    const rounded = Math.round(beer.rating_score);
    for (let i = 0; i < 5; i++) {
      rating += i < rounded ? '★' : '☆';
    }
    if (tweet.length + TWEET_URL_COUNT + 1 + rating.length <= MAX_TWEET) {
      tweet += rating;
    }
  }
  if (tweet.length + TWEET_URL_COUNT + 1 <= MAX_TWEET) {
    tweet += '\n' + untappdBeerURL(beer);
  }

  //console.log('-------------------------------')
  //console.log(tweet)
  //console.log('-------------------------------')

  // finally do the damn tweet!
  try {
    const data = await twit.post('statuses/update', { status: tweet });
    console.log(data);
  } catch (e) {
    console.log('tweet failed!\n%s', tweet);
    console.log(e);
  }
}

const wrap = fn => (...args) =>
  new Promise((resolve, reject) =>
    fn((err, res) => (err ? reject(err) : resolve(res.response)), ...args)
  );

async function main() {
  const untappd = new Untappd();
  const untappdAuth = require('./untappd-auth');
  untappd.setClientId(untappdAuth.clientId);
  untappd.setClientSecret(untappdAuth.clientSecret);

  const getBeerInfo = wrap(untappd.beerInfo.bind(untappd));

  const res = await fetch(VENUE_URL);
  const body = await res.text();
  const $ = cheerio.load(body);
  const sectionId = $('.menu-section-list')
    .attr('id')
    .split('-')
    .pop();
  //console.log({ sectionId });

  const firstBeers = getBeers($);
  //console.log({ firstBeers });

  const more = await getMoreMenu(VENUE_ID, firstBeers.length, sectionId);
  //console.log({ more });

  const beers = new Set([...firstBeers, ...more]);
  //console.log({ beers, count: beers.size });

  const newBeers = Array.from(beers).filter(bid => !knownBeers.has(bid));

  for (const BID of newBeers) {
    const { beer } = await getBeerInfo({ BID });
    await tweetBeer(beer);
    await sleep(ms('5s'));
  }

  // save down the "known" beers list for next run
  await fs.writeJSON(knownFilename, Array.from(beers));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
