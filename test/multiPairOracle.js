const { parseEther, toBeHex, formatEther, FixedNumber } = require("ethers/utils");
// const { BigNumber } = require("bignumber.js");
const { expect } = require("chai");
const {
  loadFixture
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const {
  time
} = require("@nomicfoundation/hardhat-network-helpers")

const overrides = {
  gasLimit: 9999999
}

describe("MultiPairOracle", function () {

  const getAccounts = async () => {
    const [deployer, ipVault, founder, poorMan, trader, treasury] =
      await ethers.getSigners();
    return { deployer, ipVault, founder, poorMan, trader, treasury };
  };

  async function addLiquidity(buyer, pair, token0, token0Amount, token1, token1Amount) {
    await token0.transfer(pair.target, token0Amount);
    await token1.transfer(pair.target, token1Amount);
    await pair.mint(buyer, overrides);
  }

  function encodePrice(reserve0, reserve1) {
    return [reserve1 * (BigInt(2 ** 112)) / (reserve0), reserve0 * (BigInt(2 ** 112)) / (reserve1)];
  }

  function decodePrice(price) {
    return Number(price) / Number((2 ** 112));
  }

  async function deployBaseContracts() {
    const { deployer, ipVault, treasury } = await getAccounts();
    const contractFactory = await hre.ethers.getContractFactory("UniswapV2Factory");
    const factory = await contractFactory.deploy(deployer, deployer);
    await factory.waitForDeployment()
    console.log("UniswapV2Factory Contract address:", factory.target);

    const contractPair = await hre.ethers.getContractFactory("UniswapV2Pair");

    let data = contractPair.bytecode
    if (!data.startsWith('0x')) data = '0x' + data
    console.info('INIT_CODE_HASH:', ethers.keccak256(data))

    const wethContractFactory = await hre.ethers.getContractFactory("WETH9");
    const weth = await wethContractFactory.deploy();
    await weth.waitForDeployment()
    console.log("WETH Contract address:", weth.target);

    const router = await hre.ethers.deployContract("UniswapV2Router02", [factory.target, weth.target]);
    await router.waitForDeployment()
    console.log("UniswapV2Router02 Contract address:", router.target);


    return { deployer, factory, router, treasury };
  }

  before(async function () { });

  it('update', async () => {
    const { deployer, factory, router, treasury } = await deployBaseContracts();

    const tokenA = await hre.ethers.deployContract("ERC20", [parseEther("10000")]);
    await tokenA.waitForDeployment()
    const tokenB = await hre.ethers.deployContract("ERC20", [parseEther("10000")]);
    await tokenB.waitForDeployment()
    const tokenC = await hre.ethers.deployContract("ERC20", [parseEther("10000")]);
    await tokenC.waitForDeployment()

    await factory.createPair(tokenA.target, tokenB.target)
    const pairAddress = await factory.getPair(tokenA.target, tokenB.target)
    const pair = await ethers.getContractAt("UniswapV2Pair", pairAddress);
    token0Amount = ethers.parseUnits("100", 18);
    token1Amount = ethers.parseUnits("50", 18);
    await addLiquidity(deployer.address, pair, tokenA, parseEther("100"), tokenB, parseEther("50"));
    console.log("pair: %s, tokenA: %s, tokenB: %s", pair.target, tokenA.target, tokenB.target);

    await factory.createPair(tokenC.target, tokenB.target)
    const pairAddress2 = await factory.getPair(tokenC.target, tokenB.target)
    const pair2 = await ethers.getContractAt("UniswapV2Pair", pairAddress2);
    await addLiquidity(deployer.address, pair2, tokenC, parseEther("25"), tokenB, parseEther("50"));
    console.log("pair2: %s, tokenC: %s, tokenB: %s", pair2.target, tokenC.target, tokenB.target);

    const oracle = await hre.ethers.deployContract("MultiV2PairOracle", [factory.target]);
    await oracle.waitForDeployment();
    console.log("MultiV2PairOracle Contract address:", oracle.target);

    await expect(oracle.connect(treasury).addPair(tokenA, tokenB)).to.be.reverted;

    await oracle.addPair(tokenA, tokenB);
    await oracle.addPair(tokenC, tokenB);

    pairsLen = await oracle.allPairsLength();
    console.log("pairsLen: %d", pairsLen);
    expect(pairsLen).to.equal(2);

    const reserve0 = (await pair.getReserves())[0];
    const reserve1 = (await pair.getReserves())[1];
    console.log("Reserves: reserve0=%d, reserve1=%d", reserve0, reserve1);

    pairBlockTimeLast = (await pair2.getReserves())[2]
    await time.increaseTo(pairBlockTimeLast + BigInt(60 * 60 * 24));
    await oracle.update(overrides)

    oraclePairAddress = await oracle.getPair(tokenA.target, tokenB.target);
    expect(oraclePairAddress).to.equal(pairAddress);

    oraclePairAddress2 = await oracle.getPair(tokenC.target, tokenB.target);
    expect(oraclePairAddress2).to.equal(pairAddress2);

    pairOracle = await oracle.getOracle(pairAddress);
    expect(pairOracle.pair).to.equal(pairAddress);

    pairOracle2 = await oracle.getOracle(pairAddress2);
    expect(pairOracle2.pair).to.equal(pairAddress2);

    expect(await oracle.consult([tokenA.target, tokenB.target], token0Amount)).to.eq(token1Amount);
    expect(await oracle.consult([tokenB.target, tokenA.target], token1Amount)).to.eq(token0Amount);

    expect(await oracle.consult([tokenA.target, tokenB.target], BigInt(1e18))).to.eq(BigInt(0.5e18));
    expect(await oracle.consult([tokenB.target, tokenA.target], BigInt(0.5e18))).to.eq(BigInt(1e18));

    expect(await oracle.consult([tokenA.target, tokenB.target, tokenC.target], BigInt(1e18))).to.eq(BigInt(0.25e18));
    expect(await oracle.consult([tokenC.target, tokenB.target, tokenA.target], BigInt(0.25e18))).to.eq(BigInt(1e18));


    await expect(oracle.consult([tokenA.target], token0Amount)).to.be.revertedWith("INVALID_PATH_LEN");
    await expect(oracle.connect(treasury).removePair(tokenA, tokenB)).to.be.revertedWith("OwnableUnauthorizedAccount");

    await oracle.removePair(tokenB, tokenC);
    oraclePairAddress = await oracle.getPair(tokenC.target, tokenB.target);
    expect(oraclePairAddress).to.equal("0x0000000000000000000000000000000000000000");
    await expect(oracle.consult([tokenA.target, tokenB.target, tokenC.target], token0Amount)).to.be.revertedWith("pair does not exist");

  })
});
