const { ethers } = require("hardhat");

async function main() {
    const [manager] = await ethers.getSigners();
    console.log("manager contracts with the account:", manager.address);

    const oracle = await hre.ethers.getContractAt("MultiV2PairOracle", process.env.MULTI_PAIR_ORACLE);
    console.log("MultiV2PairOracle is load from:", oracle.target);

    console.log("TOKEN_A:", process.env.TOKEN_A);
    console.log("TOKEN_B:", process.env.TOKEN_B);

    try {
        let tx = await oracle.addPair(process.env.TOKEN_A, process.env.TOKEN_B);
        let receipt = await tx.wait(1);
        console.log(" oracle.addPair(tokenA,tokenB) tx.status:", receipt.status);
    } catch (error) {
        console.log(error);
    }

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
