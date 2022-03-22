const ethers = require('ethers');
const flashbot = require('@flashbots/ethers-provider-bundle');
const {GraphQLClient} = require('graphql-request');
const GetNodes = require('./graphql.js');
const graphQLClient = new GraphQLClient('https://gql.strongblock.com', {});
const TransactionHelper = require('./TransactionHelper');
const ZeroBigNum = ethers.BigNumber.from(0);
const maxGasLimit = 1000000;

const sendBundleTransactions = async (flashbotsProvider, signedBundles, targetBlockNumber) => {
    console.log("trying to send to target BlockNumber: ", targetBlockNumber);
    const bundleResponse = await flashbotsProvider.sendRawBundle(signedBundles, targetBlockNumber);
    if ('error' in bundleResponse) {
        throw new Error(bundleResponse.error.message)
    }
        
    const bundleResolution = await bundleResponse.wait();
    if (bundleResolution === flashbot.FlashbotsBundleResolution.BundleIncluded) {
        console.log(`Congrats, included in ${targetBlockNumber}`)
        process.exit(0)
    } else if (bundleResolution === flashbot.FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
        console.log(`Not included in ${targetBlockNumber}`);
        console.log(targetBlockNumber, await flashbotsProvider.getBundleStats(bundleResponse.bundleHash, targetBlockNumber));
    } else if (bundleResolution === flashbot.FlashbotsBundleResolution.AccountNonceTooHigh) {
        console.log(targetBlockNumber, "Nonce too high, bailing")
        console.log(targetBlockNumber, await flashbotsProvider.getBundleStats(bundleResponse.bundleHash, targetBlockNumber));
    }
}

module.exports.sendBundle = async ({provider, flashbotsProvider, signedBundle}) => {
    console.log("sending bundle...");
    const blockNumber = await provider.getBlockNumber();
    for(var i = 1; i <= 6; i ++)
        sendBundleTransactions(flashbotsProvider, signedBundle, blockNumber + i);   
    flashbotsProvider.simulate(signedBundle, "latest").then(console.log);
}

module.exports.prepareGasLimit = async(input, transactions) => {
    console.log("Preparing gas limit...");
    const provider = new ethers.providers.JsonRpcProvider(input.rpc);
    const walletRelay = new ethers.Wallet(input.relay);
    const walletExecutor = new ethers.Wallet(input.executor);
    const walletSponsor = new ethers.Wallet(input.sponsor);
    const net = input.rpc.indexOf("goerli") > -1 ? "goerli": "mainnet";
    const flashbotsProvider = net == "goerli" ? await flashbot.FlashbotsBundleProvider.create(provider, walletRelay, "https://relay-goerli.epheph.com/"): await flashbot.FlashbotsBundleProvider.create(provider, walletRelay);

    var [balanceExecutor, gasPrice, nonceExecutor, nonceSponsor] = await Promise.all([provider.getBalance(input.executorAddress), provider.getGasPrice(), provider.getTransactionCount(input.executorAddress), provider.getTransactionCount(input.sponsorAddress)]);
    gasPrice = gasPrice.mul("2");
    console.log(ethers.utils.formatEther(balanceExecutor), ethers.utils.formatUnits(gasPrice, 9));
    var bundlesWithGasLimit = await Promise.all(transactions.map(async(tx, idx) => {
        if(tx.description == "TokenTransferTx") {
            return {
                transaction: {
                    ...tx.transaction,
                    gasPrice: gasPrice,
                    gasLimit: 80000,
                    chainId: 1,
                    nonce: nonceExecutor + idx,
                    type: 0
                },
                signer: walletExecutor
            }
        }
        var bundle = [
            {
                transaction: {
                    to: input.executorAddress,
                    value: gasPrice.mul(maxGasLimit).add(tx.transaction.value || ZeroBigNum).sub(balanceExecutor),
                    gasPrice: gasPrice,
                    gasLimit: 21000,
                    chainId: 1,
                    nonce: nonceSponsor,
                    type: 0
                },
                signer: walletSponsor
            }, 
            {
                transaction: {
                    ...tx.transaction,
                    gasPrice: gasPrice,
                    gasLimit: maxGasLimit,
                    chainId: 1,
                    nonce: nonceExecutor,
                    type: 0
                },
                signer: walletExecutor
            }
        ]
        console.log(tx.description);
        printBundle(bundle);
        const signedBundle = await flashbotsProvider.signBundle(bundle);
        const simulateResult = await flashbotsProvider.simulate(signedBundle, "latest").catch(console.log);
        if(simulateResult && simulateResult.results && !simulateResult.firstRevert) {
            return {
                transaction: {
                    ...tx.transaction,
                    gasPrice: gasPrice,
                    gasLimit: simulateResult.results[1].gasUsed,
                    chainId: 1,
                    nonce: nonceExecutor + idx,
                    type: 0
                },
                signer: walletExecutor
            }
        } else {
            console.log(tx.description, simulateResult);
            process.exit(1);
        }
    }));
    printBundle(bundlesWithGasLimit);

    console.log("Preparing bundle...");
    var maxLimit = 0, totalLimit = 0, extraLimit, sponsoredValue = ZeroBigNum;
    bundlesWithGasLimit.map(tx => {
        if(maxLimit < tx.transaction.gasLimit) maxLimit = tx.transaction.gasLimit;
        totalLimit += tx.transaction.gasLimit;
        sponsoredValue = sponsoredValue.add(tx.transaction.value || ZeroBigNum);
    })
    extraLimit = Math.max(Math.floor(maxLimit / 20), 10000);
    const bundle1 = bundlesWithGasLimit.map(tx => {
        return {
            transaction: {
                ...tx.transaction,
                gasLimit: tx.transaction.gasLimit + extraLimit,
                gasPrice: gasPrice
            },
            signer: tx.signer
        }
    });
    const bundle2 = [{
        transaction: {
            to: input.executorAddress,
            value: gasPrice.mul(totalLimit + extraLimit).add(sponsoredValue).sub(balanceExecutor),
            gasPrice: gasPrice,
            gasLimit: 21000,
            chainId: 1,
            nonce: nonceSponsor,
            type: 0
        },
        signer: walletSponsor
    }, ...bundle1];
    console.log("Final Bundle");
    printBundle(bundle2);
    return {provider, flashbotsProvider, signedBundle: await flashbotsProvider.signBundle(bundle2)};
}

const printBundle = (txs) => {
    console.table(txs.map(tx => {
        return {
            from: tx.signer.address,
            to: tx.transaction.to, 
            value: ethers.utils.formatEther(tx.transaction.value || ZeroBigNum),
            data: tx.transaction.data ? tx.transaction.data.slice(0, 20) + "..." + tx.transaction.data.slice(-10): "",
            gasPrice: ethers.utils.formatUnits(tx.transaction.gasPrice, 9),
            gasLimit: tx.transaction.gasLimit,
        }
    }));
}

const printTransactions = (txs) => {
    console.table(txs.map(tx => {
        return {
            description: tx.description,
            to: tx.transaction.to, 
            value: ethers.utils.formatEther(tx.transaction.value || ZeroBigNum),
            data: tx.transaction.data ? tx.transaction.data.slice(0, 20) + "..." + tx.transaction.data.slice(-10): ""
        }
    }));
}

module.exports.makeExecutorTransactions = async (input) => {
    console.log("building executor transactions...");
    var transactions = [], rewards = ZeroBigNum;
    if(input.tx == "claim") {
        if(input.ethNodeCount) {
            const {transaction, reward, description} = await TransactionHelper.getEthClaimTx(input.rpc, input.executorAddress);
            transactions.push({transaction, description}); rewards = rewards.add(reward);
        }
        if(input.polyNodeCount) {
            const {transaction, reward, description} = await TransactionHelper.getPolyClaimTx(input.rpc, input.executorAddress);
            transactions.push({transaction, description}); rewards = rewards.add(reward);
        }
    }
    if(input.tx == "pay") {
        if(input.node == "all") {
            if(input.ethNodeCount) {
                const {transaction, description} = await TransactionHelper.getEthPayAllTx(input.rpc, input.executorAddress);
                transactions.push({transaction, description});
            }
            if(input.polyNodeCount) {
                const {transaction, description} = await TransactionHelper.getPolyPayAllTx(input.rpc, input.executorAddress);
                transactions.push({transaction, description});
            }    
        } else {
            if(input.nodeType == "ETHEREUM") {
                const {transaction, description} = await TransactionHelper.getEthPayTx(input.rpc, input.executorAddress, input.nodeId);
                transactions.push({transaction, description});
            }
            if(input.nodeType == "POLYGON") {
                const {transaction, description} = await TransactionHelper.getPolyPayTx(input.rpc, input.executorAddress, input.nodeId);
                transactions.push({transaction, description});
            }
        }
    }
    if(input.tx == "claim-and-pay-all") {
        if(input.ethNodeCount) {
            const {transaction, reward, description} = await TransactionHelper.getEthClaimTx(input.rpc, input.executorAddress);
            transactions.push({transaction, description}); rewards = rewards.add(reward);
        }
        if(input.polyNodeCount) {
            const {transaction, reward, description} = await TransactionHelper.getPolyClaimTx(input.rpc, input.executorAddress);
            transactions.push({transaction, description}); rewards = rewards.add(reward);
        }
        if(input.ethNodeCount) {
            const {transaction, description} = await TransactionHelper.getEthPayAllTx(input.rpc, input.executorAddress);
            transactions.push({transaction, description});
        }
        if(input.polyNodeCount) {
            const {transaction, description} = await TransactionHelper.getPolyPayAllTx(input.rpc, input.executorAddress);
            transactions.push({transaction, description});
        }
    }
    if(rewards.gt(0)) {
        const {transaction, description} = await TransactionHelper.getTokenTransferTx(input.recipient, rewards);
        transactions.push({transaction, description});
    }
    
    printTransactions(transactions);
    const sponsoredValue = transactions.reduce((sv, tx) => sv.add(tx.transaction.value || ZeroBigNum), ZeroBigNum);
    console.log("sponsoredValue", ethers.utils.formatEther(sponsoredValue), "eth,  rewards", ethers.utils.formatEther(rewards), "STRONG");
    return transactions;
}

function reduceKey(key) {
    return key.substr(0, 6) + '...' + key.substr(-4);
}
function printConfig(config) {
    const config1 = {
        ...config,
        executor: reduceKey(config.executor),
        sponsor: reduceKey(config.sponsor),
        relay: reduceKey(config.relay),
    }
    console.log(config1);
}

module.exports.getInput = async () => {
    const buildOptions = require('minimist-options');
    const options = buildOptions({
        recipient: {
            type: 'string'
        }
    })
    //const args = require('minimist')(process.argv.slice(2), options);

    const { config } = require('./config');
    var rlt = {
        tx: args.tx || config.tx || "",
        node: args.node || config.node || "",
        executor: args.executor || config.executor || "",
        sponsor: args.sponsor || config.sponsor || "",
        recipient: args.recipient || config.recipient || "",
        rpc: args.rpc || config.rpc || "https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
        relay: args.relay || config.relay || "ea056590f0d77c67ee1fce8bc68ed6d188e677611725fd8e1290c62aa4004424", //ZeroSigner addr: 0x0244b62043c756dB76936A41032D613d8682219d
    }
    if(!rlt.tx) { console.log("require tx"); process.exit(1); }
    if(rlt.tx == "pay" && !rlt.node) { console.log("require node"); process.exit(1); }
    if(!rlt.executor) { console.log("require executor"); process.exit(1); }
    if(!rlt.sponsor) { console.log("require sponsor"); process.exit(1); }
    if(!rlt.recipient) { console.log("require recipient"); process.exit(1); }
    
    const walletExecutor = new ethers.Wallet(rlt.executor);
    const walletSponsor = new ethers.Wallet(rlt.sponsor);
    rlt.executorAddress = walletExecutor.address;
    rlt.sponsorAddress = walletSponsor.address;
    const nodeData = await graphQLClient.request(GetNodes, {"address": walletExecutor.address, "skip": 0, "take": 100});
    
    if(rlt.tx == "pay" && rlt.node != "all") {
        var nodeId = -1, nodeType;
        nodeData.nodes.items.map(node => {
            if(node.name.toLowerCase().replace(/ /g, "_") == rlt.node.toLowerCase().replace(/ /g, "_")) {
                nodeId = node.node_id;
                nodeType = node.type;
            }
        })
        if(nodeId == -1) {
            if(nodeData.nodes.items.length == 0) console.log("You have no Nodes. Please check your executor address");
            else console.log("Cannot Find Node. Use One of the Followings\n" + JSON.stringify(nodeData.nodes.items.map(node => node.name.toLowerCase().replace(/ /g, "_"))));
            process.exit(1);
        }
        rlt.nodeId = nodeId;
        rlt.nodeType = nodeType;
    } else {
        var ethCount = 0, polyCount = 0;
        nodeData.nodes.items.map(node => {
            if(node.type == "ETHEREUM") ethCount ++; 
            if(node.type == "POLYGON") polyCount ++;
        });
        rlt.ethNodeCount = ethCount;
        rlt.polyNodeCount = polyCount;
    }
    printConfig(rlt);
    return rlt; 
}