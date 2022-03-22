You can use config.js or arguments.
================================ config.js ================================
if you want to use config.js, set config values correctly and just run `node index.js`
================================   args    ================================
if you want to use args, please run like this
node index.js --tx pay --node nodename --executor 18e9a00876fb92f4.......8f47a6ce7fd73ad94ab1 --sponsor 47a6ce7fd73ad94ab1.......18e9a00876fb92f48f --recipient 0x9AC9618029E29287306C75E17d030dB925EDA30e

--tx
  it can be one of followings. [pay, claim, claim-and-pay-all];
--node
  strong node name.
  you can wrap node name with double quote or single quote if name includes space blank.
  or you can replace with hyper.
  names are not case sensitive.