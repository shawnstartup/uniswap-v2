const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const factory = await hre.ethers.deployContract("UniswapV2Factory", [deployer], { gasLimit: 8000000 });
    await factory.waitForDeployment()
    console.log("UniswapV2Factory Contract address:", factory.target);

    const contractPair = await hre.ethers.getContractFactory("UniswapV2Pair");

    let data = contractPair.bytecode
    if (!data.startsWith('0x')) data = '0x' + data
    console.info('INIT_CODE_HASH:', ethers.keccak256(data))

    const weth = await hre.ethers.deployContract("WETH9", [], { gasLimit: 8000000 });
    await weth.waitForDeployment()
    console.log("WETH Contract address:", weth.target);

    const router = await hre.ethers.deployContract("UniswapV2Router02", [factory.target, weth.target], { gasLimit: 8000000 });
    await router.waitForDeployment()
    console.log("UniswapV2Router02 Contract address:", router.target);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
