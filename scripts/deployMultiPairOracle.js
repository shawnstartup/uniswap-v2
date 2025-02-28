const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const oracle = await hre.ethers.deployContract("MultiV2PairOracle", [process.env.UNISWAP_V2_FACTORY]);
    await oracle.waitForDeployment()
    console.log("MultiV2PairOracle Contract address:", oracle.target);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
