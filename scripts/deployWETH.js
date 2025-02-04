const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);

    const wethContractFactory = await hre.ethers.getContractFactory("WETH9");
    const weth = await wethContractFactory.deploy();
    await weth.waitForDeployment()
    console.log("WETH Contract address:", weth.target);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
