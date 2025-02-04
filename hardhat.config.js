require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.6.6',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: 'istanbul',
        },
      },
      {
        version: '0.5.16'
      },
    ],
  },
  etherscan: {
    apiKey: {
      'arbitrum': process.env.ARBITRUM_ETHERSCAN_APIKEY,
      'arbitrum_sepolia': process.env.ARBITRUM_SEPOLIA_ETHERSCAN_APIKEY,
      'emc_sepolia': 'empty'
    },
    customChains: [
      {
        network: "arbitrum_sepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io/",
        },
      },
      {
        network: "emc_sepolia",
        chainId: 99879,
        urls: {
          apiURL: "https://sepolia.emcscan.com/api",
          browserURL: "https://sepolia.emcscan.com",
        },
      },
    ],
  },
  networks: {
    hardhat: {},
    arbitrum_sepolia: {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: [process.env.PRIVATE_KEY],
    },
  }
};
