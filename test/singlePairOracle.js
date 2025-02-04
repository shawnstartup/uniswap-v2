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

describe("Oracle", function () {

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


    return { deployer, factory, router };
  }

  before(async function () { });

  it('update', async () => {
    const { deployer, factory, router } = await deployBaseContracts();

    const tokenA = await hre.ethers.deployContract("ERC20", [parseEther("10000")]);
    await tokenA.waitForDeployment()
    const tokenB = await hre.ethers.deployContract("ERC20", [parseEther("10000")]);
    await tokenB.waitForDeployment()

    await factory.createPair(tokenA.target, tokenB.target)
    const pairAddress = await factory.getPair(tokenA.target, tokenB.target)
    const pair = await ethers.getContractAt("UniswapV2Pair", pairAddress);
    console.log("pair: %s, tokenA: %s, tokenB: %s", pair.target, tokenA.target, tokenB.target);

    token0Amount = ethers.parseUnits("100", 18);
    token1Amount = ethers.parseUnits("50", 18);
    await addLiquidity(deployer.address, pair, tokenA, parseEther("100"), tokenB, parseEther("50"));

    const oracle = await hre.ethers.deployContract("SingleV2PairOracle", [factory.target, tokenA.target, tokenB.target]);
    await oracle.waitForDeployment();
    console.log("SingleV2PairOracle Contract address:", oracle.target);

    const reserve0 = (await pair.getReserves())[0];
    const reserve1 = (await pair.getReserves())[1];
    console.log("Reserves: reserve0=%d, reserve1=%d", reserve0, reserve1);

    const blockTimestamp = (await pair.getReserves())[2]
    console.log("startTime: %d", blockTimestamp);

    await time.increaseTo(blockTimestamp + BigInt(60 * 60 * 23));
    pairBlockTimeLast = (await pair.getReserves())[2]
    await expect(oracle.update(overrides)).to.be.reverted
    await time.increaseTo(blockTimestamp + BigInt(60 * 60 * 24));
    blockTime = (await pair.getReserves())[2];
    expect(blockTime).to.eq(pairBlockTimeLast);

    await oracle.update(overrides)
    console.log("price0Average: %s, price1Average: %s", await oracle.price0Average(), await oracle.price1Average());
    console.log("decoded price0Average: %f, price1Average: %f", decodePrice(await oracle.price0Average()), decodePrice(await oracle.price1Average()));

    const expectedPrice = encodePrice(BigInt(token0Amount), BigInt(token1Amount));

    expect(BigInt(await oracle.price0Average())).to.eq(expectedPrice[0]);
    expect(BigInt(await oracle.price1Average())).to.eq(expectedPrice[1]);

    expect(await oracle.consult(tokenA.target, token0Amount)).to.eq(token1Amount);
    expect(await oracle.consult(tokenB.target, token1Amount)).to.eq(token0Amount);

    expect(await oracle.consult(tokenA.target, BigInt(1e18))).to.eq(BigInt(0.5e18));
    expect(await oracle.consult(tokenB.target, BigInt(0.5e18))).to.eq(BigInt(1e18));

    consultTokenB = await oracle.consult(tokenA.target, BigInt(1e18));
    console.log("consultTokenB", consultTokenB);

    await addLiquidity(deployer.address, pair, tokenA, parseEther("50"), tokenB, parseEther("100"));
    await expect(oracle.update(overrides)).to.be.reverted;

    await time.increaseTo(blockTimestamp + BigInt(2 * 60 * 60 * 24));
    await oracle.update(overrides);
    pairBlockTimeLast = (await pair.getReserves())[2];
    console.log("pairBlockTimeLast: %d,", pairBlockTimeLast);
    console.log("price0Average: %s, price1Average: %s", await oracle.price0Average(), await oracle.price1Average());
    console.log("price0Average: %f, price1Average: %f", decodePrice(await oracle.price0Average()), decodePrice(await oracle.price1Average()));

    await addLiquidity(deployer.address, pair, tokenA, parseEther("150"), tokenB, parseEther("0.00001"));

    await time.increaseTo(blockTimestamp + BigInt(3 * 60 * 60 * 24));
    pairBlockTimeLast = (await pair.getReserves())[2];
    console.log("pairBlockTimeLast: %d,", pairBlockTimeLast);
    await oracle.update(overrides);
    console.log("price0Average: %s, price1Average: %s", await oracle.price0Average(), await oracle.price1Average());
    console.log("price0Average: %f, price1Average: %f", decodePrice(await oracle.price0Average()), decodePrice(await oracle.price1Average()));

  })
});
