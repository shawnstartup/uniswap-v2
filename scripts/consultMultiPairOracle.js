const { ethers } = require("hardhat");

async function main() {
    const [manager] = await ethers.getSigners();
    console.log("manager contracts with the account:", manager.address);

    const oracle = await hre.ethers.getContractAt("MultiV2PairOracle", process.env.MULTI_PAIR_ORACLE);
    console.log("MultiV2PairOracle is load from:", oracle.target);

    console.log("TOKEN_A:", process.env.TOKEN_A);
    console.log("TOKEN_B:", process.env.TOKEN_B);
    console.log("TOKEN_C:", process.env.TOKEN_C);
    console.log("TOKEN_A_AMOUNT:", process.env.TOKEN_A_AMOUNT);

    amount = await oracle.consult([process.env.TOKEN_A, process.env.TOKEN_B], process.env.TOKEN_A_AMOUNT);
    console.log("consult amount:", amount);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
