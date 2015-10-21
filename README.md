CityBeerTapsSF
==============
### Unofficial Twitter bot for @citybeerstore that tweets out new beers that go on tap

https://twitter.com/CityBeerTapsSF

Scrapes the City Beer Store "menu" webpage periodically, and when it detects
a new beer has been put on tap, it does an Untappd API beer query to try to
find a match. If a match is found then the ABV and/or IBUs are included
in the Tweet that gets crafted.
