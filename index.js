const { ethers } = require('ethers');
const { getInput, makeExecutorTransactions, prepareGasLimit, sendBundle } = require('./main');

getInput().then(
    input => makeExecutorTransactions(input)
    .then(executorTransactions => prepareGasLimit(input, executorTransactions)))
    .then(result => sendBundle(result)
);
