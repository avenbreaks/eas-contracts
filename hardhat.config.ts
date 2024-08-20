import { NamedAccounts } from './data/NamedAccounts';
import { DeploymentNetwork } from './utils/Constants';
import '@nomicfoundation/hardhat-toolbox';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import 'zksync-ethers';
import '@matterlabs/hardhat-zksync-solc';
import '@matterlabs/hardhat-zksync-deploy';
import '@matterlabs/hardhat-zksync-verify';
import '@nomiclabs/hardhat-solhint';
import 'dotenv/config';
import 'hardhat-contract-sizer';
import { HardhatUserConfig } from 'hardhat/config';
import { MochaOptions } from 'mocha';

interface EnvOptions {
  GLIDE_PROVIDER_URL?: string;
  GLIDE_ETHERSCAN_API_KEY?: string;
  PROFILE?: boolean;
}

const {
  GLIDE_PROVIDER_URL = 'https://rpc-api.glideprotocol.xyz',
  GLIDE_ETHERSCAN_API_KEY = 'empty',
  PROFILE: isProfiling
}: EnvOptions = process.env as any as EnvOptions;

const mochaOptions = (): MochaOptions => {
  let timeout = 600000;
  let grep;
  let reporter;

  if (isProfiling) {
    timeout = 0;
    reporter = 'mocha-silent-reporter';
  }

  return {
    timeout,
    color: true,
    bail: true,
    grep,
    reporter
  };
};

const config: HardhatUserConfig = {
  networks: {
    [DeploymentNetwork.Glide]: {
      chainId: 901,
      url: 'https://rpc-api.glideprotocol.xyz',
      saveDeployments: true,
      live: true,
      verify: {
        etherscan: { 
          apiKey: GLIDE_ETHERSCAN_API_KEY 
        },
        customChains: [
          {
            network: 'Glide',
            chainId: 901,
            urls: {
              apiURL: 'https://blockchain-explorer.glideprotocol.xyz/api',
              browserURL: 'https://blockchain-explorer.glideprotocol.xyz'
            }
          }
        ],
      }
    },
  },

  paths: {
    deploy: ['deploy/scripts']
  },

  solidity: {
    version: '0.8.26',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000000
      },
      evmVersion: 'paris', // Prevent using the `PUSH0` opcode
      metadata: {
        bytecodeHash: 'none' // Remove the metadata hash from the bytecode
      }
    }
  },

  typechain: {
    target: 'ethers-v6'
  },

  namedAccounts: NamedAccounts,

  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    disambiguatePaths: false
  },

  gasReporter: {
    currency: 'USD',
    enabled: isProfiling
  },

  zksolc: {
    version: '1.4.1',
    settings: {
      optimizer: {
        enabled: true,
        mode: '3'
      }
    }
  },

  mocha: mochaOptions()
};

export default config;
