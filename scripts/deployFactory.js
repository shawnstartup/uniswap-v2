const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const contractFactory = await hre.ethers.getContractFactory("UniswapV2Factory");
    const factory = await contractFactory.deploy(deployer, deployer);
    await factory.waitForDeployment()
    console.log("UniswapV2Factory Contract address:", factory.target);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
