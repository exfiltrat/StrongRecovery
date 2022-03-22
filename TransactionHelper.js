const ethers = require("ethers");
const POLYGONBLOCK_CONTRACT_ADDRESS = "0xC5622f143972A5Da6aaBC5F5379311eE5EB48568";
const POLYGONBLOCK_CONTRACT_ABI = [
    {"inputs":[{"internalType":"uint256","name":"_timestamp","type":"uint256"},{"internalType":"address","name":"_toStrongPool","type":"address"},{"internalType":"uint256","name":"_fromNode","type":"uint256"},{"internalType":"uint256","name":"_toNode","type":"uint256"}],"name":"claimAll","outputs":[],"stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"address","name":"_entity","type":"address"},{"internalType":"uint256","name":"_timestamp","type":"uint256"}],"name":"getEntityRewards","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"_entity","type":"address"},{"internalType":"uint256","name":"_timestamp","type":"uint256"},{"internalType":"uint256","name":"_fromNode","type":"uint256"},{"internalType":"uint256","name":"_toNode","type":"uint256"}],"name":"getNodesClaimingFee","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"_fromNode","type":"uint256"},{"internalType":"uint256","name":"_toNode","type":"uint256"}],"name":"payAll","outputs":[],"stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"address","name":"_entity","type":"address"},{"internalType":"uint256","name":"_nodeId","type":"uint256"}],"name":"getNodeRecurringFee","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"_entity","type":"address"},{"internalType":"uint256","name":"_fromNode","type":"uint256"},{"internalType":"uint256","name":"_toNode","type":"uint256"}],"name":"getNodesRecurringFee","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"_nodeId","type":"uint256"}],"name":"pay","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"payable","type":"function"}
];
const STRONGBLOCK_CONTRACT_ADDRESS = "0xFbdDaDD80fe7bda00B901FbAf73803F2238Ae655";
const STRONGBLOCK_CONTRACT_ABI = [
    {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"entityNodeCount","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"recurringNaaSFeeInWei","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"entity","type":"address"},{"internalType":"uint128","name":"nodeId","type":"uint128"}],"name":"canBePaid","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"nodeCount","type":"uint256"}],"name":"payAll","outputs":[],"stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"address","name":"entity","type":"address"},{"internalType":"uint256","name":"blockNumber","type":"uint256"}],"name":"getRewardAll","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"claimingFeeNumerator","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"claimingFeeDenominator","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"blockNumber","type":"uint256"},{"internalType":"bool","name":"toStrongPool","type":"bool"}],"name":"claimAll","outputs":[],"stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"address","name":"entity","type":"address"},{"internalType":"uint128","name":"nodeId","type":"uint128"}],"name":"getNodeId","outputs":[{"internalType":"bytes","name":"","type":"bytes"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"bytes","name":"","type":"bytes"}],"name":"entityNodeIsBYON","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"recurringFeeInWei","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"uint128","name":"nodeId","type":"uint128"}],"name":"payFee","outputs":[],"stateMutability":"payable","type":"function"}
];
const STRONG_CONTRACT_ADDRESS = "0x990f341946A3fdB507aE7e52d17851B87168017c";
const STRONG_CONTRACT_ABI = [
    {"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}
];

const getEthPayAllTx = async (rpc, entity) => {
    const provider = new ethers.providers.JsonRpcProvider(rpc);
    const contract = new ethers.Contract(STRONGBLOCK_CONTRACT_ADDRESS, STRONGBLOCK_CONTRACT_ABI, provider);
    const values = await Promise.all([contract.entityNodeCount(entity), contract.recurringNaaSFeeInWei()]);
    const canBePaidResult = await Promise.all([...Array(values[0].toNumber()).keys()].map((_, idx) => contract.canBePaid(entity, idx + 1)));
    const nodeCount = canBePaidResult.reduce((nc, item) => nc + item, 0);
    return {
        transaction: await contract.populateTransaction.payAll(nodeCount, {value: values[1].mul(nodeCount)}),
        description: "EthPayAllTx"
    }
}

const getEthPayTx = async (rpc, entity, nodeId) => {
    const provider = new ethers.providers.JsonRpcProvider(rpc);
    const contract = new ethers.Contract(STRONGBLOCK_CONTRACT_ADDRESS, STRONGBLOCK_CONTRACT_ABI, provider);
    const id = await contract.getNodeId(entity, nodeId);
    const isByOn = await contract.entityNodeIsBYON(id);
    const price = isByOn ? await contract.recurringFeeInWei(): await contract.recurringNaaSFeeInWei();
    return {
        transaction: await contract.populateTransaction.payFee(nodeId, {value: price}),
        description: "EthPayTx"
    }
}

const getEthClaimTx = async (rpc, entity) => {
    const provider = new ethers.providers.JsonRpcProvider(rpc);
    const contract = new ethers.Contract(STRONGBLOCK_CONTRACT_ADDRESS, STRONGBLOCK_CONTRACT_ABI, provider);
    const block = await provider.getBlock("latest");
    const values = await Promise.all([contract.getRewardAll(entity, block.number), contract.claimingFeeNumerator(), contract.claimingFeeDenominator()]);
    return {
        transaction: await contract.populateTransaction.claimAll(block.number, 0, {value: values[0].mul(values[1]).div(values[2])}),
        reward: values[0],
        description: "EthClaimTx"
    }
}

const getTokenTransferTx = async (recipient, amount) => {
    const contract = new ethers.Contract(STRONG_CONTRACT_ADDRESS, STRONG_CONTRACT_ABI);
    return {
        transaction: await contract.populateTransaction.transfer(recipient, amount),
        description: "TokenTransferTx"
    } 
}

const getPolyClaimTx = async (rpc, entity) => {
    const provider = new ethers.providers.JsonRpcProvider(rpc);
    const contract = new ethers.Contract(POLYGONBLOCK_CONTRACT_ADDRESS, POLYGONBLOCK_CONTRACT_ABI, provider);
    const timestamp = Math.floor(Date.now() / 1000) - 10 * 60;
    const values = await Promise.all([contract.getEntityRewards(entity, timestamp), contract.getNodesClaimingFee(entity, timestamp, 0, 0)]);
    return {
        transaction: await contract.populateTransaction.claimAll(timestamp, "0x0000000000000000000000000000000000000000", 0, 0, {value: values[1]}),
        reward: values[0],
        description: "PolyClaimTx"
    }
}

const getPolyPayAllTx = async (rpc, entity) => {
    const provider = new ethers.providers.JsonRpcProvider(rpc);
    const contract = new ethers.Contract(POLYGONBLOCK_CONTRACT_ADDRESS, POLYGONBLOCK_CONTRACT_ABI, provider);
    const fee = await contract.getNodesRecurringFee(entity, 0, 0);
    return {
        transaction: await contract.populateTransaction.payAll(0, 0, {value: fee}),
        description: "PolyPayAllTx"
    };
}

const getPolyPayTx = async (rpc, entity, nodeId) => {
    const provider = new ethers.providers.JsonRpcProvider(rpc);
    const contract = new ethers.Contract(POLYGONBLOCK_CONTRACT_ADDRESS, POLYGONBLOCK_CONTRACT_ABI, provider);
    const fee = await contract.getNodeRecurringFee(entity, nodeId);
    return {
        transaction: await contract.populateTransaction.pay(nodeId, {value: fee}),
        description: "PolyPayTx"
    };
}

module.exports = {
    getEthClaimTx, getPolyClaimTx, getEthPayAllTx, getPolyPayAllTx, getEthPayTx, getPolyPayTx, getTokenTransferTx
}